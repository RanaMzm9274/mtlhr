export class AsyncTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsyncTimeoutError";
  }
}

export const SUPABASE_REQUEST_TIMEOUT_MS = 20000;

export const isAsyncTimeoutError = (error: unknown): error is AsyncTimeoutError =>
  error instanceof AsyncTimeoutError;

export const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs = SUPABASE_REQUEST_TIMEOUT_MS,
  label = "Request",
) =>
  new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new AsyncTimeoutError(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });

export const withTimeoutFallback = <T>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs = SUPABASE_REQUEST_TIMEOUT_MS,
) =>
  new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      resolve(fallback);
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
