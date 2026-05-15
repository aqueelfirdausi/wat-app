import { NextRequest } from "next/server";

// Only proxy images from Firebase Storage — prevents open-proxy abuse.
const ALLOWED_HOSTNAME = "firebasestorage.googleapis.com";

export async function GET(request: NextRequest) {
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
      cache: "no-store"
    });

    if (!upstream.ok || !upstream.body) {
      return new Response("Unable to fetch image.", { status: 502 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=86400"
      }
    });
  } catch {
    return new Response("Image proxy request failed.", { status: 502 });
  }
}
