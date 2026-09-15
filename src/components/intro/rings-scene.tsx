"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * The KG mark as an object, not a drawing.
 *
 * Two rings chain-linked in 3D — each passes through the other's hole — lit in
 * the logo's own gradients and slowly turning. The scene follows the cursor a
 * little and the scroll a little, enough to feel held rather than played.
 *
 * It can also be handled: drag to spin it (it keeps going and settles), tap
 * to make it pulse. The mark is the one object on the page you can touch.
 *
 * Geometry: ring A lies in XY at x = -0.95, ring B in XZ at x = +0.95, both
 * radius 1.3, tube 0.24. B's tube crosses A's plane at x ≈ -0.35, inside A's
 * hole (-2.01 … 0.11) and 0.22 clear of A's tube — a real link, no clipping.
 */

const RING_RADIUS = 1.3;
const TUBE = 0.24;
const OFFSET = 0.95;

const LEFT_A = new THREE.Color("#0A84FF");
const LEFT_B = new THREE.Color("#5E5CE6");
const RIGHT_A = new THREE.Color("#7F5AF0");
const RIGHT_B = new THREE.Color("#C74FE6");

/** Colour each vertex by its angle around the ring, so the gradient wraps. */
function ringGeometry(from: THREE.Color, to: THREE.Color): THREE.TorusGeometry {
  const geometry = new THREE.TorusGeometry(RING_RADIUS, TUBE, 48, 180);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const scratch = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const angle = Math.atan2(position.getY(i), position.getX(i));
    // 0 at the left of the ring, 1 at the right, mirrored so it reads as one sweep.
    const t = (Math.cos(angle) + 1) / 2;
    scratch.copy(from).lerp(to, t);
    colors[i * 3] = scratch.r;
    colors[i * 3 + 1] = scratch.g;
    colors[i * 3 + 2] = scratch.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** A soft radial disc for the glow behind each ring. */
function glowTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,0.9)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.35)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function particles(count: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [new THREE.Color("#007aff"), new THREE.Color("#af52de"), new THREE.Color("#ffffff")];
  for (let i = 0; i < count; i++) {
    // A shell around the rings, never inside them.
    const r = 3.5 + Math.random() * 5.5;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
    positions[i * 3 + 2] = r * Math.cos(phi) - 2;
    const c = palette[Math.floor(Math.random() * palette.length)]!;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.04,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  return new THREE.Points(geometry, material);
}

export function RingsScene({ className }: { className?: string }) {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      // No WebGL: the CSS glow behind the canvas still carries the hero.
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    camera.position.set(0, 0, 7.2);

    // ---- the mark ----
    const group = new THREE.Group();
    const material = (emissive: string) =>
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        metalness: 0.4,
        roughness: 0.22,
        clearcoat: 0.7,
        clearcoatRoughness: 0.2,
        emissive: new THREE.Color(emissive),
        emissiveIntensity: 0.28,
      });

    const left = new THREE.Mesh(ringGeometry(LEFT_A, LEFT_B), material("#1f4fd6"));
    left.position.x = -OFFSET;

    const right = new THREE.Mesh(ringGeometry(RIGHT_A, RIGHT_B), material("#7b3fc8"));
    right.position.x = OFFSET;
    right.rotation.x = Math.PI / 2;

    group.add(left, right);
    // Viewed from a little above and to the side, so both rings read as ovals.
    group.rotation.set(0.28, 0.6, 0);
    scene.add(group);

    // ---- glow ----
    const glow = glowTexture();
    const disc = (color: string, x: number, scale: number) => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glow,
          color: new THREE.Color(color),
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      sprite.position.set(x, 0, -1.2);
      sprite.scale.setScalar(scale);
      return sprite;
    };
    scene.add(disc("#007aff", -1.1, 6.5), disc("#af52de", 1.1, 6.5));

    // ---- dust ----
    const dust = particles(520);
    scene.add(dust);

    // ---- light riding each ring ----
    // A few bright points travel the ring's own path, so the geometry is
    // traced by motion as well as by shading — the chain is seen turning
    // even when the whole group is still.
    const RIDERS = 18;
    const riderGeometry = new THREE.BufferGeometry();
    riderGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RIDERS * 3), 3));
    const riderColors = new Float32Array(RIDERS * 3);
    for (let i = 0; i < RIDERS; i++) {
      const c = i < RIDERS / 2 ? new THREE.Color("#7fc0ff") : new THREE.Color("#e0a0ff");
      riderColors[i * 3] = c.r;
      riderColors[i * 3 + 1] = c.g;
      riderColors[i * 3 + 2] = c.b;
    }
    riderGeometry.setAttribute("color", new THREE.BufferAttribute(riderColors, 3));
    const riders = new THREE.Points(
      riderGeometry,
      new THREE.PointsMaterial({
        size: 0.11,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    group.add(riders);
    const riderPositions = riderGeometry.attributes.position as THREE.BufferAttribute;
    const placeRiders = (t: number) => {
      const half = RIDERS / 2;
      for (let i = 0; i < RIDERS; i++) {
        const onLeft = i < half;
        const k = onLeft ? i : i - half;
        // Spread along the ring, drifting with time; the two rings run opposite ways.
        const angle = (k / half) * Math.PI * 2 + t * (onLeft ? 0.5 : -0.5);
        const x = Math.cos(angle) * (RING_RADIUS + TUBE * 0.15);
        const y = Math.sin(angle) * (RING_RADIUS + TUBE * 0.15);
        if (onLeft) {
          riderPositions.setXYZ(i, x - OFFSET, y, 0);
        } else {
          // The right ring lies in XZ (rotated 90° about X), so its y is our z.
          riderPositions.setXYZ(i, x + OFFSET, 0, -y);
        }
      }
      riderPositions.needsUpdate = true;
    };
    placeRiders(0);

    // ---- light ----
    scene.add(new THREE.AmbientLight(0x50507a, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 3, 5);
    const blue = new THREE.PointLight(0x2f8bff, 60, 20, 2);
    blue.position.set(-3.5, 2, 3.5);
    const purple = new THREE.PointLight(0xc060ff, 60, 20, 2);
    purple.position.set(3.5, -1.5, 3.5);
    scene.add(key, blue, purple);

    // ---- input ----
    const pointer = { x: 0, y: 0 };
    // Dragging adds to the spin directly; letting go leaves a velocity that
    // decays, so a flick keeps turning for a moment instead of stopping dead.
    const drag = { active: false, lastX: 0, lastT: 0, velocity: 0, moved: 0 };
    let pulse = 0;
    let spinExtra = 0;

    const onPointer = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      if (drag.active) {
        const dx = event.clientX - drag.lastX;
        const dt = Math.max(1, event.timeStamp - drag.lastT);
        spinExtra += dx * 0.006;
        drag.velocity = (dx / dt) * 0.006 * 16;
        drag.moved += Math.abs(dx);
        drag.lastX = event.clientX;
        drag.lastT = event.timeStamp;
      }
    };
    const onDown = (event: PointerEvent) => {
      drag.active = true;
      drag.lastX = event.clientX;
      drag.lastT = event.timeStamp;
      drag.velocity = 0;
      drag.moved = 0;
      host.setPointerCapture(event.pointerId);
      host.style.cursor = "grabbing";
    };
    const onUp = (event: PointerEvent) => {
      if (!drag.active) return;
      drag.active = false;
      host.releasePointerCapture(event.pointerId);
      host.style.cursor = "grab";
      // A press without a drag is a tap: the mark answers with a pulse.
      if (drag.moved < 4) pulse = 1;
    };
    const onLeave = () => {
      pointer.x = 0;
      pointer.y = 0;
    };
    host.style.cursor = "grab";
    host.style.touchAction = "pan-y";
    host.addEventListener("pointermove", onPointer);
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("pointercancel", onUp);
    host.addEventListener("pointerleave", onLeave);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      // On a narrow screen the mark must still fit with room to breathe; on a
      // wide one it moves right so the headline has the left to itself.
      camera.position.z = w < 640 ? 9.4 : 7.2;
      group.position.x = w < 640 ? 0 : w < 1100 ? 1.1 : 1.8;
      group.position.y = w < 640 ? 0.9 : 0.2;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    // ---- loop ----
    let frame = 0;
    let spin = 0;
    // Where the mark rests vertically; the bob oscillates around it.
    const baseLift = group.position.y;
    const baseX = 0.28;
    const baseY = 0.6;
    const timer = new THREE.Timer();

    const render = () => {
      timer.update();
      const t = timer.getElapsed();
      if (!still) spin += 0.0022;

      // Momentum from a flick, fading out.
      if (!drag.active && Math.abs(drag.velocity) > 0.0002) {
        spinExtra += drag.velocity;
        drag.velocity *= 0.94;
      }
      // The pulse is a quick swell that eases back.
      if (pulse > 0) {
        pulse = Math.max(0, pulse - 0.04);
        const swell = 1 + Math.sin(pulse * Math.PI) * 0.07;
        group.scale.setScalar(swell);
      }

      const scroll = typeof window !== "undefined" ? window.scrollY : 0;
      const targetY = baseY + spin + spinExtra + pointer.x * 0.35;
      const targetX = baseX + pointer.y * -0.22 + Math.min(scroll, 600) * 0.0006;
      group.rotation.y += (targetY - group.rotation.y) * (drag.active ? 0.35 : 0.06);
      group.rotation.x += (targetX - group.rotation.x) * 0.06;
      if (!still) group.position.y += (Math.sin(t * 0.8) * 0.08 - (group.position.y - baseLift)) * 0.05;

      if (!still) {
        dust.rotation.y = -t * 0.02;
        dust.rotation.x = Math.sin(t * 0.1) * 0.05;
        placeRiders(t);
      }

      renderer.render(scene, camera);
      if (!still) frame = requestAnimationFrame(render);
    };

    if (still) {
      // One frame, plus one on any resize; nothing moves.
      render();
      const rerender = () => render();
      const ro = new ResizeObserver(rerender);
      ro.observe(host);
      return () => {
        ro.disconnect();
        observer.disconnect();
        host.removeEventListener("pointermove", onPointer);
        host.removeEventListener("pointerdown", onDown);
        host.removeEventListener("pointerup", onUp);
        host.removeEventListener("pointercancel", onUp);
        host.removeEventListener("pointerleave", onLeave);
        renderer.dispose();
        host.removeChild(renderer.domElement);
      };
    }

    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener("pointermove", onPointer);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onUp);
      host.removeEventListener("pointerleave", onLeave);
      left.geometry.dispose();
      right.geometry.dispose();
      (left.material as THREE.Material).dispose();
      (right.material as THREE.Material).dispose();
      dust.geometry.dispose();
      (dust.material as THREE.Material).dispose();
      riderGeometry.dispose();
      (riders.material as THREE.Material).dispose();
      glow.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mount} className={className} aria-hidden="true" />;
}
