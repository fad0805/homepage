import type { Metadata } from "next";
import Link from "next/link";

import "@/public/styles/globals.scss";

import { Navbar } from "@/components/navbar";
import { ThemeProvider } from "@/components/theme-provider";
import { Shortcuts } from "@/components/shortcuts";

export const metadata: Metadata = {
  title: "어디에도 없는 섬",
  description: "한 소녀가 있었다.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <ThemeProvider>
          <Shortcuts>
            <div id="container">
              <header>
                <div id="title">
                  <Link href="/">어디에도 없는 섬</Link>
                </div>
                <Navbar />
              </header>
              <main>
                <div id="content">
                  {children}
                </div>
              </main>
              <footer>
                © Rimien Siarte. All rights reserved. No external use permitted.
              </footer>
            </div>
          </Shortcuts>
        </ThemeProvider>
      </body>
    </html>
  );
}
