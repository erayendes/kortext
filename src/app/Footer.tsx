/**
 * Footer — engine entry (⚙ Kortext) · theme toggle · daemon status · agents /
 * worktrees / terminal triggers.
 *
 * "⚙ Kortext" navigates into the engine scope (which swaps the sidebar to the
 * engine menu — see Sidebar). The agents/worktrees/terminal items dispatch
 * window events for later sessions to wire to their up-panels.
 */
import { Link } from '@tanstack/react-router';
import { Cog, Contrast, GitBranch, Terminal, ChevronUp } from 'lucide-react';
import { useTheme } from './theme.ts';

function emit(name: 'open-agents' | 'open-worktrees' | 'open-terminal'): void {
  window.dispatchEvent(new CustomEvent(name));
}

export function Footer() {
  const { theme, toggle } = useTheme();

  return (
    <footer className="footer">
      <Link to="/kortext/llm-auth" className="f-item" style={{ cursor: 'pointer' }}>
        <Cog style={{ width: 16, height: 16 }} />
        Kortext
      </Link>

      <div
        className="theme-btn"
        onClick={toggle}
        title={`Theme: ${theme}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <Contrast style={{ width: 14, height: 14 }} />
      </div>

      <div className="agct">
        <span className="dot" style={{ width: 6, height: 6, background: 'var(--green)' }} />
        daemon{' '}
        <span className="mono" style={{ color: 'var(--fg-faint)' }}>
          :3200
        </span>
      </div>

      <div style={{ flex: 1 }} />

      <div className="f-item" onClick={() => emit('open-agents')} style={{ cursor: 'pointer' }}>
        <span className="agct">
          <span className="dot" style={{ width: 6, height: 6, background: 'var(--green)' }} />
        </span>
        <span style={{ color: 'var(--fg-mid)' }}>Agents</span>
        <ChevronUp style={{ width: 13, height: 13 }} />
      </div>
      <div className="f-sep" />
      <div className="f-item" onClick={() => emit('open-worktrees')} style={{ cursor: 'pointer' }}>
        <GitBranch style={{ width: 16, height: 16 }} />
        Worktrees
        <ChevronUp style={{ width: 13, height: 13 }} />
      </div>
      <div className="f-sep" />
      <div className="f-item" onClick={() => emit('open-terminal')} style={{ cursor: 'pointer' }}>
        <Terminal style={{ width: 16, height: 16 }} />
        Terminal
      </div>
    </footer>
  );
}
