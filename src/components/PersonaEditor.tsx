import { useEffect, useState } from 'react';
import { usePolling, apiGet } from '../lib/api.ts';
import type { PersonaSummary } from '../lib/api-types.ts';
import { Save, RotateCcw, AlertCircle, CheckCircle2 } from 'lucide-react';

type FullPersona = PersonaSummary & { systemPrompt: string };

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

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
          <div className="text-[11px] text-tx-3 mt-0.5">{list.length} loaded · agents/</div>
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
          <EditorPane handle={selected} key={selected} />
        ) : (
          <div className="px-6 py-6 text-[13px] text-tx-3">Select a persona.</div>
        )}
      </section>
    </div>
  );
}

function EditorPane({ handle }: { handle: string }) {
  const [loaded, setLoaded] = useState<FullPersona | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });

  useEffect(() => {
    let alive = true;
    setLoaded(null);
    setLoadError(null);
    setSaveState({ kind: 'idle' });
    apiGet<{ persona: FullPersona }>(`/api/personas/${encodeURIComponent(handle)}`)
      .then((r) => {
        if (!alive) return;
        setLoaded(r.persona);
        setDraft(r.persona.systemPrompt);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [handle]);

  if (loadError) {
    return <div className="px-6 py-6 text-[13px] text-danger">{loadError}</div>;
  }
  if (!loaded) {
    return <div className="px-6 py-6 text-[13px] text-tx-3">loading…</div>;
  }

  const dirty = draft !== loaded.systemPrompt;
  const reset = () => {
    setDraft(loaded.systemPrompt);
    setSaveState({ kind: 'idle' });
  };

  const save = async () => {
    setSaveState({ kind: 'saving' });
    try {
      const res = await fetch(`/api/personas/${encodeURIComponent(handle)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ systemPrompt: draft }),
      });
      const body = (await res.json()) as
        | { persona: FullPersona }
        | { error: string; message?: string };
      if (!res.ok) {
        const err = body as { error: string; message?: string };
        const message = err.message ?? err.error;
        setSaveState({ kind: 'error', message: String(message) });
        return;
      }
      const persona = (body as { persona: FullPersona }).persona;
      setLoaded(persona);
      setDraft(persona.systemPrompt);
      setSaveState({ kind: 'saved', at: Date.now() });
    } catch (e) {
      setSaveState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <>
      <div className="px-4 py-2 border-b border-border-subtle flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 mono text-[12px] text-tx-3">
          <span className="text-tx-2">{loaded.handle}</span>
          <span className="text-tx-disabled">·</span>
          <span>agents/{loaded.id}.md</span>
        </div>
        <div className="flex items-center gap-2">
          <SaveStatus state={saveState} dirty={dirty} />
          <button
            type="button"
            onClick={reset}
            disabled={!dirty || saveState.kind === 'saving'}
            className="h-7 px-2.5 text-[12px] rounded border border-border-default text-tx-2 hover:text-tx-1 hover:bg-bg-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 inline-flex items-center gap-1.5"
          >
            <RotateCcw size={12} /> Reset
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saveState.kind === 'saving'}
            className="h-7 px-3 text-[12px] rounded bg-accent text-bg-0 hover:bg-accent-soft disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 inline-flex items-center gap-1.5 font-medium"
          >
            <Save size={12} /> Save
          </button>
        </div>
      </div>
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (saveState.kind === 'saved' || saveState.kind === 'error') {
            setSaveState({ kind: 'idle' });
          }
        }}
        spellCheck={false}
        className="flex-1 w-full px-5 py-4 bg-bg-0 text-tx-1 mono text-[12px] leading-[1.6] outline-none resize-none border-0 focus:bg-bg-0"
      />
    </>
  );
}

function SaveStatus({ state, dirty }: { state: SaveState; dirty: boolean }) {
  if (state.kind === 'saving') {
    return <span className="text-[11px] text-tx-3">saving…</span>;
  }
  if (state.kind === 'saved') {
    return (
      <span className="text-[11px] text-success inline-flex items-center gap-1">
        <CheckCircle2 size={11} /> saved
      </span>
    );
  }
  if (state.kind === 'error') {
    return (
      <span className="text-[11px] text-danger inline-flex items-center gap-1" title={state.message}>
        <AlertCircle size={11} /> {state.message}
      </span>
    );
  }
  if (dirty) {
    return <span className="text-[11px] text-warning">unsaved changes</span>;
  }
  return <span className="text-[11px] text-tx-disabled">no changes</span>;
}
