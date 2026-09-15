import { ImageResponse } from "next/og";

/**
 * The link preview: the two rings on the dark ground, and the line.
 *
 * ImageResponse draws with a flexbox subset — no masks, no gradient borders —
 * so the rings are solid-coloured strokes, offset so they overlap the way the
 * mark does. Close enough that the card is recognisably ours.
 */

export const alt = "KG Finance — Two people. One set of numbers.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
          background: "linear-gradient(135deg, #0a0d1f 0%, #050508 55%, #120a1e 100%)",
          color: "#f5f5f7",
          fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
          <div style={{ fontSize: 22, letterSpacing: 6, color: "#4da3ff", fontWeight: 700 }}>KG FINANCE</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.02, marginTop: 18, letterSpacing: -2 }}>
            Two people.
          </div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2, color: "#9b8cff" }}>
            One set of numbers.
          </div>
          <div style={{ fontSize: 26, color: "rgba(235,235,245,0.62)", marginTop: 28, lineHeight: 1.4 }}>
            A private finance app for two people — on both phones, always in agreement.
          </div>
        </div>

        <div style={{ display: "flex", position: "relative", width: 330, height: 260 }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 30,
              width: 200,
              height: 200,
              borderRadius: 100,
              border: "34px solid #2a7dff",
              boxShadow: "0 0 80px rgba(0,122,255,0.45)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 118,
              top: 30,
              width: 200,
              height: 200,
              borderRadius: 100,
              border: "34px solid #b45cf0",
              boxShadow: "0 0 80px rgba(175,82,222,0.4)",
            }}
          />
        </div>
      </div>
    ),
    size
  );
}
