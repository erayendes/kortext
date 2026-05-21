import type { Repositories } from '../db/repositories/index.ts';
import type { NotificationChannel } from '../db/schemas.ts';

/**
 * Notification dispatcher: turns a domain event into one row per transport
 * in `notifications_sent`, doing dedup via the (channel, event_key) UNIQUE
 * constraint and recording transport failures inline.
 *
 * The dispatcher does not know HTTP. Transports do — they're injected so the
 * tests substitute fakes and production wires Slack + Telegram clients.
 */

export type NotificationKind =
  | 'pipeline.started'
  | 'pipeline.succeeded'
  | 'pipeline.failed'
  | 'gate.awaiting-approval'
  | 'secret.detected';

export type NotificationEvent = {
  kind: NotificationKind;
  runId: number;
  workflowId: string;
  summary: string;
  payload: Record<string, unknown>;
  /** Required when kind = 'gate.awaiting-approval'. */
  questionId?: number;
  /** Optional, narrows event_key for per-step events like 'secret.detected'. */
  stepId?: number;
};

export interface NotificationTransport {
  readonly channel: NotificationChannel;
  isEnabled(): boolean;
  send(text: string, payload: Record<string, unknown>): Promise<void>;
}

export type DispatcherOptions = {
  repos: Repositories;
  transports: NotificationTransport[];
};

export class NotificationDispatcher {
  constructor(private readonly opts: DispatcherOptions) {}

  async dispatch(event: NotificationEvent): Promise<void> {
    const eventKey = buildEventKey(event);
    const text = formatText(event);

    for (const transport of this.opts.transports) {
      // Dedup: skip transport.send if (channel, event_key) already recorded.
      const existing = this.opts.repos.notifications.getByKey(transport.channel, eventKey);
      if (existing) continue;

      if (!transport.isEnabled()) {
        this.opts.repos.notifications.record({
          channel: transport.channel,
          event_key: eventKey,
          payload: { ...event.payload, kind: event.kind, summary: event.summary },
          status: 'suppressed',
          error_message: null,
        });
        continue;
      }

      try {
        await transport.send(text, { ...event.payload, runId: event.runId });
        this.opts.repos.notifications.record({
          channel: transport.channel,
          event_key: eventKey,
          payload: { ...event.payload, kind: event.kind, summary: event.summary },
          status: 'sent',
          error_message: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.opts.repos.notifications.record({
          channel: transport.channel,
          event_key: eventKey,
          payload: { ...event.payload, kind: event.kind, summary: event.summary },
          status: 'failed',
          error_message: message,
        });
      }
    }
  }
}

function buildEventKey(event: NotificationEvent): string {
  const slug = event.kind.replace(/\./g, '-');
  if (event.kind === 'gate.awaiting-approval') {
    return `${slug}:question:${event.questionId ?? 'unknown'}`;
  }
  if (event.kind === 'secret.detected' && event.stepId !== undefined) {
    return `${slug}:run:${event.runId}:step:${event.stepId}`;
  }
  return `${slug}:run:${event.runId}`;
}

function formatText(event: NotificationEvent): string {
  return `[kortext] ${event.kind} • ${event.workflowId} #${event.runId} — ${event.summary}`;
}
