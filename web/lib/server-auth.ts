import { cookies } from "next/headers";
import { cache } from "react";

const API_BASE = (
  process.env.API_INTERNAL_URL ?? "http://api:8000"
).replace(/\/+$/, "");

export interface CurrentUser {
  username: string;
}

/**
 * Resolve the logged-in user from the request cookies.
 *
 * The API's /users/me endpoint can rotate cookies, which a server component
 * cannot send back to the browser. /users/me/status performs the same auth
 * check without rotating tokens.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  if (
    !cookieStore.has("access_token") &&
    !cookieStore.has("refresh_token")
  ) {
    return null;
  }

  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");

  try {
    const response = await fetch(`${API_BASE}/users/me/status`, {
      headers: {
        Accept: "application/json",
        Cookie: cookieHeader,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      success?: boolean;
      user?: unknown;
    };
    if (data.success && typeof data.user === "string") {
      return { username: data.user };
    }
  } catch (error) {
    console.error("Failed to check the current user.", error);
  }

  return null;
});
