import type { Metadata, Viewport } from "next";

import { DEFAULT_LAYOUT, type LayoutKey } from "@/config/appearance";
import { serverApiFetch } from "@/lib/server-api";
import { getCurrentUser } from "@/lib/server-auth";

import "@/public/styles/globals.scss";
import "@/public/styles/appearance.scss";

import { AuthProvider } from "@/components/auth-provider";
import { InstallPrompt } from "@/components/install-prompt";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { SiteShell } from "@/components/site-shell";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentUser = await getCurrentUser();
  let layoutKey: LayoutKey = DEFAULT_LAYOUT;

  try {
    const appearance = await serverApiFetch<{ layout_key: LayoutKey }>(
      currentUser ? "/users/me/appearance" : "/appearance",
      {
        auth: Boolean(currentUser),
        tags: ["appearance"],
      },
    );
    layoutKey = appearance.layout_key;
  } catch (error) {
    console.error("Failed to load the site appearance.", error);
  }

  return (
    <html
      lang="ko"
      data-appearance={layoutKey}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>
          <AuthProvider>
            <VisitTracker />
            <Shortcuts>
              <SiteShell layoutKey={layoutKey}>
                {children}
              </SiteShell>
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
