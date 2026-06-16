import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, sep, join } from 'node:path';
import { tmpdir } from 'node:os';
import { Router } from 'express';
import { resolveExecutorBinary } from '../cli/binary-resolver.ts';
import { spawnCli, tailLines } from '../engine/executors/cli-spawn.ts';

/**
 * /api/docs/:scope        — list .md files in the scope
 * /api/docs/:scope/:file  — return raw markdown body
 *
 * Scopes are an allow-list of workspace subdirectories. The resolved
 * absolute path of the requested file is verified to live under its scope
 * root — that's the path-traversal barrier ('..' or absolute paths cannot
 * escape).
 */

const FILE_RE = /^[\w][\w.-]*\.md$/;

export type DocsRouterDeps = {
  /** Map scope name → absolute directory path. Only these scopes are reachable. */
  scopes: Record<string, string>;
};

export function docsRouter(deps: DocsRouterDeps): Router {
  const r = Router();

  r.get('/docs/:scope', async (req, res) => {
    const scope = req.params.scope;
    const root = scope ? deps.scopes[scope] : undefined;
    if (!scope || !root) {
      res.status(404).json({ error: 'unknown_scope' });
      return;
    }
    try {
      const entries = await readdir(root, { withFileTypes: true });
      const names = entries
        .filter((e) => e.isFile() && FILE_RE.test(e.name))
        .map((e) => e.name)
        .sort();
      const files = await Promise.all(
        names.map(async (name) => {
          try {
            const s = await stat(resolve(root, name));
            return { name, size: s.size, mtime: s.mtimeMs };
          } catch {
            return { name, size: 0, mtime: 0 };
          }
        }),
      );
      res.json({ scope, files });
    } catch (err) {
      // A scope dir is created lazily by the agent that first writes into it
      // (memory/reports don't exist until handover/reports are produced). Until
      // then the scope is simply empty — not an error. Mirrors the single-file
      // handler's ENOENT → not-found handling.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        res.json({ scope, files: [] });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: 'list_failed', message });
    }
  });

  r.get('/docs/:scope/:file', async (req, res) => {
    const scope = req.params.scope;
    const file = req.params.file;
    const root = scope ? deps.scopes[scope] : undefined;
    if (!scope || !root) {
      res.status(404).json({ error: 'unknown_scope' });
      return;
    }
    if (!file || !FILE_RE.test(file)) {
      res.status(400).json({ error: 'invalid_filename' });
      return;
    }
    const target = resolve(root, file);
    // Path-traversal barrier: the resolved file must live directly under root.
    if (!target.startsWith(root + sep)) {
      res.status(403).json({ error: 'outside_scope' });
      return;
    }
    try {
      const body = await readFile(target, 'utf8');
      res.json({ scope, file, body });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: 'read_failed', message });
    }
  });

  // POST /api/docs/:scope/:file/explain — ask the owning agent about selected
  // lines and get a real answer. Stateless one-shot: the client sends the full
  // conversation `history` each turn, so follow-ups continue the thread without
  // server-side session state. Read-only (the model explains, it never edits).
  r.post('/docs/:scope/:file/explain', async (req, res) => {
    const scope = req.params.scope;
    const file = req.params.file;
    const root = scope ? deps.scopes[scope] : undefined;
    if (!scope || !root) {
      res.status(404).json({ error: 'unknown_scope' });
      return;
    }
    if (!file || !FILE_RE.test(file)) {
      res.status(400).json({ error: 'invalid_filename' });
      return;
    }
    const target = resolve(root, file);
    if (!target.startsWith(root + sep)) {
      res.status(403).json({ error: 'outside_scope' });
      return;
    }

    const body = (req.body ?? {}) as { question?: unknown; quote?: unknown; history?: unknown };
    if (typeof body.question !== 'string' || body.question.trim().length === 0) {
      res.status(400).json({ error: 'missing_question' });
      return;
    }
    const question = body.question.trim();
    const quote = typeof body.quote === 'string' ? body.quote.slice(0, 4000) : '';
    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            (h): h is { role: string; text: string } =>
              !!h && typeof (h as { text?: unknown }).text === 'string',
          )
          .slice(-12)
          .map((h) => ({ role: h.role === 'agent' ? 'agent' : 'prime', text: String(h.text) }))
      : [];

    const binary = resolveExecutorBinary('claude');
    if (!binary) {
      res.status(503).json({ error: 'explain_unavailable', message: 'claude CLI not found' });
      return;
    }

    let docBody = '';
    try {
      docBody = await readFile(target, 'utf8');
    } catch {
      /* best-effort context */
    }

    const systemPrompt = [
      'You are a Kortext agent explaining a project document to +prime, the human owner.',
      'Answer in the SAME language +prime writes in (Turkish if they write Turkish).',
      'Be concise and concrete, grounded ONLY in the document provided.',
      'If the answer is not in the document, say so plainly rather than guessing.',
      'You are read-only here: explain and discuss, never edit files or call tools.',
    ].join(' ');

    const convo = history.map((h) => `${h.role === 'agent' ? 'AGENT' : 'PRIME'}: ${h.text}`).join('\n\n');
    const prompt = [
      `# Document: ${file}`,
      docBody.slice(0, 12000),
      quote ? `\n# The line(s) +prime is asking about:\n${quote}` : '',
      convo ? `\n# Conversation so far:\n${convo}` : '',
      `\n# +prime's question:\n${question}`,
      '\nAnswer +prime directly and briefly.',
    ]
      .filter(Boolean)
      .join('\n');

    const controller = new AbortController();
    const logPath = join(tmpdir(), `kortext-explain-${process.pid}-${Date.now()}.log`);
    try {
      const result = await spawnCli({
        binary,
        args: [
          '--print',
          '--output-format',
          'json',
          '--setting-sources',
          'project,local',
          '--exclude-dynamic-system-prompt-sections',
          '--append-system-prompt',
          systemPrompt,
        ],
        cwd: root,
        stdin: prompt,
        logPath,
        signal: controller.signal,
        timeoutMs: 90_000,
        summaryBufferBytes: 512 * 1024,
      });

      if (result.exitCode !== 0) {
        res.status(502).json({
          error: 'explain_failed',
          message: tailLines(result.stderrTail || result.stdoutTail, 5) || 'cli failed',
        });
        return;
      }

      let answer = '';
      try {
        const parsed = JSON.parse(result.stdoutTail) as { result?: unknown };
        if (typeof parsed.result === 'string') answer = parsed.result.trim();
      } catch {
        answer = result.stdoutTail.trim();
      }
      if (!answer) {
        res.status(502).json({ error: 'empty_answer' });
        return;
      }
      res.json({ answer });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: 'explain_error', message });
    }
  });

  // POST /api/docs/:scope/:file/propose — given the Explain conversation, the
  // agent returns a COMPLETE revised document. Nothing is written here; the
  // client previews the proposal and only PUTs it back on +prime's confirm.
  r.post('/docs/:scope/:file/propose', async (req, res) => {
    const scope = req.params.scope;
    const file = req.params.file;
    const root = scope ? deps.scopes[scope] : undefined;
    if (!scope || !root) {
      res.status(404).json({ error: 'unknown_scope' });
      return;
    }
    if (!file || !FILE_RE.test(file)) {
      res.status(400).json({ error: 'invalid_filename' });
      return;
    }
    const target = resolve(root, file);
    if (!target.startsWith(root + sep)) {
      res.status(403).json({ error: 'outside_scope' });
      return;
    }

    const reqBody = (req.body ?? {}) as { instruction?: unknown; quote?: unknown; history?: unknown };
    const instruction =
      typeof reqBody.instruction === 'string' && reqBody.instruction.trim()
        ? reqBody.instruction.trim()
        : 'Update the document to reflect the conversation above.';
    const quote = typeof reqBody.quote === 'string' ? reqBody.quote.slice(0, 4000) : '';
    const history = Array.isArray(reqBody.history)
      ? reqBody.history
          .filter(
            (h): h is { role: string; text: string } =>
              !!h && typeof (h as { text?: unknown }).text === 'string',
          )
          .slice(-12)
          .map((h) => ({ role: h.role === 'agent' ? 'agent' : 'prime', text: String(h.text) }))
      : [];

    const binary = resolveExecutorBinary('claude');
    if (!binary) {
      res.status(503).json({ error: 'explain_unavailable', message: 'claude CLI not found' });
      return;
    }

    let docBody = '';
    try {
      docBody = await readFile(target, 'utf8');
    } catch {
      /* best-effort */
    }

    const systemPrompt = [
      'You are a Kortext agent revising a project document for +prime, the human owner.',
      'Return ONLY the complete, revised markdown document — the entire file, top to bottom.',
      'Do NOT add any commentary, preamble, or code fences. Output is the file content verbatim.',
      'Preserve the existing structure, headings, and language; change only what the conversation asks for.',
    ].join(' ');

    const convo = history.map((h) => `${h.role === 'agent' ? 'AGENT' : 'PRIME'}: ${h.text}`).join('\n\n');
    const prompt = [
      `# Current document: ${file}`,
      docBody,
      quote ? `\n# The line(s) under discussion:\n${quote}` : '',
      convo ? `\n# Conversation:\n${convo}` : '',
      `\n# Requested change:\n${instruction}`,
      '\nReturn the full revised document now — nothing else.',
    ]
      .filter(Boolean)
      .join('\n');

    const controller = new AbortController();
    const logPath = join(tmpdir(), `kortext-propose-${process.pid}-${Date.now()}.log`);
    try {
      const result = await spawnCli({
        binary,
        args: [
          '--print',
          '--output-format',
          'json',
          '--setting-sources',
          'project,local',
          '--exclude-dynamic-system-prompt-sections',
          '--append-system-prompt',
          systemPrompt,
        ],
        cwd: root,
        stdin: prompt,
        logPath,
        signal: controller.signal,
        timeoutMs: 120_000,
        summaryBufferBytes: 1024 * 1024,
      });
      if (result.exitCode !== 0) {
        res.status(502).json({
          error: 'propose_failed',
          message: tailLines(result.stderrTail || result.stdoutTail, 5) || 'cli failed',
        });
        return;
      }
      let proposal = '';
      try {
        const parsed = JSON.parse(result.stdoutTail) as { result?: unknown };
        if (typeof parsed.result === 'string') proposal = parsed.result;
      } catch {
        proposal = result.stdoutTail;
      }
      // Strip an accidental ```markdown … ``` fence if the model wrapped it.
      proposal = proposal.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      if (!proposal) {
        res.status(502).json({ error: 'empty_proposal' });
        return;
      }
      res.json({ proposal });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: 'propose_error', message });
    }
  });

  // PUT /api/docs/:scope/:file — write a confirmed body back. Guarded by the
  // same scope/path barrier; the propose→preview→confirm flow is the only path
  // the UI uses to reach this.
  r.put('/docs/:scope/:file', async (req, res) => {
    const scope = req.params.scope;
    const file = req.params.file;
    const root = scope ? deps.scopes[scope] : undefined;
    if (!scope || !root) {
      res.status(404).json({ error: 'unknown_scope' });
      return;
    }
    if (!file || !FILE_RE.test(file)) {
      res.status(400).json({ error: 'invalid_filename' });
      return;
    }
    const target = resolve(root, file);
    if (!target.startsWith(root + sep)) {
      res.status(403).json({ error: 'outside_scope' });
      return;
    }
    const reqBody = (req.body ?? {}) as { body?: unknown };
    if (typeof reqBody.body !== 'string') {
      res.status(400).json({ error: 'invalid_body' });
      return;
    }
    try {
      await writeFile(target, reqBody.body, 'utf8');
      res.json({ ok: true, scope, file, body: reqBody.body });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: 'write_failed', message });
    }
  });

  return r;
}
