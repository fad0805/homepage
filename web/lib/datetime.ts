const KOREAN_TIME_ZONE = "Asia/Seoul";

/**
 * The API stores UTC timestamps without a suffix. Add one before parsing so
 * server rendering and browser hydration interpret the same instant.
 */
function parseApiDateTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  let normalized = trimmed;
  if (!hasTimeZone) {
    if (trimmed.includes("T")) {
      normalized = `${trimmed}Z`;
    } else if (trimmed.includes(" ")) {
      normalized = `${trimmed.replace(" ", "T")}Z`;
    } else {
      normalized = `${trimmed}T00:00:00Z`;
    }
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = parseApiDateTime(value);
  if (!date) return value;
  return date.toLocaleString("ko-KR", {
    timeZone: KOREAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function todayDateInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KOREAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formatDate(value: string | null) {
  if (!value) return "-";
  const date = parseApiDateTime(value);
  if (!date) return value;
  return date.toLocaleDateString("ko-KR", {
    timeZone: KOREAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
