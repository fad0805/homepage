import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";

import {
  DEFAULT_COLOR_THEME,
  DEFAULT_LAYOUT,
  DEFAULT_SIDE_POSITION,
  DEFAULT_THEME_MODE,
  type ColorThemeKey,
  type LayoutKey,
  type SidePosition,
  type ThemeMode,
} from "@/config/appearance";
import {
  buildColorThemeStyle,
  getThemeMetaColors,
  type ColorOverrides,
} from "@/lib/color-theme";
import { serverApiFetch } from "@/lib/server-api";

import "@/public/styles/globals.scss";
import "@/public/styles/appearance.scss";

import { AuthProvider } from "@/components/auth-provider";
import { FloatingSearch } from "@/components/floating-search";
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
  const requestHeaders = await headers();
  const authorSlug = requestHeaders.get("x-author-slug");
  const nonce = requestHeaders.get("x-nonce") ?? undefined;

  let layoutKey: LayoutKey = DEFAULT_LAYOUT;
  let sidePosition: SidePosition = DEFAULT_SIDE_POSITION;
  let defaultTheme: ThemeMode = DEFAULT_THEME_MODE;
  let colorTheme: ColorThemeKey = DEFAULT_COLOR_THEME;
  let colorOverrides: ColorOverrides = {};

  if (authorSlug) {
    try {
      const author = await serverApiFetch<{
        appearance: {
          layout_key: LayoutKey;
          side_position: SidePosition;
          default_theme?: ThemeMode;
          color_theme?: ColorThemeKey;
          color_background?: string | null;
          color_content?: string | null;
          color_accent?: string | null;
          color_background_dark?: string | null;
          color_content_dark?: string | null;
          color_accent_dark?: string | null;
        } | null;
      }>(`/profiles/by-slug/${encodeURIComponent(authorSlug)}`, {
        tags: ["profiles"],
      });
      const appearance = author.appearance;
      if (appearance) {
        layoutKey = appearance.layout_key;
        sidePosition = appearance.side_position;
        defaultTheme = appearance.default_theme ?? DEFAULT_THEME_MODE;
        colorTheme = appearance.color_theme ?? DEFAULT_COLOR_THEME;
        colorOverrides = {
          background: appearance.color_background,
          content: appearance.color_content,
          accent: appearance.color_accent,
          darkBackground: appearance.color_background_dark,
          darkContent: appearance.color_content_dark,
          darkAccent: appearance.color_accent_dark,
        };
      }
    } catch (error) {
      console.error("Failed to load the author appearance.", error);
    }
  }

  if (!authorSlug) {
    try {
      const appearance = await serverApiFetch<{
      layout_key: LayoutKey;
      side_position: SidePosition;
      default_theme?: ThemeMode;
      color_theme?: ColorThemeKey;
      color_background?: string | null;
      color_content?: string | null;
      color_accent?: string | null;
      color_background_dark?: string | null;
      color_content_dark?: string | null;
      color_accent_dark?: string | null;
    }>(
      "/appearance",
      {
        tags: ["appearance"],
      },
    );
    layoutKey = appearance.layout_key;
    sidePosition = appearance.side_position ?? DEFAULT_SIDE_POSITION;
    defaultTheme = appearance.default_theme ?? DEFAULT_THEME_MODE;
    colorTheme = appearance.color_theme ?? DEFAULT_COLOR_THEME;
    colorOverrides = {
      background: appearance.color_background,
      content: appearance.color_content,
      accent: appearance.color_accent,
      darkBackground: appearance.color_background_dark,
      darkContent: appearance.color_content_dark,
      darkAccent: appearance.color_accent_dark,
    };
    } catch (error) {
      console.error("Failed to load the site appearance.", error);
    }
  }

  const colorStyle = buildColorThemeStyle(colorTheme, colorOverrides);
  const themeColors = getThemeMetaColors(colorTheme, colorOverrides);

  // The manuscript workspace skips the public site shell but still follows
  // the same appearance palette and light/dark preference.
  if (requestHeaders.get("x-workspace-route") === "1") {
    return (
      <html
        lang="ko"
        data-workspace="manuscript"
        data-color-theme={colorTheme}
        style={colorStyle}
        suppressHydrationWarning
      >
        <body>
          <ThemeProvider
            themeColors={themeColors}
            defaultTheme={defaultTheme}
            nonce={nonce}
          >
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </body>
      </html>
    );
  }

  return (
    <html
      lang="ko"
      data-appearance={layoutKey}
      data-color-theme={colorTheme}
      style={colorStyle}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          themeColors={themeColors}
          defaultTheme={defaultTheme}
          nonce={nonce}
        >
          <AuthProvider>
            <VisitTracker />
            <Shortcuts>
              <SiteShell
                layoutKey={layoutKey}
                sidePosition={sidePosition}
                colorTheme={colorTheme}
                colorOverrides={colorOverrides}
              >
                {children}
              </SiteShell>
            </Shortcuts>
            <FloatingSearch />
            <ThemeToggle />
            <InstallPrompt />
            <ServiceWorkerRegister />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
