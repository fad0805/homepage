const PUBLIC_CONTENT_PREFIXES = [
  "/api/books",
  "/api/chapters",
  "/api/links",
  "/api/characters",
  "/api/profiles",
  "/api/illustrations",
  "/api/users/me/appearance",
];

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function revalidatePublicContent() {
  if (typeof window === "undefined") return;

  void fetch("/revalidate", {
    method: "POST",
    credentials: "include",
    keepalive: true,
  }).catch(() => {
    // Cache invalidation is an optimization; the mutation already succeeded.
  });
}

export function maybeRevalidatePublicContent(
  url: string,
  init: RequestInit,
) {
  const method = (init.method ?? "GET").toUpperCase();
  if (!MUTATION_METHODS.has(method)) return;
  if (url.includes("/upload") || url.includes("/chapter-drafts")) return;
  if (!PUBLIC_CONTENT_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    return;
  }

  revalidatePublicContent();
}
