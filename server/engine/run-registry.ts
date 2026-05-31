/**
 * In-memory registry of active runs' AbortControllers (§5.9 #9).
 *
 * worker-pool's AbortController is local to runWorkflow and not reachable from
 * outside (§5.13). This registry is the bridge: the worker-pool registers a
 * run's controller when it starts (capstone wiring, Madde 10), and the block
 * action cancels it by item. It is the live index of cancellable runs — keyed
 * by runId, tagged with itemId so a blocked item can stop all of its runs.
 *
 * Purely in-memory: a process restart drops it (runs are re-derived from the DB
 * by resume). It never persists — DB run status is the durable record.
 */

type RegistryEntry = {
  itemId: string | null;
  controller: AbortController;
};

export class RunRegistry {
  private readonly entries = new Map<number, RegistryEntry>();

  register(runId: number, itemId: string | null, controller: AbortController): void {
    this.entries.set(runId, { itemId, controller });
  }

  /** Abort + forget the run's controller. Returns true if one was registered. */
  cancel(runId: number): boolean {
    const entry = this.entries.get(runId);
    if (!entry) return false;
    entry.controller.abort();
    this.entries.delete(runId);
    return true;
  }

  /** Abort + forget every run registered for an item. Returns the cancelled runIds. */
  cancelForItem(itemId: string): number[] {
    const ids: number[] = [];
    for (const [runId, entry] of this.entries) {
      if (entry.itemId === itemId) ids.push(runId);
    }
    ids.forEach((id) => this.cancel(id));
    return ids;
  }

  /**
   * Forget a run that finished on its own — does NOT abort the controller.
   * The cleanup counterpart of `cancel`: a completed run must drop out of the
   * live index so a later block can't try to cancel an already-done run.
   * Returns true if an entry was present.
   */
  unregister(runId: number): boolean {
    return this.entries.delete(runId);
  }
}
