import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Eye, EyeOff, Info, Lock } from 'lucide-react';
import { usePolling, apiGet } from '../lib/api.ts';
import type { PersonaSummary } from '../lib/api-types.ts';

type FullPersona = PersonaSummary & { systemPrompt: string };

marked.setOptions({ gfm: true, breaks: false });

/**
 * Faz 12.9 — readonly persona viewer.
 *
 * v3.1.0 ships persona / workflow / rule .md files as immutable package
 * content. The dashboard renders them but never writes to them — editing
 * personas requires forking the kortext npm package. A "View source" toggle
 * switches between the rendered markdown and the raw text so operators can
 * still copy snippets when they need to.
 *
 * All rendered markdown is sanitized via DOMPurify before being injected
 * — same pattern as MarkdownViewer / settings-panes MarkdownFileShell.
 */
export function PersonaEditor() {
  const { data, error } = usePolling<{ personas: PersonaSummary[] }>(
    '/api/personas',
    30_000,
  );
  const list = data?.personas ?? [];
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (selected === null && list.length > 0 && list[0]) {
      setSelected(list[0].handle);
    }
  }, [list, selected]);

  return (
    <div className="px-6 py-5 grid gap-4 h-full" style={{ gridTemplateColumns: '260px 1fr' }}>
      <aside className="rounded-lg border border-border-subtle bg-bg-1 overflow-hidden">
        <div className="px-4 py-2 border-b border-border-subtle">
          <div className="text-[12px] uppercase tracking-[0.10em] text-tx-2">Personas</div>
          <div className="text-[11px] text-tx-3 mt-0.5">{list.length} loaded · readonly</div>
        </div>
        {error && <div className="px-4 py-3 text-[12px] text-danger">{error}</div>}
        <ul>
          {list.map((p) => (
            <li key={p.handle}>
              <button
                type="button"
                onClick={() => setSelected(p.handle)}
                className={[
                  'w-full text-left px-4 py-2 flex flex-col gap-0.5 transition-colors duration-200',
                  selected === p.handle
                    ? 'bg-accent/8 border-l-2 border-accent'
                    : 'hover:bg-bg-2 border-l-2 border-transparent',
                ].join(' ')}
              >
                <span className={`mono text-[12px] ${selected === p.handle ? 'text-accent' : 'text-tx-2'}`}>
                  {p.handle}
                </span>
                <span className="text-[11px] text-tx-3 line-clamp-1">{p.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="rounded-lg border border-border-subtle bg-bg-1 overflow-hidden flex flex-col min-h-[60vh]">
        {selected ? (
          <ReadonlyPane handle={selected} key={selected} />
        ) : (
          <div className="px-6 py-6 text-[13px] text-tx-3">Select a persona.</div>
        )}
      </section>
    </div>
  );
}

function ReadonlyPane({ handle }: { handle: string }) {
  const [loaded, setLoaded] = useState<FullPersona | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(null);
    setLoadError(null);
    apiGet<{ persona: FullPersona }>(`/api/personas/${encodeURIComponent(handle)}`)
      .then((r) => {
        if (!alive) return;
        setLoaded(r.persona);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [handle]);

  // marked output is piped through DOMPurify to neutralize any HTML that
  // sneaks into the persona markdown — same hardening as MarkdownViewer.
  const html = useMemo(() => {
    if (!loaded) return '';
    const raw = marked.parse(loaded.systemPrompt, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [loaded]);

  if (loadError) {
    return <div className="px-6 py-6 text-[13px] text-danger">{loadError}</div>;
  }
  if (!loaded) {
    return <div className="px-6 py-6 text-[13px] text-tx-3">loading…</div>;
  }

  return (
    <>
      <div className="px-4 py-2 border-b border-border-subtle flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 mono text-[12px] text-tx-3">
          <Lock size={11} className="text-tx-disabled" />
          <span className="text-tx-2">{loaded.handle}</span>
          <span className="text-tx-disabled">·</span>
          <span>agents/{loaded.id}.md</span>
          <span className="text-tx-disabled">·</span>
          <span className="text-tx-disabled">readonly</span>
        </div>
        <button
          type="button"
          onClick={() => setShowSource((v) => !v)}
          className="h-7 px-2.5 text-[12px] rounded border border-border-default text-tx-2 hover:text-tx-1 hover:bg-bg-2 transition-colors duration-200 inline-flex items-center gap-1.5"
        >
          {showSource ? <Eye size={12} /> : <EyeOff size={12} />}
          {showSource ? 'Rendered' : 'View source'}
        </button>
      </div>
      <div className="px-4 py-2 flex items-center gap-2 text-[11px] text-tx-3 border-b border-border-subtle bg-bg-1/60">
        <Info size={11} className="text-tx-disabled" />
        <span>
          Editing personas requires forking the <code className="mono text-tx-2">kortext</code> npm
          package — runtime files are package-owned. Writing lands in v3.2.
        </span>
      </div>
      {showSource ? (
        <pre className="flex-1 w-full px-5 py-4 bg-bg-0 text-tx-2 mono text-[12px] leading-[1.6] overflow-auto whitespace-pre-wrap">
          {loaded.systemPrompt}
        </pre>
      ) : (
        <article
          className="prose-markdown flex-1 overflow-y-auto px-6 py-5 text-[13px] leading-[1.65]"
          // eslint-disable-next-line react/no-danger -- sanitized via DOMPurify above
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </>
  );
}
