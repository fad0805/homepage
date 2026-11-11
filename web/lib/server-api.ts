import { cookies } from "next/headers";

const API_BASE = (
  process.env.API_INTERNAL_URL ?? "http://api:8000"
).replace(/\/+$/, "");

const VIEWER_COOKIES = [
  "access_token",
  "refresh_token",
  "gallery_access",
] as const;

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
  /**
   * Forward the visitor's auth/gallery cookies so the API can return hidden
   * or protected content for this specific viewer. Authenticated responses
   * are never cached; anonymous requests still use the shared data cache.
   */
  auth?: boolean;
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
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const requestInit: RequestInit & {
    next?: { revalidate: number; tags?: string[] };
  } = {
    headers,
    cache: "force-cache",
  };

  let viewerCookie = "";
  if (options.auth) {
    const cookieStore = await cookies();
    if (VIEWER_COOKIES.some((name) => cookieStore.has(name))) {
      viewerCookie = cookieStore
        .getAll()
        .map(({ name, value }) => `${name}=${value}`)
        .join("; ");
    }
  }

  if (viewerCookie) {
    // The response depends on who is asking, so it must not enter the
    // shared data cache.
    headers.Cookie = viewerCookie;
    requestInit.cache = "no-store";
  } else {
    const revalidate = options.revalidate ?? DEFAULT_REVALIDATE;
    const nextOptions: { revalidate: number; tags?: string[] } = {
      revalidate,
    };
    if (options.tags?.length) {
      nextOptions.tags = options.tags;
    }
    requestInit.next = nextOptions;
  }

  const response = await fetch(`${API_BASE}${path}`, requestInit);

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
