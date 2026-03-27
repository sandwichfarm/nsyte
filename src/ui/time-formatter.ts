/**
 * Format a timestamp as either relative time (for recent dates) or absolute date
 */
export function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const date = new Date(timestamp * 1000); // Convert from Unix timestamp
  const diffMs = now - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffYears >= 1) {
    // Show absolute date for dates 1 year or older
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    return date.toLocaleDateString("en-US", options);
  } else if (diffMonths >= 1) {
    // Show months ago
    if (diffMonths === 1) {
      return "1 month ago";
    } else {
      return `${diffMonths} months ago`;
    }
  } else if (diffWeeks >= 1) {
    // Show weeks ago
    if (diffWeeks === 1) {
      return "1 week ago";
    } else {
      return `${diffWeeks} weeks ago`;
    }
  } else if (diffDays >= 1) {
    // Show days ago
    if (diffDays === 1) {
      return "yesterday";
    } else {
      return `${diffDays} days ago`;
    }
  } else {
    // Show hours/minutes ago for today
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes === 0) {
        return "just now";
      } else if (diffMinutes === 1) {
        return "1 minute ago";
      } else {
        return `${diffMinutes} minutes ago`;
      }
    } else if (diffHours === 1) {
      return "1 hour ago";
    } else {
      return `${diffHours} hours ago`;
    }
  }
}

/**
 * Format a unix timestamp as an age relative to now.
 */
export function formatAge(timestamp: number, nowMs = Date.now()): string {
  const diffMs = Math.max(0, nowMs - (timestamp * 1000));
  const minuteMs = 1000 * 60;
  const hourMs = minuteMs * 60;
  const dayMs = hourMs * 24;
  const weekMs = dayMs * 7;
  const monthMs = dayMs * 30;
  const yearMs = dayMs * 365;

  if (diffMs < minuteMs) {
    return "just now";
  }

  if (diffMs < hourMs) {
    const minutes = Math.floor(diffMs / minuteMs);
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }

  if (diffMs < dayMs) {
    const hours = Math.floor(diffMs / hourMs);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }

  if (diffMs < weekMs) {
    const days = Math.floor(diffMs / dayMs);
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }

  if (diffMs < monthMs) {
    const weeks = Math.floor(diffMs / weekMs);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }

  if (diffMs < yearMs) {
    const months = Math.floor(diffMs / monthMs);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }

  const years = Math.floor(diffMs / yearMs);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

/**
 * Format a manifest identifier with a human-readable age.
 */
export function formatManifestIdWithAge(
  manifestId: string,
  createdAt: number,
  nowMs = Date.now(),
): string {
  return `${manifestId} (${formatAge(createdAt, nowMs)})`;
}
