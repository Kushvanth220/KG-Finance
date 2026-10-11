import type { MetadataRoute } from "next";

/**
 * What a phone needs to install the app.
 *
 * On iPhone this is also what makes notifications possible at all: Safari
 * only offers Web Push to a site added to the Home Screen as a standalone app.
 * Android uses the icons and name for its install prompt and splash.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KG Finance",
    short_name: "KG Finance",
    description: "Private personal finance",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#031a5c",
    theme_color: "#031a5c",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
