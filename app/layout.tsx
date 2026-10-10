import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./themes/white-pink.css";
import "./themes/fullscreen-shell.css";
import "./themes/phone-home.css";
import "./themes/ios-glass.css";
import "./themes/reading-room.css";
import "./themes/clawd-room.css";
import "./themes/blog-room.css";
import "./themes/xp-desktop.css";
import "./themes/xp-chat.css";
import "./themes/xp-buddy.css";
import "./themes/xp-summer.css";
import "./themes/mood.css";
import "./themes/xp-control.css";
import "./themes/cute.css";
import "./themes/sky-wallpaper.css";
import { ThemeProvider } from "./components/ThemeProvider";

export const metadata: Metadata = {
  title: "iooi",
  description: "你的聊天小窝",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "iooi",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#5cbcff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="white-pink" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon-iooi-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
