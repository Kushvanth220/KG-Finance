import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The link preview: the lion on the dark ground, and the line.
 *
 * ImageResponse draws with a flexbox subset and cannot mask, so the lion is
 * a ready-tinted ice-blue copy of the artwork rather than the white ink the
 * app masks.
 */

export const alt = "KG Finance — Two people. One set of numbers.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const lion = await readFile(join(process.cwd(), "public/brand/lion-ice.png"), "base64");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "80px 96px",
          background: "linear-gradient(135deg, #02040c 0%, #02040c 55%, #03195b 100%)",
          color: "#f4f8ff",
          fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
          <div style={{ fontSize: 22, letterSpacing: 6, color: "#6cc6ff", fontWeight: 700 }}>KG FINANCE</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.02, marginTop: 18, letterSpacing: -2 }}>
            Two people.
          </div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2, color: "#7fb0fd" }}>
            One set of numbers.
          </div>
          <div style={{ fontSize: 26, color: "rgba(235,235,245,0.62)", marginTop: 28, lineHeight: 1.4 }}>
            A private finance app for two people — on both phones, always in agreement.
          </div>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image */}
        <img src={`data:image/png;base64,${lion}`} width={330} height={336} alt="" />
      </div>
    ),
    size
  );
}
