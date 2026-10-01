import "server-only";

/** fetch avec délai maximal. */
export async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 10_000, ...rest } = init;
  return fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
}

/**
 * File d'attente qui espace les appels sortants d'au moins `intervalMs`
 * (politique d'usage des services publics de géocodage).
 */
export function createThrottle(intervalMs: number) {
  let queue: Promise<unknown> = Promise.resolve();
  let last = 0;
  return function throttle<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const wait = last + intervalMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      last = Date.now();
      return fn();
    });
    queue = run.catch(() => undefined);
    return run;
  };
}
