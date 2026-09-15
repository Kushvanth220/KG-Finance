import { MEMBERS_LABEL, SHOW_NAMES } from "@/lib/branding";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KG Finance",
  // Link previews show this line, so it follows the same switch as the UI.
  description: SHOW_NAMES
    ? `Personal finance for ${MEMBERS_LABEL} — KG Finance`
    : "KG Finance — private personal finance",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KG Finance",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* The app's chrome lives in the (app) group's layout; the intro page
          gets this bare document and nothing else. */}
      <body className="min-h-full" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
