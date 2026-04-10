import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Book Reader AI",
  description: "Read public domain classics with AI assistance",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
