import withPWA from "@ducanh2912/next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // WAT_BACKEND is non-secret. Expose the same selector to browser modules so
    // Firebase can remain completely uninitialized in Appwrite mode.
    NEXT_PUBLIC_WAT_BACKEND: process.env.WAT_BACKEND ?? ""
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**"
      }
    ]
  }
};

export default withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true
})(nextConfig);
