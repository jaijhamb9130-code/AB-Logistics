/**
 * Offline mutation queue — Safety Valve for financial operations.
 *
 * When the network is unavailable a bilty save is queued locally.
 * The user must explicitly call flushQueue() (tap "Sync Now") to confirm
 * and send queued mutations once connectivity is restored.
 * This prevents silent partial writes for financially sensitive records.
 */

export interface QueuedMutation<T = unknown> {
  id: string;
  type: string;
  payload: T;
  queuedAt: string;
}

const STORAGE_KEY = 'ab_mutation_queue';

function load(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

function save(queue: QueuedMutation[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function enqueue<T>(type: string, payload: T): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const queue = load();
  queue.push({ id, type, payload: payload as unknown, queuedAt: new Date().toISOString() });
  save(queue);
  return id;
}

export function getQueue(): QueuedMutation[] {
  return load();
}

export function removeFromQueue(id: string): void {
  save(load().filter((m) => m.id !== id));
}

export function clearQueue(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Flush queued mutations one-by-one using the provided executor.
 * Failed mutations remain in the queue with their original payload.
 */
export async function flushQueue(
  executor: (mutation: QueuedMutation) => Promise<void>
): Promise<{ succeeded: number; failed: number }> {
  const queue = load();
  let succeeded = 0;
  let failed = 0;

  for (const mutation of queue) {
    try {
      await executor(mutation);
      removeFromQueue(mutation.id);
      succeeded++;
    } catch {
      failed++;
    }
  }

  return { succeeded, failed };
}
