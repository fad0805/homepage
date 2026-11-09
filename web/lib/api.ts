import { maybeRevalidatePublicContent } from "@/lib/revalidate";

export async function apiFetch<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
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
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
