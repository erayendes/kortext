import { usePolling, formatElapsed } from '../lib/api.ts';
import type { Handover } from '../lib/api-types.ts';
import { ArrowRight } from 'lucide-react';

export function HandoverFeed() {
  const { data, error, tick } = usePolling<{ handovers: Handover[] }>(
    '/api/handovers',
    5000,
  );
  const handovers = data?.handovers ?? [];

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-1">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <div className="text-[12px] uppercase tracking-[0.10em] text-tx-2">Recent handovers</div>
        <span className="mono text-[11px] text-tx-3">tick {tick}</span>
      </div>
      {error && <div className="px-4 py-3 text-[12px] text-danger">{error}</div>}
      {!error && handovers.length === 0 && (
        <div className="px-4 py-6 text-[13px] text-tx-3">
          No handovers yet. Persona-to-persona transitions appear here.
        </div>
      )}
      {!error && handovers.length > 0 && (
        <ul className="divide-y divide-border-subtle">
          {handovers.map((h) => (
            <li key={h.id} className="px-4 py-3 grid items-center gap-3"
                style={{ gridTemplateColumns: '70px 1fr 80px' }}>
              <span className="mono text-[11px] text-tx-3">#{h.id}</span>
              <div className="text-[13px] text-tx-1 flex items-center gap-2 flex-wrap">
                <code className="mono text-accent-soft">{h.from_persona}</code>
                <ArrowRight size={12} className="text-tx-3" />
                <code className="mono text-signal-soft">{h.to_persona}</code>
                {h.item_id && (
                  <>
                    <span className="text-tx-disabled">·</span>
                    <code className="mono text-tx-3">{h.item_id}</code>
                  </>
                )}
                {h.reason && (
                  <>
                    <span className="text-tx-disabled">—</span>
                    <span className="text-tx-2 text-[12px]">{h.reason}</span>
                  </>
                )}
              </div>
              <span className="mono text-[11px] text-tx-3 text-right">
                {formatElapsed(h.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
