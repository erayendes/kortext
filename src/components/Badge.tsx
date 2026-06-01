import type { ReactNode } from 'react';
import type { BadgeTone } from '../lib/board-drawer.ts';

/**
 * Canonical pill badge — mirrors the v4 wireframe `.badge` spec exactly
 * (11px, sentence-case, 12%-tinted bg, brighter text, ~25-30% border).
 *
 * The older per-route Badge helpers (settings-panes / references / memory)
 * use a smaller 9px uppercase treatment; those screens can migrate to this
 * shared component as they're brought to v4 fidelity.
 */
const PRESETS: Record<BadgeTone, { color: string; bg: string; border: string }> = {
  purple: { color: '#C084FC', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.30)' },
  pink: { color: '#F472B6', bg: 'rgba(236,72,153,0.12)', border: 'rgba(236,72,153,0.25)' },
  blue: { color: '#60A5FA', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.25)' },
  green: { color: '#34D399', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)' },
  amber: { color: '#FBBF24', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)' },
  red: { color: '#F87171', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)' },
  neutral: { color: 'var(--tx-2)', bg: 'var(--bg-2)', border: 'var(--border-default)' },
};

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  const p = PRESETS[tone];
  return (
    <span
      className="inline-flex items-center gap-1 rounded font-medium"
      style={{
        padding: '2px 8px',
        fontSize: 11,
        lineHeight: 1.5,
        color: p.color,
        background: p.bg,
        border: `1px solid ${p.border}`,
      }}
    >
      {children}
    </span>
  );
}
