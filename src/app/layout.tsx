import { MEMBERS_LABEL, SHOW_NAMES } from "@/lib/branding";
import type { Metadata, Viewport } from "next";
import { Cinzel, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The wordmark's face. "KG Finance" is the only thing set in it.
const cinzel = Cinzel({
  variable: "--font-cinzel",
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
    { media: "(prefers-color-scheme: light)", color: "#f4f8ff" },
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
      className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} h-full antialiased`}
      // Smooth scrolling is deliberate here (see SmoothScroll). Saying so
      // stops Next from resetting it on every route change.
      data-scroll-behavior="smooth"
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
