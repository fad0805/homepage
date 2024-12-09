import type { Metadata } from "next";
import "@/public/styles/globals.scss";

export const metadata: Metadata = {
  title: "어디에도 없는 섬",
  description: "한 소녀가 있었다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div id="container">
          <header></header>
          <main>
            {children}
          </main>
          <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center">
            © Rimien Siarte. All rights reserved. No external use permitted.
          </footer>
        </div>
      </body>
    </html>
  );
}
