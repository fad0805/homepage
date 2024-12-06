import type { Metadata } from "next";
import localFont from "next/font/local";
import "@/public/styles/globals.scss";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const gowunDodum = localFont({
  src: "./fonts/GowunDodum-Regular.ttf",
  variable: "--font-gowun-dodum",
  weight: "100 900",
});

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
      <body
        className={
          `${geistSans.variable} ${geistMono.variable} ${gowunDodum.variable} antialiased
          flex flex-col items-center justify-center min-h-screen`}
      >
        <main className="md:w-[980px]">
          {children}
        </main>
        <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center">
          © Rimien Siarte. All rights reserved. No external use permitted.
        </footer>
      </body>
    </html>
  );
}
