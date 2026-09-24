import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DiscoveryDesk",
  description: "Guided product discovery platform — placeholder shell",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
