import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "مراکز درمانی نزدیک من",
  description: "یافتن بیمارستان‌ها و درمانگاه‌های نزدیک شما روی نقشه"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
