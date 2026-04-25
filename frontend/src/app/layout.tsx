import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Book Reader AI",
  description: "Read public domain classics with AI assistance",
  manifest: "/manifest.json",
  openGraph: {
    title: "Book Reader AI",
    description: "Read public domain classics with AI assistance",
    type: "website",
    images: ["/icon.svg"],
  },
  twitter: {
    card: "summary",
    title: "Book Reader AI",
    description: "Read public domain classics with AI assistance",
    images: ["/icon.svg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F59E0B",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
