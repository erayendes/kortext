/**
 * The engine picker: what runs this project, chosen in one place. A centered
 * dialog over a dimmed page — the panel's first — with three rows on one grid:
 * a label on the left; on the right the CLI as chips, the model as a select,
 * the effort as a slider with its levels named under it and one line about the
 * chosen one. Every pick saves at once; Done and Escape close.
 */
import { useEffect } from 'react';
import { api, type EngineInfo } from './api';

export type EnginePickerProps = {
  open: boolean;
  onClose: () => void;
  /** null before the project exists (Add project): picks stay local until Initialize. */
  projectId: number | null;
  engines: EngineInfo[];
  engine: string;
  model: string;
  effort: string;
  onEngine: (id: string, model: string, effort: string) => void;
  onModel: (model: string) => void;
  onEffort: (effort: string) => void;
  onError: (message: string) => void;
};

export function EnginePicker({
  open,
  onClose,
  projectId,
  engines,
  engine,
  model,
  effort,
  onEngine,
  onModel,
  onEffort,
  onError,
}: EnginePickerProps) {
  const spec = engines.find((e) => e.id === engine) ?? engines[0];
  const models = spec?.models ?? [];
  const levels = spec?.efforts ?? [];
  const about = (key: string) => spec?.about?.[key] ?? '';
  const label = (key: string) => spec?.label?.[key] ?? key;

  // Escape closes; ↑↓ walk the models, ←→ the levels, as the CLIs do.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = ['', ...models];
        const at = Math.max(0, list.indexOf(model));
        const next = list[(at + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]!;
        pickModel(next);
      }
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && levels.length > 0) {
        e.preventDefault();
        const list = ['', ...levels];
        const at = Math.max(0, list.indexOf(effort));
        const next = list[(at + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length]!;
        pickEffort(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // A pick is a PUT; a second pick before the first lands is just the next
  // PUT — nothing here is worth locking the dialog for.
  const guard = <T,>(p: Promise<T>) => p.catch((e) => onError((e as Error).message));
  // Before the project exists nothing is saved; a CLI switch drops to its defaults, as the server would.
  const pickEngine = (id: string) =>
    projectId === null
      ? onEngine(id, '', '')
      : guard(
          api
            .setProjectEngine(projectId, id)
            .then((r) => onEngine(id, r.model ?? '', r.effort ?? '')),
        );
  const pickModel = (m: string) =>
    projectId === null
      ? onModel(m)
      : guard(api.setProjectModel(projectId, m).then(() => onModel(m)));
  const pickEffort = (lvl: string) =>
    projectId === null
      ? onEffort(lvl)
      : guard(api.setProjectEffort(projectId, lvl).then(() => onEffort(lvl)));

  if (!open) return null;
  const chip = (on: boolean, text: string, onPick: () => void, title?: string, note?: string) => (
    <button
      key={text}
      className={`kx-chip${on ? ' on' : ''}`}
      role="radio"
      aria-checked={on}
      title={title}
      onClick={onPick}
    >
      {text}
      {note && <span className="kx-chip-note">{note}</span>}
    </button>
  );
  return (
    <>
      <div className="drawer-backdrop open" onClick={onClose} aria-hidden />
      <div className="kx-dialog" role="dialog" aria-modal="true" aria-labelledby="kx-picker-title">
        <div className="kx-dialog-head">
          <span id="kx-picker-title" className="kx-dialog-title">
            Engine
          </span>
          <span className="kx-dialog-hint">what runs this project — picks save at once</span>
        </div>

        <div className="kx-picker">
          <div className="kx-picker-label">CLI</div>
          <div className="kx-picker-field">
            <div className="kx-chips" role="radiogroup" aria-label="CLI">
              {engines.map((e) =>
                chip(
                  e.id === spec?.id,
                  e.id,
                  () => pickEngine(e.id),
                  e.untested ? 'Prepared from its documentation, not yet run here' : undefined,
                  e.untested ? 'untested' : undefined,
                ),
              )}
            </div>
          </div>

          <div className="kx-picker-label">Model</div>
          <div className="kx-picker-field">
            <select
              className="select kx-picker-select"
              aria-label="Model"
              value={model}
              onChange={(e) => pickModel(e.target.value)}
            >
              <option value="">default — the CLI's own setting</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {label(m)}
                  {about(m) ? ` — ${about(m)}` : ''}
                </option>
              ))}
            </select>
          </div>

          {levels.length > 0 && (
            <>
              <div className="kx-picker-label">Effort</div>
              <div className="kx-picker-field">
                <input
                  className="kx-range"
                  type="range"
                  aria-label="Effort"
                  min={0}
                  max={levels.length}
                  step={1}
                  value={Math.max(0, ['', ...levels].indexOf(effort))}
                  onChange={(e) => pickEffort(['', ...levels][Number(e.target.value)] ?? '')}
                />
                <div className="kx-range-ticks" aria-hidden>
                  {['', ...levels].map((l) => (
                    <button
                      key={l || 'default'}
                      className={`kx-range-tick${effort === l ? ' on' : ''}`}
                      tabIndex={-1}
                      onClick={() => pickEffort(l)}
                    >
                      {l ? label(l) : 'default'}
                    </button>
                  ))}
                </div>
                <div className="kx-picker-about">
                  {effort ? about(effort) : "the CLI's own setting"}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="kx-dialog-foot">
          <span className="kx-dialog-hint mono">↑↓ model · ←→ effort · esc</span>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </>
  );
}
