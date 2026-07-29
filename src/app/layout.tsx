import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { config } from "@/lib/config";

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
    default: `${config.appName} — where are we eating?`,
    template: `%s · ${config.appName}`,
  },
  description:
    "Find, decide on and share lunch spots within a 15-minute walk of the office.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: config.appName,
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
  // Deliberately not maximum-scale=1: pinch-zoom is an accessibility feature,
  // and blocking it to stop iOS input zoom is the wrong trade.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-dolch-bg text-dolch-text min-h-screen`}
      >
        {/* Bottom nav on mobile, side rail on desktop — the main region is
            padded to clear whichever is showing. */}
        <div className="md:pl-60">
          <main className="mx-auto w-full max-w-3xl px-4 pt-4 pb-28 md:pb-10 md:pt-8">
            {children}
          </main>
        </div>
        <BottomNav />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
