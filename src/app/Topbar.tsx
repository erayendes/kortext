/**
 * Topbar — sidebar toggle · logo · project/version (static for S1) · centred
 * ⌘K search · right-side notification + terminal icons.
 *
 * The search/notif/terminal triggers dispatch window CustomEvents
 * (`open-cmdk` / `open-notifs` / `open-terminal`). S6 (CommandPalette /
 * Notifications / Terminal) listens for these — S1 only fires them.
 */
import { PanelLeft, ChevronsUpDown, ChevronDown, Bell, Search, Terminal } from 'lucide-react';

/** Fire a shell-level UI event. Decouples the topbar from S6 overlays. */
export function emitShellEvent(name: 'open-cmdk' | 'open-notifs' | 'open-terminal'): void {
  window.dispatchEvent(new CustomEvent(name));
}

export function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return (
    <header className="topbar">
      <div className="iconbtn" onClick={onToggleSidebar} title="Toggle sidebar">
        <PanelLeft style={{ width: 15, height: 15 }} />
      </div>
      <div className="logo">K</div>

      {/* Project + version — static placeholders (dropdown wiring is S6). */}
      <div className="tb-proj">
        <span style={{ fontWeight: 500, color: 'var(--fg)' }}>Acme CRM</span>
        <ChevronsUpDown style={{ width: 13, height: 13, opacity: 0.6 }} />
      </div>
      <span className="tb-sep" style={{ fontSize: 11 }}>
        /
      </span>
      <div
        className="tb-proj mono"
        style={{ fontSize: 12, height: 24, padding: '0 7px', border: '1px solid var(--border)' }}
      >
        v1.0 <ChevronDown style={{ width: 12, height: 12, opacity: 0.6 }} />
      </div>

      {/* centred command-palette trigger */}
      <div className="search" onClick={() => emitShellEvent('open-cmdk')}>
        <Search style={{ width: 13, height: 13 }} />
        <span>Search…</span>
        <span style={{ flex: 1 }} />
        <span className="kbd">⌘K</span>
      </div>

      <div style={{ flex: 1 }} />

      <div className="iconbtn" onClick={() => emitShellEvent('open-notifs')} title="Notifications">
        <Bell style={{ width: 15, height: 15 }} />
        <span
          className="dot"
          style={{
            position: 'absolute',
            top: 5,
            right: 6,
            width: 6,
            height: 6,
            background: 'var(--accent)',
          }}
        />
      </div>
      <div className="iconbtn" onClick={() => emitShellEvent('open-terminal')} title="Terminal">
        <Terminal style={{ width: 15, height: 15 }} />
      </div>
    </header>
  );
}
