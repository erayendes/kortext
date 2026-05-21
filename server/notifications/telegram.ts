import type { NotificationTransport } from './dispatcher.ts';
import type { NotificationChannel } from '../db/schemas.ts';

export type TelegramTransportOptions = {
  botToken: string;
  chatId: string;
  fetch?: typeof fetch;
};

export class TelegramTransport implements NotificationTransport {
  readonly channel: NotificationChannel = 'telegram';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: TelegramTransportOptions) {
    this.fetchImpl = opts.fetch ?? fetch;
  }

  isEnabled(): boolean {
    return Boolean(this.opts.botToken) && Boolean(this.opts.chatId);
  }

  async send(text: string, _payload: Record<string, unknown>): Promise<void> {
    const url = `https://api.telegram.org/bot${this.opts.botToken}/sendMessage`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: this.opts.chatId, text }),
    });
    if (!res.ok) {
      const detail = await safeText(res);
      throw new Error(`Telegram sendMessage ${res.status}: ${detail}`);
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
