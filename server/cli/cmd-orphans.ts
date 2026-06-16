/**
 * Orphan-daemon sweep (TODO #10).
 *
 * A kortext daemon is spawned detached + unref'd, so a crashed/forgotten run
 * could leave a process holding a kortext port (3200–3299) with no live registry
 * entry pointing at it — the next `kortext start` then skips to a higher port.
 * `sweepOrphans` finds listeners on the kortext range whose pid is NOT a
 * currently-registered, alive daemon and SIGTERMs them.
 *
 * All side effects (port scan, kill, pid-liveness) are injectable so the unit
 * test never touches real processes.
 */
import { BASE_PORT, MAX_PORT, readRegistry, listProjects, defaultRegistryDir } from '../registry/projects.ts';
import { isPidAlive, killDaemon, pidsOnPorts, type PortScanner } from '../registry/daemon.ts';

export type SweepDeps = {
  registryDir?: string;
  scan?: PortScanner;
  kill?: (pid: number) => boolean;
  alive?: (pid: number | null) => boolean;
};

export function sweepOrphans(deps: SweepDeps = {}): { killed: number[]; listeners: number } {
  const dir = deps.registryDir ?? defaultRegistryDir();
  const scan = deps.scan ?? pidsOnPorts;
  const kill = deps.kill ?? ((pid: number) => killDaemon(pid));
  const alive = deps.alive ?? isPidAlive;

  const reg = readRegistry(dir);
  // PIDs that belong to a registered, still-alive daemon — never touch these.
  const owned = new Set(
    listProjects(reg)
      .map((p) => p.pid)
      .filter((p): p is number => p !== null && alive(p)),
  );

  const listeners = scan(BASE_PORT, MAX_PORT);
  const killed: number[] = [];
  for (const pid of listeners) {
    if (owned.has(pid)) continue; // a registered, live daemon — leave it
    if (kill(pid)) killed.push(pid);
  }
  return { killed, listeners: listeners.length };
}
