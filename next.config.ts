import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Page changes run on the browser's view transitions: see src/components/layout/page-transition.tsx.
    viewTransition: true,
  },
};

export default nextConfig;
