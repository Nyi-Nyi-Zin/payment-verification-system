import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Payment Desk · KBZPay",
  description: "Private KBZPay receipt comparison workspace",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="my">
      <body>{children}</body>
    </html>
  );
}
