import type Database from 'better-sqlite3';
import {
  PersonaIndexSchema,
  PersonaIndexUpsertSchema,
  type PersonaIndex,
  type PersonaIndexUpsert,
} from '../schemas.ts';
import { packJson, unpackJson } from '../json.ts';

/**
 * `personas` table — handle-indexed projection of `agents/*.md`.
 *
 * Each row mirrors one persona file. Upserts happen at engine boot
 * (`persona-registry.ts`) so the table is always consistent with the
 * markdown source. `workflow_steps.persona_handle` FK-references this
 * table — a workflow step that names an unknown handle fails at upsert
 * time, surfacing as a boot error.
 */

type Row = {
  handle: string;
  purpose: string | null;
  capabilities: string;
  when_to_use: string | null;
  model_default: string | null;
  source_path: string;
  updated_at: number;
};

function rowToPersona(row: Row): PersonaIndex {
  return PersonaIndexSchema.parse({
    ...row,
    capabilities: unpackJson<string[]>(row.capabilities, []),
  });
}

export class PersonasRepository {
  private readonly upsertStmt;
  private readonly getStmt;
  private readonly listStmt;
  private readonly deleteAllStmt;

  constructor(private readonly db: Database.Database) {
    this.upsertStmt = db.prepare(`
      INSERT INTO personas
        (handle, purpose, capabilities, when_to_use, model_default, source_path, updated_at)
      VALUES
        (@handle, @purpose, @capabilities, @when_to_use, @model_default, @source_path, @updated_at)
      ON CONFLICT(handle) DO UPDATE SET
        purpose       = excluded.purpose,
        capabilities  = excluded.capabilities,
        when_to_use   = excluded.when_to_use,
        model_default = excluded.model_default,
        source_path   = excluded.source_path,
        updated_at    = excluded.updated_at
    `);
    this.getStmt = db.prepare('SELECT * FROM personas WHERE handle = ?');
    this.listStmt = db.prepare('SELECT * FROM personas ORDER BY handle');
    this.deleteAllStmt = db.prepare('DELETE FROM personas');
  }

  upsert(input: PersonaIndexUpsert): PersonaIndex {
    const parsed = PersonaIndexUpsertSchema.parse(input);
    this.upsertStmt.run({
      handle: parsed.handle,
      purpose: parsed.purpose,
      capabilities: packJson(parsed.capabilities),
      when_to_use: parsed.when_to_use,
      model_default: parsed.model_default,
      source_path: parsed.source_path,
      updated_at: Date.now(),
    });
    return this.get(parsed.handle)!;
  }

  get(handle: string): PersonaIndex | null {
    const row = this.getStmt.get(handle) as Row | undefined;
    return row ? rowToPersona(row) : null;
  }

  list(): PersonaIndex[] {
    const rows = this.listStmt.all() as Row[];
    return rows.map(rowToPersona);
  }

  /** Wipe — used by boot reload before a fresh batch upsert. */
  deleteAll(): void {
    this.deleteAllStmt.run();
  }
}
