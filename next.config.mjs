import withPWA from "@ducanh2912/next-pwa";

function appwriteImagePattern() {
  if (process.env.WAT_BACKEND !== "appwrite") return null;
  const value = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  if (!value) return null;

  try {
    const endpoint = new URL(value);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.pathname.replace(/\/+$/, "") !== "/v1"
    ) {
      return null;
    }
    return {
      protocol: "https",
      hostname: endpoint.hostname,
      port: endpoint.port,
      pathname: "/v1/storage/buckets/product_images/files/**"
    };
  } catch {
    return null;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // WAT_BACKEND is non-secret. Expose the same selector to browser modules so
    // Firebase can remain completely uninitialized in Appwrite mode.
    NEXT_PUBLIC_WAT_BACKEND: process.env.WAT_BACKEND ?? ""
  },
  images: {
    // Firebase rollback retains its existing dynamic-host policy. Appwrite mode
    // permits only the configured storage path; temporary legacy catalogue
    // images render through the scoped native public-image component instead.
    remotePatterns:
      process.env.WAT_BACKEND === "appwrite"
        ? [appwriteImagePattern()].filter(Boolean)
        : [{ protocol: "https", hostname: "**" }]
  }
};

export default withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true
})(nextConfig);
