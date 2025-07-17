/**
 * Format a timestamp as either relative time (for recent dates) or absolute date
 */
export function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const date = new Date(timestamp * 1000); // Convert from Unix timestamp
  const diffMs = now - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 7) {
    // Show relative time for dates less than 7 days ago
    if (diffDays === 0) {
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
    } else if (diffDays === 1) {
      return "yesterday";
    } else {
      return `${diffDays} days ago`;
    }
  } else {
    // Show absolute date for dates 7 days or older
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return date.toLocaleDateString('en-US', options);
  }
}