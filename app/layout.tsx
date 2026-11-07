import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MainStreet AI | Practical AI choices for local business",
  description:
    "Explore clear, practical ways to address real business problems with a transparent recommendation demo.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
