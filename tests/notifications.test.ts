import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import {
  NotificationDispatcher,
  type NotificationEvent,
  type NotificationTransport,
} from '../server/notifications/dispatcher.ts';
import { SlackTransport } from '../server/notifications/slack.ts';
import { TelegramTransport } from '../server/notifications/telegram.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-notif-'));
  const bundle = openDb({ path: join(tmpRoot, 'notif.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

class FakeTransport implements NotificationTransport {
  readonly sent: Array<{ text: string; payload: Record<string, unknown> }> = [];
  constructor(
    readonly channel: 'slack' | 'telegram',
    private readonly enabled: boolean,
    private readonly shouldFail = false,
  ) {}
  isEnabled(): boolean {
    return this.enabled;
  }
  async send(text: string, payload: Record<string, unknown>): Promise<void> {
    if (this.shouldFail) throw new Error('transport boom');
    this.sent.push({ text, payload });
  }
}

const sampleEvent: NotificationEvent = {
  kind: 'pipeline.failed',
  runId: 42,
  workflowId: 'a-flow',
  summary: 'Step 2 failed: secret detected',
  payload: { step_key: 'phase.2' },
};

describe('NotificationDispatcher', () => {
  it('writes a sent row per enabled transport', async () => {
    const slack = new FakeTransport('slack', true);
    const telegram = new FakeTransport('telegram', true);
    const dispatcher = new NotificationDispatcher({ repos, transports: [slack, telegram] });

    await dispatcher.dispatch(sampleEvent);

    expect(slack.sent).toHaveLength(1);
    expect(telegram.sent).toHaveLength(1);
    expect(repos.notifications.listRecent()).toHaveLength(2);
  });

  it('marks suppressed when a transport is disabled', async () => {
    const slack = new FakeTransport('slack', false); // disabled
    const telegram = new FakeTransport('telegram', true);
    const dispatcher = new NotificationDispatcher({ repos, transports: [slack, telegram] });

    await dispatcher.dispatch(sampleEvent);
    const rows = repos.notifications.listRecent();
    const slackRow = rows.find((r) => r.channel === 'slack');
    const telegramRow = rows.find((r) => r.channel === 'telegram');
    expect(slackRow?.status).toBe('suppressed');
    expect(telegramRow?.status).toBe('sent');
    expect(slack.sent).toHaveLength(0);
  });

  it('marks failed and stores error_message on transport throw', async () => {
    const slack = new FakeTransport('slack', true, true);
    const dispatcher = new NotificationDispatcher({ repos, transports: [slack] });
    await dispatcher.dispatch(sampleEvent);
    const rows = repos.notifications.listRecent();
    expect(rows[0]?.status).toBe('failed');
    expect(rows[0]?.error_message).toContain('transport boom');
  });

  it('deduplicates: same event twice writes only one row per channel', async () => {
    const slack = new FakeTransport('slack', true);
    const dispatcher = new NotificationDispatcher({ repos, transports: [slack] });

    await dispatcher.dispatch(sampleEvent);
    await dispatcher.dispatch(sampleEvent);
    await dispatcher.dispatch(sampleEvent);

    expect(slack.sent).toHaveLength(1);
    expect(repos.notifications.listRecent()).toHaveLength(1);
  });

  it('builds distinct event_keys for different kinds even on same run', async () => {
    const slack = new FakeTransport('slack', true);
    const dispatcher = new NotificationDispatcher({ repos, transports: [slack] });
    await dispatcher.dispatch({ ...sampleEvent, kind: 'pipeline.started' });
    await dispatcher.dispatch({ ...sampleEvent, kind: 'pipeline.failed' });
    expect(slack.sent).toHaveLength(2);
  });

  it('event_key for gate uses questionId', async () => {
    const slack = new FakeTransport('slack', true);
    const dispatcher = new NotificationDispatcher({ repos, transports: [slack] });
    await dispatcher.dispatch({
      kind: 'gate.awaiting-approval',
      questionId: 7,
      runId: 1,
      workflowId: 'x',
      summary: 'awaiting',
      payload: {},
    });
    const row = repos.notifications.listRecent()[0];
    expect(row?.event_key).toBe('gate-awaiting-approval:question:7');
  });
});

describe('SlackTransport', () => {
  it('is disabled without SLACK_WEBHOOK_URL', () => {
    const t = new SlackTransport({ webhookUrl: '' });
    expect(t.isEnabled()).toBe(false);
  });

  it('posts json with text+channel when enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const t = new SlackTransport({
      webhookUrl: 'https://hooks.slack.example/T/B/X',
      channel: '#kortext',
      fetch: fetchMock,
    });
    expect(t.isEnabled()).toBe(true);
    await t.send('hello', { runId: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('hooks.slack.example');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.text).toBe('hello');
    expect(body.channel).toBe('#kortext');
  });

  it('throws on non-2xx response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('rate limited', { status: 429 }));
    const t = new SlackTransport({
      webhookUrl: 'https://hooks.slack.example/T/B/X',
      fetch: fetchMock,
    });
    await expect(t.send('hello', {})).rejects.toThrow(/429/);
  });
});

describe('TelegramTransport', () => {
  it('is disabled without bot token or chat id', () => {
    expect(new TelegramTransport({ botToken: '', chatId: '' }).isEnabled()).toBe(false);
    expect(new TelegramTransport({ botToken: 'x', chatId: '' }).isEnabled()).toBe(false);
  });

  it('posts to bot api with chat_id and text', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const t = new TelegramTransport({
      botToken: 'BOT',
      chatId: '99',
      fetch: fetchMock,
    });
    await t.send('hi', {});
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('api.telegram.org/botBOT/sendMessage');
    const body = JSON.parse(String(init.body));
    expect(body.chat_id).toBe('99');
    expect(body.text).toBe('hi');
  });
});
