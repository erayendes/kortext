import { rotateHandover } from '../services/handover-rotation.ts';

/**
 * `kortext archive <what>` — manual rotation/archiving for memory files.
 *
 * Currently supports only `handover` (the live `.kortext/memory/handover.md`
 * file). Future-friendly: the union on `what` lets us add `decisions` /
 * `learned` rotation later without changing the API shape.
 */

export type ArchiveCommandInput = {
  what: 'handover';
  projectRoot: string;
};

export type ArchiveCommandResult =
  | { ok: true; rotated: boolean; archivePath?: string; reason?: string }
  | { ok: false; errorMessage: string };

export function archiveCommand(input: ArchiveCommandInput): ArchiveCommandResult {
  if (input.what !== 'handover') {
    return {
      ok: false,
      errorMessage: `unsupported archive target: ${String(input.what)}`,
    };
  }
  try {
    // Force rotation regardless of threshold by passing maxEntries=1,
    // maxBytes=0 — manual archive runs on demand.
    const result = rotateHandover({
      projectRoot: input.projectRoot,
      maxEntries: 1,
      maxBytes: 0,
    });
    if (result.rotated) {
      return { ok: true, rotated: true, archivePath: result.archivePath };
    }
    return { ok: true, rotated: false, reason: result.reason };
  } catch (err) {
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
