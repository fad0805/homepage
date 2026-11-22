import { NextResponse, type NextRequest } from "next/server";

/** Forward the finalization request once every staged file has arrived. */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const apiBase =
    process.env.API_INTERNAL_URL?.replace(/\/$/, "") ?? "http://api:8000";
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const contentLength = request.headers.get("content-length");
  const cookie = request.headers.get("cookie");

  if (contentType) headers.set("content-type", contentType);
  if (contentLength) headers.set("content-length", contentLength);
  if (cookie) headers.set("cookie", cookie);

  try {
    const upstream = await fetch(`${apiBase}/illustrations/upload-finalize`, {
      method: "POST",
      headers,
      body: request.body,
      cache: "no-store",
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    console.error("Failed to finalize staged illustration upload", error);
    return NextResponse.json(
      { detail: "삽화 업로드 서버에 연결하지 못했습니다." },
      { status: 502 },
    );
  }
}
