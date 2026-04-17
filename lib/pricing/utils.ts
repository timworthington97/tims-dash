export const ITEM_TIMEOUT_MS = 3_500;
export const GLOBAL_REFRESH_TIMEOUT_MS = 8_000;
export const CLIENT_REFRESH_TIMEOUT_MS = 9_000;
export const PROVIDER_RETRY_ATTEMPTS = 2;

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(task: () => Promise<T>, attempts = PROVIDER_RETRY_ATTEMPTS) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await wait(150);
      }
    }
  }

  throw lastError;
}

export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
