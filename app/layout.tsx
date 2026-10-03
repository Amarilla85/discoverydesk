import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Self-hosted Inter variable font (UX-DR2) — no CDN request at runtime.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DiscoveryDesk",
  description: "Guided product discovery platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {/* UX-DR24: skip link is the first focusable element on every page. */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
