"use client";

import { useEffect } from "react";

export function IllustrationViewTracker({
  illustrationId,
}: {
  illustrationId: number;
}) {
  useEffect(() => {
    fetch(`/api/illustrations/${illustrationId}/view`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
    }).catch(() => {
      // A failed counter update must never affect the illustration page.
    });
  }, [illustrationId]);

  return null;
}
