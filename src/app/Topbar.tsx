/**
 * Topbar — design-handoff (app.js `shell()` topbar).
 *
 *   .ws-switcher (project name → dashboard) · .ver-pill (version → ⌘K palette)
 *   · centred .tb-search (readonly → palette) · .tb-right (tweaks · bell)
 *
 * The search / version triggers open the command palette; the bell opens the
 * notifications drawer; tweaks opens the appearance panel. All are dispatched as
 * window CustomEvents that the S6 overlays listen for.
 */
import { Link } from '@tanstack/react-router';
import { Bell, Search, SlidersHorizontal } from 'lucide-react';
import { useProjectMeta, usePolling } from '../lib/api.ts';
import type { PendingQuestion } from '../lib/api-types.ts';

function emit(name: 'open-cmdk' | 'open-notifs' | 'open-tweaks'): void {
  window.dispatchEvent(new CustomEvent(name));
}

export function Topbar() {
  const project = useProjectMeta();
  // The bell dot is lit only when something actually needs the human: an open
  // approval question. No pending questions → no dot (honest, not decorative).
  const questions = usePolling<{ questions: PendingQuestion[] }>('/api/questions', 15000);
  const pending = questions.data?.questions.length ?? 0;
  return (
    <header className="topbar">
      <Link to="/" className="ws-switcher" title="Project · go to dashboard">
        <span className="ws-name">{project?.name ?? 'Project'}</span>
      </Link>

      <div className="tb-search">
        <div className="input-group" onClick={() => emit('open-cmdk')}>
          <Search className="ic-lead" />
          <input
            className="input"
            placeholder="Search items, epics, or go to…"
            readOnly
          />
          <span className="kbd" style={{ position: 'absolute', right: 8 }}>
            ⌘K
          </span>
        </div>
      </div>

      <div className="tb-right">
        <button className="icon-btn" onClick={() => emit('open-tweaks')} title="Tweaks">
          <SlidersHorizontal className="ic" />
        </button>
        <button className="icon-btn" onClick={() => emit('open-notifs')} title="Notifications">
          <Bell className="ic" />
          {pending > 0 && <span className="ndot" />}
        </button>
      </div>
    </header>
  );
}
