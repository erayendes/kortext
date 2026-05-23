import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { usePolling, apiGet } from '../lib/api.ts';
import { FileText } from 'lucide-react';

type Scope = string;

type Props = {
  scope: Scope;
  /** Page subtitle shown next to the file list header. */
  subtitle?: string;
};

marked.setOptions({ gfm: true, breaks: false });

/**
 * Two-pane markdown library: file list on the left, rendered body on the right.
 * Used by References, Reports, and parts of Memory.
 *
 * Content comes from operator-controlled workspace/ markdown files, but we
 * still pipe the marked output through DOMPurify so a malicious paste (or an
 * agent writing raw HTML into a report) cannot script the dashboard.
 */
export function MarkdownViewer({ scope, subtitle }: Props) {
  const { data, error } = usePolling<{ files: { name: string }[] }>(
    `/api/docs/${scope}`,
    15_000,
  );
  const files = useMemo(() => (data?.files ?? []).map((f) => f.name), [data]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (selected === null && files.length > 0 && files[0]) {
      setSelected(files[0]);
    }
  }, [files, selected]);

  return (
    <div className="px-6 py-5 grid gap-4 h-full" style={{ gridTemplateColumns: '260px 1fr' }}>
      <aside className="rounded-lg border border-border-subtle bg-bg-1 overflow-hidden">
        <div className="px-4 py-2 border-b border-border-subtle">
          <div className="text-[12px] uppercase tracking-[0.10em] text-tx-2">{scope}</div>
          {subtitle && <div className="text-[11px] text-tx-3 mt-0.5">{subtitle}</div>}
        </div>
        {error ? (
          <div className="px-4 py-3 text-[12px] text-danger">{error}</div>
        ) : files.length === 0 ? (
          <div className="px-4 py-6 text-[12px] text-tx-3">No documents yet.</div>
        ) : (
          <ul>
            {files.map((f) => (
              <li key={f}>
                <button
                  type="button"
                  onClick={() => setSelected(f)}
                  className={[
                    'w-full text-left px-4 py-2 mono text-[12px] flex items-center gap-2 transition-colors duration-200',
                    selected === f
                      ? 'text-accent bg-accent/8'
                      : 'text-tx-2 hover:text-tx-1 hover:bg-bg-2',
                  ].join(' ')}
                >
                  <FileText size={12} className="flex-shrink-0 opacity-70" />
                  <span className="truncate">{f}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <section className="rounded-lg border border-border-subtle bg-bg-1 overflow-hidden flex flex-col min-h-[60vh]">
        {selected ? (
          <DocBody scope={scope} file={selected} />
        ) : (
          <div className="px-6 py-6 text-[13px] text-tx-3">Select a document.</div>
        )}
      </section>
    </div>
  );
}

export function DocBody({ scope, file }: { scope: Scope; file: string }) {
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setBody(null);
    setError(null);
    apiGet<{ body: string }>(`/api/docs/${scope}/${file}`)
      .then((r) => alive && setBody(r.body))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [scope, file]);

  const html = useMemo(() => {
    if (!body) return '';
    const raw = marked.parse(body, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [body]);

  if (error) {
    return <div className="px-6 py-6 text-[13px] text-danger">{error}</div>;
  }
  if (body === null) {
    return <div className="px-6 py-6 text-[13px] text-tx-3">loading…</div>;
  }
  return (
    <>
      <div className="px-6 py-2 border-b border-border-subtle flex items-center gap-2 text-[12px] text-tx-3 mono">
        <FileText size={12} />
        <span>{scope}/{file}</span>
      </div>
      <article
        className="prose-markdown overflow-y-auto px-6 py-5 text-[13px] leading-[1.65]"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
