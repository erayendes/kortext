import { Terminal, PanelRightOpen } from 'lucide-react';
import { BellMenu } from './BellMenu.tsx';
import { useShell } from '../lib/shell-store.tsx';

export function Header() {
  const { toggleTerminal, toggleTimeline, terminalOpen, timelineOpen } = useShell();
  return (
    <header
      className="flex items-center justify-between border-b border-border-subtle bg-bg-0 px-4"
      style={{ height: 'var(--header-h)' }}
    >
      <div className="flex items-center gap-3 text-tx-2 text-[13px]">
        <span className="mono text-tx-3 text-[11px]">PROJECT</span>
        <span>Acme CRM</span>
        <span className="text-tx-disabled">·</span>
        <span className="mono text-tx-3 text-[11px]">BRANCH</span>
        <span className="mono">feature/auth-42</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleTimeline}
          className={[
            'h-8 px-2 rounded transition-colors duration-200 flex items-center gap-1.5 text-[12px]',
            timelineOpen
              ? 'text-accent bg-bg-2'
              : 'text-tx-3 hover:text-tx-1 hover:bg-bg-2',
          ].join(' ')}
          title="Toggle timeline"
        >
          <PanelRightOpen size={14} />
          <span>Timeline</span>
        </button>
        <button
          type="button"
          onClick={toggleTerminal}
          className={[
            'h-8 px-2 rounded transition-colors duration-200 flex items-center gap-1.5 mono text-[12px]',
            terminalOpen
              ? 'text-accent bg-bg-2'
              : 'text-tx-3 hover:text-tx-1 hover:bg-bg-2',
          ].join(' ')}
          title="Toggle terminal"
        >
          <Terminal size={14} />
          <span>{'>_'}</span>
        </button>
        <BellMenu />
        <div className="h-8 px-2 ml-1 rounded bg-bg-2 border border-border-default flex items-center gap-1.5 mono text-[12px] text-prime">
          +p
        </div>
      </div>
    </header>
  );
}
