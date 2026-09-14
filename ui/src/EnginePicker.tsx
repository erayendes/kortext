/**
 * The engine picker: what runs this project, chosen in one place. A centered
 * dialog over a dimmed page — the panel's first — with three sections that
 * read like the CLIs' own pickers: the CLI as chips, its models as a list with
 * one line each, its effort as a segment with one line under it. Every pick
 * saves at once; Done and Escape close.
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

        <div className="kx-picker-section">
          <div className="kx-changebar-group">CLI</div>
          <div className="kx-chips">
            {engines.map((e) => (
              <button
                key={e.id}
                className={`kx-chip${e.id === spec?.id ? ' on' : ''}`}
                title={e.untested ? 'Prepared from its documentation, not yet run here' : undefined}
                onClick={() => pickEngine(e.id)}
              >
                {e.id}
                {e.untested && <span className="kx-chip-note">untested</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="kx-picker-section">
          <div className="kx-changebar-group">Model</div>
          <div className="kx-picker-list" role="listbox" aria-label="Model">
            <PickRow
              on={model === ''}
              name="default"
              about="the CLI's own setting"
              onPick={() => pickModel('')}
            />
            {models.map((m) => (
              <PickRow
                key={m}
                on={model === m}
                name={label(m)}
                about={about(m)}
                onPick={() => pickModel(m)}
              />
            ))}
          </div>
        </div>

        {levels.length > 0 && (
          <div className="kx-picker-section">
            <div className="kx-changebar-group">Effort</div>
            <div className="kx-segment" role="radiogroup" aria-label="Effort">
              <button
                className={`kx-segment-btn${effort === '' ? ' on' : ''}`}
                onClick={() => pickEffort('')}
              >
                default
              </button>
              {levels.map((l) => (
                <button
                  key={l}
                  className={`kx-segment-btn${effort === l ? ' on' : ''}`}
                  onClick={() => pickEffort(l)}
                >
                  {label(l)}
                </button>
              ))}
            </div>
            <div className="kx-picker-about">
              {effort ? about(effort) || ' ' : "the CLI's own setting"}
            </div>
          </div>
        )}

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

function PickRow({
  on,
  name,
  about,
  onPick,
}: {
  on: boolean;
  name: string;
  about: string;
  onPick: () => void;
}) {
  return (
    <button
      className={`kx-pick${on ? ' on' : ''}`}
      role="option"
      aria-selected={on}
      onClick={onPick}
    >
      <span className="kx-pick-mark" aria-hidden />
      <span className="kx-pick-name mono">{name}</span>
      <span className="kx-pick-about">{about}</span>
    </button>
  );
}
