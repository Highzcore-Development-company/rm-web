import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import "./globals.css";
import { MotionProvider } from "@/components/motion";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

// Placeholder typefaces until the brand kit lands (P2-001, blocked on D5).
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Highzcore",
    template: "%s · Highzcore",
  },
  description:
    "Link your own Vantage account to our trading bot. You keep custody of your funds — we never hold them.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // data-theme is stamped by THEME_INIT_SCRIPT before React hydrates.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          // Must run before first paint to avoid a flash of the wrong theme.
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <NextIntlClientProvider>
          <MotionProvider>{children}</MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
