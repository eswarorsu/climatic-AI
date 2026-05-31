import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Climatic AI",
  description: "City climate, conditions, and recent news powered by an AI agent.",
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
