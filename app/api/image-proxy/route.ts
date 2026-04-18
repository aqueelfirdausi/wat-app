import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("url")?.trim();

  if (!source) {
    return new Response("Missing image URL.", { status: 400 });
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(source);
  } catch {
    return new Response("Invalid image URL.", { status: 400 });
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return new Response("Unsupported image URL.", { status: 400 });
  }

  try {
    const upstream = await fetch(parsedUrl.toString(), {
      headers: {
        Accept: "image/*"
      },
      cache: "no-store"
    });

    if (!upstream.ok || !upstream.body) {
      return new Response("Unable to fetch image.", { status: 502 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=300, s-maxage=300"
      }
    });
  } catch {
    return new Response("Image proxy request failed.", { status: 502 });
  }
}
