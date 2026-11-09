const API_BASE = (
  process.env.API_INTERNAL_URL ?? "http://api:8000"
).replace(/\/+$/, "");

const configuredRevalidate = Number(
  process.env.PUBLIC_DATA_REVALIDATE ?? "60",
);
const DEFAULT_REVALIDATE =
  Number.isFinite(configuredRevalidate) && configuredRevalidate >= 0
    ? configuredRevalidate
    : 60;

export class ServerApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ServerApiError";
    this.status = status;
  }
}

interface ServerApiOptions {
  revalidate?: number;
  tags?: string[];
}

/**
 * Fetch public data from the API on the server.
 *
 * The result is kept in Next.js' data cache, so client-side navigation and
 * route prefetches do not trigger another API round trip. Admin mutations can
 * invalidate the named tags through the /revalidate route handler.
 */
export async function serverApiFetch<T>(
  path: string,
  options: ServerApiOptions = {},
): Promise<T> {
  const revalidate = options.revalidate ?? DEFAULT_REVALIDATE;
  const nextOptions: { revalidate: number; tags?: string[] } = {
    revalidate,
  };
  if (options.tags?.length) {
    nextOptions.tags = options.tags;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    cache: "force-cache",
    next: nextOptions,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let detail = `요청에 실패했습니다. (${response.status})`;
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") {
        detail = data.detail;
      }
    } catch {
      // Ignore malformed error bodies.
    }
    throw new ServerApiError(response.status, detail);
  }

  return response.json() as Promise<T>;
}
