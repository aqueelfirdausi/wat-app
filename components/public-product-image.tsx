/* eslint-disable @next/next/no-img-element */

import type { CSSProperties } from "react";

type PublicProductImageProps = {
  src: string;
  alt: string;
  className: string;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
};

/**
 * Resolved catalogue URLs are authorized on the server before reaching this
 * boundary. A native image keeps temporary safe HTTPS legacy hosts working
 * without a global Next.js remote-image wildcard.
 */
export function PublicProductImage({
  src,
  alt,
  className,
  width,
  height,
  fill = false,
  priority = false
}: PublicProductImageProps) {
  const fillStyle: CSSProperties | undefined = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
    : undefined;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      width={width}
      height={height}
      style={fillStyle}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
    />
  );
}
