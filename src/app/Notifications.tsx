/**
 * Notifications — the right-hand notification centre (wireframe `.drawer`
 * variant, 408px). Opens on the topbar bell (`open-notifs` event) and lists the
 * two things that need the human's eyes: open approval questions
 * (`/api/questions`) and recent agent handovers (`/api/handovers`).
 *
 * Clicking a row routes to where that work lives — questions to the Board,
 * handovers to Memory. The element stays mounted and toggles `.open` so the
 * slide-in transition runs (matching the wireframe's class-toggle approach).
 */
import { useState } from 'react';
import { X, BadgeCheck, ArrowLeftRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { apiGet } from '../lib/api.ts';
import type { PendingQuestion, Handover } from '../lib/api-types.ts';
import { useShellEvent } from './shell-events.ts';

type Row = {
  key: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  title: string;
  msg: string;
  meta: string;
  go: () => void;
};

/** Compact "5m / 3h / 2d ago" from an epoch timestamp (ms or s). */
function ago(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function Notifications() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<PendingQuestion[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);

  useShellEvent('open-notifs', () => {
    setOpen(true);
    // Refresh on every open so the panel reflects current state.
    apiGet<{ questions: PendingQuestion[] }>('/api/questions')
      .then((r) => setQuestions(r.questions))
      .catch(() => undefined);
    apiGet<{ handovers: Handover[] }>('/api/handovers')
      .then((r) => setHandovers(r.handovers))
      .catch(() => undefined);
  });

  const close = () => setOpen(false);

  const rows: Row[] = [
    ...questions.map((q) => ({
      key: `q:${q.id}`,
      icon: BadgeCheck,
      color: 'var(--accent-hi)',
      bg: 'var(--accent-soft)',
      title: q.question,
      msg: 'Ready for your approval',
      meta: `${q.choices.length} choice${q.choices.length === 1 ? '' : 's'} · ${ago(q.created_at)}`,
      go: () => {
        close();
        navigate({ to: '/board' });
      },
    })),
    ...handovers.map((h) => ({
      key: `h:${h.id}`,
      icon: ArrowLeftRight,
      color: 'var(--green)',
      bg: 'rgba(76,183,130,.12)',
      title: `${h.from_persona} → ${h.to_persona}`,
      msg: h.reason ?? (h.item_id ? `Handover on ${h.item_id}` : 'Handover'),
      meta: `${h.item_id ?? 'context'} · ${ago(h.created_at)}`,
      go: () => {
        close();
        navigate({ to: '/memory' });
      },
    })),
  ];

  return (
    <>
      <div
        className={`drawer-backdrop${open ? ' open' : ''}`}
        onClick={close}
      />
      <aside className={`drawer${open ? ' open' : ''}`} style={{ width: 408 }}>
        <div className="dr-head">
          <span style={{ fontSize: 14, fontWeight: 600 }}>Notifications</span>
          {questions.length > 0 && (
            <span
              className="stbadge"
              style={{ color: 'var(--accent-hi)', background: 'var(--accent-soft)' }}
            >
              {questions.length} new
            </span>
          )}
          <span className="dr-x" onClick={close}>
            <X style={{ width: 16, height: 16 }} />
          </span>
        </div>
        <div className="dr-body" style={{ padding: '6px 18px 28px' }}>
          {rows.length === 0 ? (
            <div className="cmdk-empty" style={{ paddingTop: 40 }}>
              Nothing needs your attention.
            </div>
          ) : (
            rows.map((r) => {
              const Icon = r.icon;
              return (
                <div className="nt-row" key={r.key} onClick={r.go}>
                  <span className="nt-ico" style={{ background: r.bg, color: r.color }}>
                    <Icon />
                  </span>
                  <div className="nt-b">
                    <div className="nt-title">{r.title}</div>
                    <div className="nt-msg">{r.msg}</div>
                    <div className="nt-meta">{r.meta}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
