/**
 * Terminal — a floating mini kortext CLI (wireframe `.term`). Opens from the
 * footer / topbar terminal button (`open-terminal` event) and answers a small
 * command set against live data:
 *
 *   status      → run counts from /api/runs
 *   agents      → personas from /api/personas, each coloured via persona-colors
 *   gate [id]   → open approval questions from /api/questions
 *   help        → command list
 *   clear       → wipe the scrollback
 *
 * It's a read-only status console, not a real shell — commands map to GET
 * endpoints only. Output uses the wireframe's `.t-line / .t-out / .t-dim`
 * classes so it matches the hi-fi spec exactly.
 */
import { useEffect, useRef, useState } from 'react';
import { Terminal as TerminalIcon, Minus } from 'lucide-react';
import { apiGet } from '../lib/api.ts';
import type { Run, PersonaSummary, PendingQuestion, ProjectMeta } from '../lib/api-types.ts';
import { personaColor } from '../lib/persona-colors.ts';
import { useShellEvent } from './shell-events.ts';

type Line = { id: number; node: React.ReactNode };

export function Terminal() {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [value, setValue] = useState('');
  const seeded = useRef(false);
  const lineId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Live data the commands read from. Loaded on first open, refreshed cheaply.
  // Kept in refs so command handlers read the latest values without re-binding.
  const runs = useRef<Run[]>([]);
  const personas = useRef<PersonaSummary[]>([]);
  const questions = useRef<PendingQuestion[]>([]);
  const [project, setProject] = useState('kortext');

  function loadData() {
    apiGet<{ runs: Run[] }>('/api/runs').then((r) => (runs.current = r.runs)).catch(() => undefined);
    apiGet<{ personas: PersonaSummary[] }>('/api/personas')
      .then((r) => (personas.current = r.personas))
      .catch(() => undefined);
    apiGet<{ questions: PendingQuestion[] }>('/api/questions')
      .then((r) => (questions.current = r.questions))
      .catch(() => undefined);
    apiGet<{ meta: ProjectMeta }>('/api/project-meta')
      .then((r) => setProject(r.meta.code || r.meta.name || 'kortext'))
      .catch(() => undefined);
  }

  useShellEvent('open-terminal', () => {
    setOpen(true);
    loadData();
    if (!seeded.current) {
      seeded.current = true;
      // Seed the scrollback with an initial `status` read, like the wireframe.
      setTimeout(() => {
        push(prompt('kortext status'));
        push(respond('status'));
      }, 60);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  });

  // Keep the view pinned to the newest output.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines]);

  function push(node: React.ReactNode) {
    if (node == null) return;
    lineId.current += 1;
    const id = lineId.current;
    setLines((prev) => [...prev, { id, node }]);
  }

  function prompt(cmd: string): React.ReactNode {
    return (
      <div className="t-line" style={{ marginTop: 4 }}>
        <span className="t-p">$</span> {cmd}
      </div>
    );
  }

  function respond(raw: string): React.ReactNode {
    const c = raw.toLowerCase().trim();

    if (c === 'status') {
      const running = runs.current.filter((r) => r.status === 'running').length;
      const queued = runs.current.filter((r) => r.status === 'queued').length;
      const awaiting = runs.current.filter((r) => r.status === 'awaiting_approval').length;
      return (
        <>
          <div className="t-out">
            <span style={{ color: 'var(--green)' }}>●</span> {running} running{'   '}
            <span style={{ color: 'var(--amber)' }}>●</span> {queued} queued{'   '}
            <span style={{ color: 'var(--red)' }}>●</span> {awaiting} awaiting approval
          </div>
          {questions.current.length > 0 && (
            <div className="t-out t-dim">
              gate: {questions.current.length} question
              {questions.current.length === 1 ? '' : 's'} awaiting approval
            </div>
          )}
        </>
      );
    }

    if (c === 'agents') {
      if (personas.current.length === 0)
        return <div className="t-out t-dim">no agents loaded</div>;
      return (
        <>
          {personas.current.map((a) => (
            <div className="t-out" key={a.handle}>
              <span style={{ color: 'var(--green)' }}>●</span>{' '}
              <span style={{ color: personaColor(a.handle) }}>{a.handle}</span>
              <span className="t-dim">  {a.description || a.id}</span>
            </div>
          ))}
        </>
      );
    }

    if (c === 'gate' || c.startsWith('gate ') || c.startsWith('gate')) {
      const qs = questions.current;
      if (qs.length === 0) return <div className="t-out t-dim">no gates awaiting approval</div>;
      return (
        <>
          {qs.map((q) => (
            <div className="t-out" key={q.id}>
              <span style={{ color: 'var(--amber)' }}>●</span> {q.question}
              <span className="t-dim"> — awaiting approval</span>
            </div>
          ))}
          <div className="t-out t-dim">
            → {qs.length} gate{qs.length === 1 ? '' : 's'} open
          </div>
        </>
      );
    }

    if (c === 'help') {
      return (
        <div className="t-out t-dim">
          commands:  status · agents · gate · clear · help
        </div>
      );
    }

    if (c === 'clear') {
      setLines([]);
      return null;
    }

    if (c === '') return null;

    return <div className="t-out t-dim">command not found: {raw} — try 'help'</div>;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') return setOpen(false);
    if (e.key !== 'Enter') return;
    const cmd = value.trim();
    setValue('');
    if (!cmd) return;
    push(prompt(cmd));
    if (cmd.toLowerCase().trim() === 'clear') {
      setLines([]);
      return;
    }
    push(respond(cmd));
  }

  return (
    <div className={`term${open ? ' open' : ''}`}>
      <div className="term-head">
        <span className="ti">
          <TerminalIcon style={{ width: 14, height: 14 }} />
        </span>
        <span className="term-title">kortext · {project}</span>
        <span className="term-min" onClick={() => setOpen(false)}>
          <Minus style={{ width: 15, height: 15 }} />
        </span>
      </div>
      <div className="term-body" ref={bodyRef}>
        {lines.map((l) => (
          <div key={l.id}>{l.node}</div>
        ))}
      </div>
      <div className="term-in">
        <span className="p">$</span>
        <input
          ref={inputRef}
          value={value}
          placeholder="type a command — try 'status' or 'help'"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
