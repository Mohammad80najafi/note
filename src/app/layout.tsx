import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Notion",
  description: "A faithful Notion clone — Rust (Axum + SQLite) backend with a Next.js frontend.",
  icons: { icon: "https://em-content.zobj.net/source/apple/391/memo_1f4dd.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {/* Vazirmatn — Persian UI typeface (falls back to system fonts offline) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap"
          precedence="default"
        />
        {children}
      </body>
    </html>
  );
}
