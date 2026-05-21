import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  KORTEXT_PORT: z.coerce.number().int().positive().default(3200),
  KORTEXT_DB_PATH: z.string().default('.kortext/runtime/kortext.db'),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  SLACK_CHANNEL: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
