import { maybeRevalidatePublicContent } from "@/lib/revalidate";

async function requestApi<T>(
  url: string,
  init: RequestInit,
): Promise<{ data: T; headers: Headers }> {
  const headers = new Headers(init.headers);
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  let response = await fetch(url, {
    credentials: "include",
    ...init,
    headers,
  });

  // Access tokens are refreshed lazily. When several requests are in flight
  // with an expired token, the first one rotates the cookies and the rest can
  // briefly see a 401. Retry once so a concurrent refresh doesn't log the
  // user out.
  if (response.status === 401) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    response = await fetch(url, {
      credentials: "include",
      ...init,
      headers,
    });
  }

  if (response.status === 401) {
    window.location.href = "/signin";
    throw new Error("로그인이 필요합니다.");
  }

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
    throw new Error(detail);
  }

  maybeRevalidatePublicContent(url, init);

  if (response.status === 204) {
    return { data: undefined as T, headers: response.headers };
  }

  return {
    data: (await response.json()) as T,
    headers: response.headers,
  };
}

export async function apiFetch<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const { data } = await requestApi<T>(url, init);
  return data;
}

/** Fetch a list together with the API's X-Total-Count header. */
export async function apiFetchWithTotal<T>(
  url: string,
  init: RequestInit = {},
): Promise<{ data: T; total: number | null }> {
  const { data, headers } = await requestApi<T>(url, init);
  const raw = headers.get("x-total-count");
  const total = raw === null ? null : Number(raw);
  return {
    data,
    total: total !== null && Number.isFinite(total) ? total : null,
  };
}

/** Download a binary response while sharing the API's auth/error handling. */
export async function apiDownload(
  url: string,
): Promise<{ blob: Blob; filename: string | null }> {
  let response = await fetch(url, { credentials: "include" });
  if (response.status === 401) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    response = await fetch(url, { credentials: "include" });
  }
  if (response.status === 401) {
    window.location.href = "/signin";
    throw new Error("로그인이 필요합니다.");
  }
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
    throw new Error(detail);
  }

  const disposition = response.headers.get("content-disposition");
  let filename: string | null = null;
  if (disposition) {
    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (encoded) {
      try {
        filename = decodeURIComponent(encoded[1]);
      } catch {
        filename = encoded[1];
      }
    } else {
      filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? null;
    }
  }
  return { blob: await response.blob(), filename };
}
