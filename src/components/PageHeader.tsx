import type { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border-subtle">
      <div className="min-w-0">
        <h1 className="text-[20px] font-semibold tracking-tight text-tx-1">{title}</h1>
        {subtitle && <p className="mt-1 text-[12px] text-tx-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PagePlaceholder({ note }: { note?: string }) {
  return (
    <div className="px-6 py-6">
      <div className="rounded-lg border border-border-subtle bg-bg-1 p-6 text-[13px] text-tx-3">
        <div className="flex items-center gap-2 text-tx-2 mb-2">
          <span className="dot dot-muted" /> Coming in next sub-phase
        </div>
        {note && <p className="text-tx-3">{note}</p>}
      </div>
    </div>
  );
}
