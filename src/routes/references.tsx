import { useEffect, useMemo, useState } from 'react';
import { Eye, FileText, Image as ImageIcon, Plus, Upload } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { PageHeader } from '../components/PageHeader.tsx';
import { apiGet, usePolling } from '../lib/api.ts';

const SCOPE = 'references';
type FileMeta = { name: string; size: number; mtime: number };

marked.setOptions({ gfm: true, breaks: false });

export function ReferencesRoute() {
  const { data, error, loading } = usePolling<{ files: FileMeta[] }>(
    `/api/docs/${SCOPE}`,
    15_000,
  );
  const files = useMemo(() => data?.files ?? [], [data]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (selected === null && files.length > 0) {
      setSelected(files[0]!.name);
    }
  }, [files, selected]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title="References"
        subtitle={`Context documents & knowledge base · ${files.length} file${files.length === 1 ? '' : 's'}`}
        actions={
          <button className="btn btn-outline btn-xs">
            <Upload className="w-3 h-3" /> Upload file
          </button>
        }
      />

      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: '260px 1fr' }}>
        <FileList
          files={files}
          selected={selected}
          onSelect={setSelected}
          loading={loading && !data}
          error={error}
        />
        <EditorPane file={files.find((f) => f.name === selected) ?? null} />
      </div>
    </div>
  );
}

function FileList({
  files,
  selected,
  onSelect,
  loading,
  error,
}: {
  files: FileMeta[];
  selected: string | null;
  onSelect: (name: string) => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <aside className="border-r border-border-subtle bg-bg-1 overflow-y-auto flex flex-col">
      <SectionHeader label="Documents" />
      {error && <p className="px-4 py-3 text-[12px] text-danger">{error}</p>}
      {loading && <p className="px-4 py-3 text-[12px] text-tx-3">loading…</p>}
      {!loading && !error && files.length === 0 && (
        <p className="px-4 py-3 text-[12px] text-tx-3">No references yet.</p>
      )}
      {files.map((f) => {
        const active = f.name === selected;
        return (
          <button
            key={f.name}
            type="button"
            onClick={() => onSelect(f.name)}
            className={[
              'text-left px-4 py-2.5 flex items-center gap-2.5 transition-colors duration-200 border-l-2',
              active
                ? 'bg-accent/8 border-l-accent text-tx-1'
                : 'border-l-transparent text-tx-2 hover:bg-bg-2 hover:text-tx-1',
            ].join(' ')}
          >
            <FileIcon name={f.name} />
            <div className="min-w-0 flex-1">
              <div className="mono text-[12px] truncate">{f.name}</div>
              <div className="text-[10px] text-tx-3 flex items-center gap-1.5 mt-0.5">
                <span>{humanSize(f.size)}</span>
                <span>·</span>
                <span>{relativeTime(f.mtime)}</span>
              </div>
            </div>
          </button>
        );
      })}
      <button
        type="button"
        className="mt-auto flex items-center gap-2 px-4 py-2.5 text-[12px] text-tx-3 hover:text-tx-1 hover:bg-bg-2 border-t border-border-subtle transition-colors"
      >
        <Plus className="w-3 h-3" /> Upload reference
      </button>
    </aside>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-[0.10em] text-tx-disabled font-semibold">
      {label}
    </div>
  );
}

function FileIcon({ name }: { name: string }) {
  const isImage = /\.(png|jpg|jpeg|gif|svg|fig|webp)$/i.test(name);
  const Icon = isImage ? ImageIcon : FileText;
  return <Icon className="w-3.5 h-3.5 text-tx-3 shrink-0" />;
}

type Mode = 'edit' | 'preview';

function EditorPane({ file }: { file: FileMeta | null }) {
  const [body, setBody] = useState<string>('');
  const [original, setOriginal] = useState<string>('');
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('preview');

  useEffect(() => {
    if (!file) {
      setBody('');
      setOriginal('');
      setBodyError(null);
      return;
    }
    let alive = true;
    setBody('');
    setOriginal('');
    setBodyError(null);
    apiGet<{ body: string }>(`/api/docs/${SCOPE}/${file.name}`)
      .then((r) => {
        if (!alive) return;
        setBody(r.body);
        setOriginal(r.body);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setBodyError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [file]);

  const html = useMemo(() => {
    if (!body) return '';
    const raw = marked.parse(body, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [body]);

  const dirty = body !== original;

  if (!file) {
    return (
      <section className="flex items-center justify-center text-[13px] text-tx-3">
        Select a reference to view.
      </section>
    );
  }

  return (
    <section className="flex flex-col min-w-0 bg-bg-0">
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span className="mono text-[13px] text-tx-1 truncate">{file.name}</span>
          <Badge tone={badgeForFile(file.name)} label={badgeLabelForFile(file.name)} />
          <span className="mono text-[11px] text-tx-3">
            {humanSize(file.size)} · edited {relativeTime(file.mtime)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setMode((m) => (m === 'preview' ? 'edit' : 'preview'))}
            className="btn btn-ghost btn-xs"
          >
            <Eye className="w-3 h-3" /> {mode === 'preview' ? 'Edit' : 'Preview'}
          </button>
          <button
            type="button"
            disabled
            title="Inline save lands in v3.2"
            className="btn btn-outline btn-xs"
          >
            Save{dirty ? ' •' : ''}
          </button>
        </div>
      </header>

      {bodyError && (
        <div className="px-5 py-3 text-[12px] text-danger">{bodyError}</div>
      )}

      {mode === 'edit' ? (
        <textarea
          spellCheck={false}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="flex-1 bg-transparent border-none outline-none px-5 py-4 mono text-[13px] leading-[1.75] text-tx-2 resize-none"
        />
      ) : (
        <article
          className="prose-markdown overflow-y-auto px-6 py-5 text-[13px] leading-[1.65]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </section>
  );
}

type Tone = 'purple' | 'blue' | 'green' | 'amber' | 'pink' | 'neutral';

function Badge({ tone, label }: { tone: Tone; label: string }) {
  const presets: Record<Tone, { color: string; bg: string }> = {
    purple: { color: 'var(--accent-soft)', bg: 'rgba(168,85,247,0.15)' },
    blue: { color: 'var(--info)', bg: 'rgba(59,130,246,0.12)' },
    green: { color: 'var(--success)', bg: 'rgba(16,185,129,0.12)' },
    amber: { color: 'var(--warning)', bg: 'rgba(245,158,11,0.12)' },
    pink: { color: 'var(--signal-soft)', bg: 'rgba(244,114,182,0.12)' },
    neutral: { color: 'var(--tx-2)', bg: 'rgba(255,255,255,0.06)' },
  };
  const { color, bg } = presets[tone];
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded leading-tight"
      style={{ color, background: bg }}
    >
      {label}
    </span>
  );
}

function badgeForFile(name: string): Tone {
  if (name.includes('blueprint')) return 'purple';
  if (name.includes('tech') || name.includes('api')) return 'blue';
  if (name.includes('brand') || name.includes('voice')) return 'pink';
  if (name.includes('adr') || name.includes('decision')) return 'amber';
  return 'neutral';
}

function badgeLabelForFile(name: string): string {
  if (name.includes('blueprint')) return 'Product vision';
  if (name.includes('tech')) return 'Tech';
  if (name.includes('api')) return 'API';
  if (name.includes('brand') || name.includes('voice')) return 'Voice';
  if (name.includes('adr')) return 'ADR';
  return 'Reference';
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function relativeTime(mtimeMs: number): string {
  if (!mtimeMs) return '—';
  const diff = Date.now() - mtimeMs;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  return `${mo}mo ago`;
}
