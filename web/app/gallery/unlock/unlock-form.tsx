"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function UnlockForm({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/gallery/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        let detail = "비밀번호가 올바르지 않거나 만료되었습니다.";
        try {
          const data = (await response.json()) as { detail?: unknown };
          if (typeof data.detail === "string") {
            detail = data.detail;
          }
        } catch {
          // Ignore malformed error bodies.
        }
        setError(detail);
        return;
      }

      router.replace(next);
      router.refresh();
    } catch {
      setError("요청에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>삽화 열람</h2>
      <p className="gallery-help">
        관리자에게 받은 일회용 비밀번호를 입력해주세요.
      </p>
      <div className="inputs">
        <input
          type="text"
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          required
        />
      </div>
      {error ? <p className="gallery-error">{error}</p> : null}
      <button type="submit" disabled={loading}>
        {loading ? "확인 중..." : "들어가기"}
      </button>
    </form>
  );
}
