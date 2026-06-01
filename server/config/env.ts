import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  KORTEXT_PORT: z.coerce.number().int().positive().default(3200),
  KORTEXT_DB_PATH: z.string().default('.kortext/data/kortext.db'),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  SLACK_CHANNEL: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  // The autonomous driver's safety switch (§5.16). Fail-safe: only the explicit
  // tokens "1"/"true" arm it; unset, "0", "false", "" and anything else read as
  // OFF — a naive z.coerce.boolean() would wrongly arm it on "0".
  KORTEXT_DRIVE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
