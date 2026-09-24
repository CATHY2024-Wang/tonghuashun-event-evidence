import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "事件证据工作台",
  description: "追踪投资事件的原始来源、事实变化与证据冲突。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
