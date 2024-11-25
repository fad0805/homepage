import type { Metadata } from "next";
import localFont from "next/font/local";
import "./styles/globals.scss";

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
        className={`${geistSans.variable} ${geistMono.variable} ${gowunDodum.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
