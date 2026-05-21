import type { NotificationTransport } from './dispatcher.ts';
import type { NotificationChannel } from '../db/schemas.ts';

export type SlackTransportOptions = {
  webhookUrl: string;
  channel?: string;
  fetch?: typeof fetch;
};

export class SlackTransport implements NotificationTransport {
  readonly channel: NotificationChannel = 'slack';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: SlackTransportOptions) {
    this.fetchImpl = opts.fetch ?? fetch;
  }

  isEnabled(): boolean {
    return Boolean(this.opts.webhookUrl);
  }

  async send(text: string, payload: Record<string, unknown>): Promise<void> {
    const body: Record<string, unknown> = { text };
    if (this.opts.channel) body.channel = this.opts.channel;
    if (Object.keys(payload).length > 0) body.attachments = [{ text: JSON.stringify(payload) }];

    const res = await this.fetchImpl(this.opts.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await safeText(res);
      throw new Error(`Slack webhook ${res.status}: ${detail}`);
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
