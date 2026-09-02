import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import AddToHomeScreenPrompt from "@/components/AddToHomeScreenPrompt";
import RecoveryNudgePrompt from "@/components/RecoveryNudgePrompt";
import { InstallPromptProvider } from "@/components/InstallPromptProvider";
import { LiveAnnouncerProvider } from "@/components/LiveAnnouncer";
import { ToastProvider } from "@/components/Toast";
import AppVisitTracker from "@/components/AppVisitTracker";
import { config } from "@/lib/config";
import { getValidatedUser } from "@/lib/supabase/serverAuth";

/**
 * Display face. Bold, warm and geometric — it echoes the pebble mark, which
 * neither Geist nor anything else neutral does. Headlines only: at body sizes
 * its personality gets in the way of dense screens, which is what Geist is for.
 */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

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
  themeColor: "#c0392b",
  width: "device-width",
  initialScale: 1,
  // Deliberately not maximum-scale=1: pinch-zoom is an accessibility feature,
  // and blocking it to stop iOS input zoom is the wrong trade.
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Daily Activity Log's page-view beacon (§3) — only mounted for a
  // signed-in user, per the spec: a visitor who never signs in has
  // nothing to attribute a visit to.
  const user = await getValidatedUser();

  return (
    <html lang="en">
      <body
        className={`${bricolage.variable} ${geistSans.variable} ${geistMono.variable} bg-paper text-ink min-h-screen`}
      >
        <LiveAnnouncerProvider>
          <ToastProvider>
            <InstallPromptProvider>
              {/* Bottom nav on mobile, side rail on desktop — the main
                  region is padded to clear whichever is showing. */}
              <div className="md:pl-60">
                <main className="mx-auto w-full max-w-3xl px-4 pt-4 pb-28 md:pb-10 md:pt-8">
                  {children}
                </main>
              </div>
              <BottomNav />
              <ServiceWorkerRegister />
              <AddToHomeScreenPrompt />
              <RecoveryNudgePrompt />
            </InstallPromptProvider>
          </ToastProvider>
        </LiveAnnouncerProvider>
        {user && <AppVisitTracker />}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
