import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a phone on the home Wi-Fi open the dev server (http://192.168.1.x:3000). Without this,
  // Next blocks the page's dev scripts from that address and the app never starts there.
  allowedDevOrigins: ["192.168.1.*"],
  // The dev server's badge sits bottom-left by default, right on the Home tab, where it
  // swallowed taps. Top-left only covers part of the logo. (Development only.)
  devIndicators: { position: "top-left" },
  experimental: {
    // Page changes run on the browser's view transitions: see src/components/layout/page-transition.tsx.
    viewTransition: true,
  },
};

export default nextConfig;
