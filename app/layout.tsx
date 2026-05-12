import type { Metadata, Viewport } from "next";
import "@/app/globals.css";
import { AuthProvider } from "@/components/providers/auth-provider";
import { buildMetadataUrl, getDefaultMeta, getMetadataBase } from "@/lib/metadata";

export const viewport: Viewport = {
  themeColor: "#16c16b"
};

export const metadata: Metadata = {
  manifest: "/manifest.json",
  metadataBase: getMetadataBase(),
  title: "WAT App",
  description: getDefaultMeta().description,
  alternates: {
    canonical: buildMetadataUrl("/")
  },
  openGraph: {
    title: "WAT App",
    description: getDefaultMeta().description,
    url: buildMetadataUrl("/"),
    siteName: "WAT App",
    type: "website",
    images: [
      {
        url: buildMetadataUrl("/opengraph-image"),
        width: 1200,
        height: 630,
        alt: "WAT App - Daily live products from WhatsApp Status"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "WAT App",
    description: getDefaultMeta().description,
    images: [buildMetadataUrl("/opengraph-image")]
  },
  icons: {
    icon: [{ url: "/icon-192.png", type: "image/png" }],
    shortcut: ["/icon-192.png"],
    apple: [{ url: "/icon-192.png", sizes: "180x180", type: "image/png" }]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
