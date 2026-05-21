import { existsSync, readFileSync, watch, type FSWatcher } from 'node:fs';

/**
 * Watches a markdown file's YAML frontmatter `status:` field and fires
 * `onApproved` exactly once per `something → approved` transition.
 *
 * Design notes:
 *   - The watcher is intentionally dumb. It does NOT know which workflow to
 *     run; that decision lives in the orchestrator which wires this callback.
 *   - State is held in `lastSeenStatus` so repeated writes that keep the
 *     status at 'approved' do not re-fire.
 *   - `handleChange()` is exposed for tests (and for an outside caller that
 *     wants to nudge the watcher manually). `start()` adds an fs.watch
 *     subscription on top.
 *   - In-flight protection: while `onApproved` is awaiting, additional
 *     handleChange calls coalesce — they wait for the same promise instead
 *     of triggering parallel runs.
 */

export type BlueprintWatcherOptions = {
  filePath: string;
  onApproved: (filePath: string) => Promise<void>;
  /** Debounce window for fs.watch events (default 150ms). */
  debounceMs?: number;
};

export type HandleChangeResult = {
  triggered: boolean;
  reason?:
    | 'file-missing'
    | 'no-status'
    | 'unchanged'
    | 'not-approved'
    | 'callback-failed';
};

export class BlueprintWatcher {
  private lastSeenStatus: string | null = null;
  private inFlight: Promise<HandleChangeResult> | null = null;
  private fsWatcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: BlueprintWatcherOptions) {}

  start(): void {
    if (this.fsWatcher) return;
    if (!existsSync(this.opts.filePath)) {
      // Watch the directory and look for the file appearing later.
      // For Faz 3 we keep it simple and require the file to exist already.
      return;
    }
    this.fsWatcher = watch(this.opts.filePath, () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        void this.handleChange();
      }, this.opts.debounceMs ?? 150);
    });
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
  }

  async handleChange(): Promise<HandleChangeResult> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.doHandleChange().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async doHandleChange(): Promise<HandleChangeResult> {
    if (!existsSync(this.opts.filePath)) {
      return { triggered: false, reason: 'file-missing' };
    }

    const status = readStatusFrontmatter(this.opts.filePath);
    if (status === null) {
      return { triggered: false, reason: 'no-status' };
    }

    const previous = this.lastSeenStatus;
    this.lastSeenStatus = status;

    if (status !== 'approved') {
      return { triggered: false, reason: 'not-approved' };
    }
    if (previous === 'approved') {
      return { triggered: false, reason: 'unchanged' };
    }

    try {
      await this.opts.onApproved(this.opts.filePath);
      return { triggered: true };
    } catch {
      // Reset cache so the next change can retry the trigger.
      this.lastSeenStatus = previous;
      return { triggered: false, reason: 'callback-failed' };
    }
  }
}

function readStatusFrontmatter(path: string): string | null {
  let body: string;
  try {
    body = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  if (!body.startsWith('---')) return null;
  const end = body.indexOf('\n---', 3);
  if (end < 0) return null;
  const block = body.slice(3, end);
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('status:')) {
      return line.slice('status:'.length).trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return null;
}
