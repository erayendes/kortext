import type { Repositories } from '../db/repositories/index.ts';
import type { AuditLogRow } from '../db/schemas.ts';

/**
 * `kortext logs` — read the audit log tail. Pure function so the CLI
 * binding (which owns argv parsing + stdout formatting) can be tested
 * separately from the SQL query layer.
 */

export type LogsCommandInput = {
  repos: Repositories;
  limit?: number;
  actor?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  sinceMs?: number;
};

export type LogsCommandResult = {
  rows: AuditLogRow[];
};

export function logsCommand(input: LogsCommandInput): LogsCommandResult {
  const limit = input.limit ?? 50;
  const rows = input.repos.auditLog.list({
    actor: input.actor ?? null,
    action: input.action ?? null,
    resource_type: input.resourceType ?? null,
    resource_id: input.resourceId ?? null,
    since: input.sinceMs ?? null,
    limit,
  });
  return { rows };
}

export function formatLogsForCli(rows: AuditLogRow[]): string {
  if (rows.length === 0) return '(no audit log entries)';
  return rows
    .map((row) => {
      const ts = new Date(row.created_at).toISOString();
      const resource = row.resource_type
        ? ` ${row.resource_type}:${row.resource_id ?? '-'}`
        : '';
      const payloadKeys = Object.keys(row.payload ?? {});
      const payload = payloadKeys.length > 0 ? ` {${payloadKeys.join(',')}}` : '';
      return `[${row.id}] ${ts}  ${row.actor.padEnd(18)} ${row.action}${resource}${payload}`;
    })
    .join('\n');
}
