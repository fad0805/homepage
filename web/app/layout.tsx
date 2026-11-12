import type { Metadata, Viewport } from "next";
import Link from "next/link";

import "@/public/styles/globals.scss";

import { AuthProvider } from "@/components/auth-provider";
import { FooterShortcut } from "@/components/footer-shortcut";
import { InstallPrompt } from "@/components/install-prompt";
import { Navbar } from "@/components/navbar";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Shortcuts } from "@/components/shortcuts";
import { VisitTracker } from "@/components/visit-tracker";

export const metadata: Metadata = {
  title: "어디에도 없는 섬",
  description: "한 소녀가 있었다.",
  applicationName: "어디에도 없는 섬",
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  appleWebApp: {
    capable: true,
    title: "어디에도 없는 섬",
    statusBarStyle: "default",
  },
  other: {
    // Next emits the standardized flag; Safari still reads the Apple one.
    "apple-mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        type: "image/png",
        sizes: "180x180",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#bedbbb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <VisitTracker />
            <Shortcuts>
              <div id="container">
                <header>
                  <div id="title">
                    <Link href="/">
                      <span className="title__text">어디에도 없는 섬</span>
                      <span className="title__caption">Missing Island</span>
                    </Link>
                  </div>
                  <Navbar />
                </header>
                <main>
                  <div id="content">
                    {children}
                  </div>
                </main>
                <footer>
                  <FooterShortcut />
                </footer>
              </div>
            </Shortcuts>
            <ThemeToggle />
            <InstallPrompt />
            <ServiceWorkerRegister />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
