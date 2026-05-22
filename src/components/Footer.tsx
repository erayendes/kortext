export function Footer() {
  return (
    <footer
      className="border-t border-border-subtle bg-bg-0 flex items-center gap-4 px-4 text-[11px] text-tx-3"
      style={{ height: 'var(--footer-h)' }}
    >
      <span className="flex items-center gap-1.5">
        <span className="dot dot-accent" /> Acme CRM
      </span>
      <span className="flex items-center gap-1.5">
        <span className="dot dot-signal dot-pulse" /> 6 active
      </span>
      <span className="flex items-center gap-1.5">
        <span className="dot dot-muted" /> 2 idle
      </span>
      <span className="flex items-center gap-1.5">
        <span className="dot dot-danger" /> 1 blocked
      </span>
      <span className="ml-auto mono">~1.2K tkn/s</span>
      <span className="mono">$4.30 today</span>
      <span className="mono">⎇ feature/auth-42</span>
      <span className="mono">workflow: 04-development 4/7</span>
    </footer>
  );
}
