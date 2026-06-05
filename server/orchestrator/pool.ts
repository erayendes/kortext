/**
 * Run `fn` over `items` with at most `max` in flight, preserving input order in
 * the returned results. A fixed pool of workers drains a shared cursor; the
 * `cursor++` claim is atomic (no await between read and increment), so no item
 * is processed twice and none is skipped.
 *
 * Generalises the worker-pool pattern in {@link runReadyItems} so the driver's
 * test/review phases can fan independent items out instead of awaiting them one
 * at a time. Order-preserving so callers can pair results back to inputs.
 */
export async function mapWithPool<T, R>(
  items: readonly T[],
  max: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, max);
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const i = cursor++; // atomic claim — no await between read and increment
      results[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}
