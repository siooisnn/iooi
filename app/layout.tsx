import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./themes/white-pink.css";
import "./themes/picker.css";
import { ThemeProvider } from "./components/ThemeProvider";
import { THEME_INIT_SCRIPT } from "./lib/theme";

export const metadata: Metadata = {
  title: "iooi",
  description: "你的聊天小窝",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "iooi",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#fefbf8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
