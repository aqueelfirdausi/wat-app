import { NextRequest } from "next/server";
import { isServerAppwriteSelected } from "@/lib/backend/server";

// Only proxy images from Firebase Storage — prevents open-proxy abuse.
const ALLOWED_HOSTNAME = "firebasestorage.googleapis.com";

// Upstream fetch must complete within this window. WhatsApp's scraper
// typically gives up after ~5s; 8s gives Firebase Storage room while
// still returning before most bot timeouts.
const FETCH_TIMEOUT_MS = 8000;

export async function GET(request: NextRequest) {
  if (isServerAppwriteSelected()) {
    return new Response("Image proxy is unavailable for the selected backend.", { status: 404 });
  }

  const source = request.nextUrl.searchParams.get("url")?.trim();

  if (!source) {
    return new Response("Missing url parameter.", { status: 400 });
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(source);
  } catch {
    return new Response("Invalid url parameter.", { status: 400 });
  }

  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== ALLOWED_HOSTNAME) {
    return new Response("URL not allowed.", { status: 403 });
  }

  try {
    const upstream = await fetch(parsedUrl.toString(), {
      headers: { Accept: "image/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });

    if (!upstream.ok || !upstream.body) {
      return new Response("Unable to fetch image.", { status: 502 });
    }

    const responseHeaders: Record<string, string> = {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, s-maxage=86400"
    };

    // Forward Content-Length so scrapers (WhatsApp, Telegram, etc.) know
    // the full payload size and don't abort chunked streams early.
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      responseHeaders["Content-Length"] = contentLength;
    }

    return new Response(upstream.body, {
      status: 200,
      headers: responseHeaders
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    return new Response(
      isTimeout ? "Image fetch timed out." : "Image proxy request failed.",
      { status: 502 }
    );
  }
}
