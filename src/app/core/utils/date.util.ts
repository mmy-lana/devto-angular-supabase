/** Milliseconds in one day, used by the relative-date thresholds. */
const DAY_IN_MS = 86_400_000;

/** Formats a duration in the past as an age, e.g. `3 hours ago`. */
export function formatRelativeTime(isoTimestamp: string): string {
  const published = new Date(isoTimestamp);

  if (Number.isNaN(published.getTime())) {
    return isoTimestamp;
  }

  const elapsedMs = Date.now() - published.getTime();

  if (elapsedMs < 60_000) {
    return 'Just now';
  }

  const minutes = Math.floor(elapsedMs / 60_000);

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(elapsedMs / DAY_IN_MS);

  if (days < 30) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  return formatShortDate(isoTimestamp);
}

/** Short absolute date, e.g. `Jan 12` (current year) or `Jan 12, 2024`. */
export function formatShortDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }

  const isCurrentYear = date.getFullYear() === new Date().getFullYear();

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: isCurrentYear ? undefined : 'numeric',
  });
}

/** Full date and time, used for `title` tooltips on timestamps. */
export function formatAbsoluteDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
