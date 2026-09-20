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
