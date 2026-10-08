/** A recent, bounded view of unique flows; newer observations replace older ones. */
export function mergeRecent<T extends { flow_id: string }>(previous: readonly T[], incoming: readonly T[], limit = 100): T[] {
  if (limit <= 0) return [];
  const records = new Map<string, T>();
  for (const record of [...previous, ...incoming]) {
    records.delete(record.flow_id);
    records.set(record.flow_id, record);
  }
  return [...records.values()].slice(-limit);
}

/** Owns listeners even when asynchronous registration finishes after teardown. */
export function createLifecycle() {
  let active = true;
  const cleanups = new Set<() => void>();
  return {
    get active() { return active; },
    guard<T>(callback: (value: T) => void) {
      return (value: T) => { if (active) callback(value); };
    },
    async own(registration: Promise<() => void>) {
      try {
        const cleanup = await registration;
        if (active) cleanups.add(cleanup);
        else cleanup();
      } catch {
        // A failed registration owns no listener. Service adapters report failures.
      }
    },
    dispose() {
      active = false;
      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
    },
  };
}

/** Completion-based polling with a shared gate across page/visibility changes. */
export function startSerialPolling(task: () => Promise<void>, gate: { busy: boolean }, delay: number) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    if (stopped) return;
    if (!gate.busy) {
      gate.busy = true;
      try { await task(); } catch { /* The caller owns error presentation. */ }
      finally { gate.busy = false; }
    }
    if (!stopped) timer = setTimeout(() => { void tick(); }, delay);
  };
  void tick();
  return () => { stopped = true; clearTimeout(timer); };
}

export function liveDataNeeds(tab: string) {
  return { flows: tab === 'storyline' || tab === 'attack_graph', detections: tab === 'storyline', graph: tab === 'attack_graph' };
}
