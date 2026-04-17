import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tim's Dash",
  description: "A polished AUD personal finance dashboard for tracking liquid money, bank cash trends, holdings, and refresh snapshots.",
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
