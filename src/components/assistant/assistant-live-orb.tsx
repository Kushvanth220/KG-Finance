"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type AssistantLiveOrbState =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "thinking";

interface AssistantLiveOrbProps {
  state: AssistantLiveOrbState;
  /** 0-1 mic / user voice level */
  inputLevel?: number;
  /** 0-1 assistant TTS level */
  outputLevel?: number;
  label?: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}

const NODE_COUNT = 78;
/** Nodes closer than this (in projected px, scaled by canvas size) get a line. */
const LINK_DISTANCE = 0.26;

interface Node {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/** Deterministic pseudo-random so the cloud looks the same shape each mount. */
function seeded(i: number, salt: number) {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function makeNodes(): Node[] {
  return Array.from({ length: NODE_COUNT }, (_, i) => {
    // even-ish spread on a sphere, then jittered inward for depth
    const phi = Math.acos(1 - (2 * (i + 0.5)) / NODE_COUNT);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r = 0.55 + seeded(i, 1) * 0.45;
    return {
      x: Math.cos(theta) * Math.sin(phi) * r,
      y: Math.sin(theta) * Math.sin(phi) * r,
      z: Math.cos(phi) * r,
      vx: (seeded(i, 2) - 0.5) * 0.0016,
      vy: (seeded(i, 3) - 0.5) * 0.0016,
      vz: (seeded(i, 4) - 0.5) * 0.0016,
    };
  });
}

export function AssistantLiveOrb({
  state,
  inputLevel = 0,
  outputLevel = 0,
  label,
  className,
  size = "lg",
}: AssistantLiveOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read levels from a ref so the animation loop never restarts on re-render.
  const levelRef = useRef({ input: 0, output: 0, state });
  // Kept current from an effect rather than in render; the draw loop reads
  // it on its own clock, so a frame's delay is invisible.
  useEffect(() => {
    levelRef.current = { input: inputLevel, output: outputLevel, state };
  }, [inputLevel, outputLevel, state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const nodes = makeNodes();
    let raf = 0;
    let spin = 0;
    let smooth = 0;
    let disposed = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = () => {
      if (disposed) return;
      const { input, output, state: s } = levelRef.current;

      const target =
        s === "speaking" ? output : s === "listening" ? input : s === "thinking" ? 0.3 : s === "connecting" ? 0.18 : 0.04;
      smooth += (target - smooth) * 0.14;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * (0.34 + smooth * 0.1);

      ctx.clearRect(0, 0, w, h);

      // Idle used to draw nothing at all, which is right for a hero orb that
      // only appears mid-call but wrong for a persistent status circle: it read
      // as broken. Now it rests — the network is there, just still and dim.
      const idle = s === "idle";

      // Speaking churns; listening drifts; idle holds position.
      const speed = reduced || idle
        ? 0
        : (s === "speaking" ? 0.0075 : 0.0032) * (1 + smooth * 1.6);
      spin += speed;

      const cos = Math.cos(spin);
      const sin = Math.sin(spin);
      const pts: { x: number; y: number; depth: number }[] = [];

      for (const n of nodes) {
        if (!reduced) {
          n.x += n.vx; n.y += n.vy; n.z += n.vz;
          // keep the cloud from dispersing
          const d = Math.hypot(n.x, n.y, n.z);
          if (d > 1) { n.vx *= -1; n.vy *= -1; n.vz *= -1; }
        }
        // rotate around Y so it reads as 3D
        const rx = n.x * cos - n.z * sin;
        const rz = n.x * sin + n.z * cos;
        const persp = 1 / (1.8 - rz * 0.55);
        pts.push({
          x: cx + rx * radius * persp * 1.9,
          y: cy + n.y * radius * persp * 1.9,
          depth: (rz + 1) / 2,
        });
      }

      // links first, so nodes sit on top
      const linkPx = LINK_DISTANCE * Math.min(w, h);
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i]!.x - pts[j]!.x;
          const dy = pts[i]!.y - pts[j]!.y;
          const dist = Math.hypot(dx, dy);
          if (dist > linkPx) continue;
          const near = 1 - dist / linkPx;
          const depth = (pts[i]!.depth + pts[j]!.depth) / 2;
          const alpha =
          near * near * (0.16 + depth * 0.42) * (0.5 + smooth * 0.9) * (idle ? 0.55 : 1);
          if (alpha < 0.012) continue;
          ctx.strokeStyle = `rgba(130, 226, 255, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(pts[i]!.x, pts[i]!.y);
          ctx.lineTo(pts[j]!.x, pts[j]!.y);
          ctx.stroke();
        }
      }

      for (const p of pts) {
        const r = (0.7 + p.depth * 1.7) * (1 + smooth * 0.5);
        const alpha = 0.3 + p.depth * 0.7;
        ctx.fillStyle = `rgba(200, 245, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // soft core glow that breathes with the voice
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.5);
      glow.addColorStop(0, `rgba(120, 225, 255, ${0.16 + smooth * 0.3})`);
      glow.addColorStop(0.5, `rgba(0, 150, 255, ${0.05 + smooth * 0.1})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      className={cn(
        "assistant-gemini-orb-wrap",
        size === "xs" && "assistant-gemini-orb-wrap-xs",
        size === "sm" && "assistant-gemini-orb-wrap-sm",
        size === "md" && "assistant-gemini-orb-wrap-md",
        size === "lg" && "assistant-gemini-orb-wrap-lg",
        state !== "idle" && "assistant-gemini-orb-wrap-active",
        className
      )}
      data-state={state}
      style={{ "--orb-voice": 0 } as CSSProperties}
      aria-hidden={state === "idle"}
      role="img"
      aria-label={label ?? "Voice AI visualizer"}
    >
      <div className="orb-net-scene">
        <canvas ref={canvasRef} className="orb-net-canvas" />
      </div>
      {label ? <p className="assistant-gemini-orb-caption">{label}</p> : null}
    </div>
  );
}
