import type { Metadata } from "next";
import "@/app/globals.css";
import { AuthProvider } from "@/components/providers/auth-provider";
import { buildMetadataUrl, getDefaultMeta, getMetadataBase } from "@/lib/metadata";

export const metadata: Metadata = {
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
