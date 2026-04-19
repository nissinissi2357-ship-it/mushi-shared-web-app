import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ムシムシ探検隊ログ",
  description: "虫の観察記録、ポイント、ランキングを管理する共有向けWebアプリ雛形"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
