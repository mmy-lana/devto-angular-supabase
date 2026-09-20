/**
 * Extracts a human-readable message from anything that can be thrown.
 *
 * Supabase surfaces failures as `AuthError`, `PostgrestError` (both plain objects
 * with a `message`) or native `Error` instances, and edge cases can throw
 * strings. This normalises all of them for display in UI error states.
 */
export function toErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error) {
    return error.message.trim() || fallback;
  }

  if (typeof error === 'string') {
    return error.trim() || fallback;
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = (error as { message?: unknown }).message;

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }

    try {
      const serialised = JSON.stringify(error);
      if (serialised && serialised !== '{}') {
        return serialised;
      }
    } catch {
      // Circular or otherwise unserialisable payloads fall through to the fallback.
    }
  }

  return fallback;
}

/**
 * Heuristic test for a transport failure rather than a rejected request.
 *
 * The distinction decides whether the application switches to its bundled
 * sample data: a refused connection, a blocked request or a DNS failure means
 * the remote is unreachable, while an RLS rejection or a constraint violation
 * means the remote answered and the request itself was refused, so the live
 * data on screen stays valid.
 *
 * `fetch` reports every transport failure as a `TypeError` ("Failed to fetch" in
 * Chromium, "Load failed" in Safari, "NetworkError..." in Firefox), which is why
 * the message patterns are needed as well as the type check.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }

  const message = toErrorMessage(error, '').toLowerCase();

  return (
    message.includes('failed to fetch') ||
    message.includes('load failed') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('fetch failed') ||
    message.includes('err_connection') ||
    message.includes('econnrefused')
  );
}
