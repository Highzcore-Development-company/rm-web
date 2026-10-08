import type { Metadata } from "next";
import { Suspense } from "react";
import { siteUrl } from "@/lib/site";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import "./globals.css";
import { ExtensionNoise } from "@/components/extension-noise";
import { MotionProvider } from "@/components/motion";
import { ToastProvider } from "@/components/toast";
import { RouteProgress } from "@/components/route-progress";
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
  // metadataBase makes every relative canonical and og:url in the app resolve
  // to an absolute URL. Without it Next emits a warning and the OG tags point
  // at nothing, so link previews come back blank.
  metadataBase: new URL(siteUrl()),
  title: {
    // The default is for pages that set no title of their own. It carries the
    // category, not just the brand — "Highzcore" alone is unsearchable.
    default: "Highzcore — Automated Copy Trading on Your Own Account",
    template: "%s · Highzcore",
  },
  description:
    "Automated forex and crypto copy trading through a broker account in your own name. Our bot trades it; you keep custody of your funds. $20 a month, flat.",
  // P2-001. The mark alone, not the wordmark: at 32px a full wordmark is an
  // unreadable smear, while the zigzag stays recognisable.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
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
        <noscript>
          {/* Scroll-reveal sections start at opacity:0 and only JS shows them. */}
          <style>{`[style*="opacity:0"]{opacity:1!important;transform:none!important;filter:none!important}`}</style>
        </noscript>
      </head>
      <body className="min-h-full flex flex-col font-sans">
        {/* Must mount before anything else can reject: a browser extension's
            unhandled rejection is forwarded into the Node render worker in dev
            and kills it. See the component for the full chain. */}
        <ExtensionNoise />
        <NextIntlClientProvider>
          <MotionProvider>
            <ToastProvider>
              {/* useSearchParams needs a boundary, and this must never be the
                  thing that stops a page rendering. */}
              <Suspense fallback={null}>
                <RouteProgress />
              </Suspense>
              {children}
            </ToastProvider>
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
