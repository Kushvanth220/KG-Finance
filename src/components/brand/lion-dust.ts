/**
 * Magnetic dust: the lion gathering itself out of scattered light.
 *
 * Every particle is given a point on one of the artwork's own strokes —
 * sampled from the ink's alpha, so nothing is redrawn — starts somewhere
 * random on the canvas, and curves in through a pull point near the lion.
 * Particles add their light together instead of painting over each other, so
 * where strokes are dense they glow and the lines resolve without an outline
 * ever being drawn. As the last ones land, the artwork itself fades in on top
 * and carries the fine detail.
 *
 * Drawn with WebGL, and the GPU does all of it: each particle's whole flight
 * is computed in the vertex shader from its start, pull point and target, so
 * a frame costs the CPU three uniforms and three draw calls. (The first
 * version pushed a full-screen pixel buffer every frame — ten megabytes on a
 * laptop screen — and stuttered on exactly the machines it had to impress.)
 */

/** The full engraving, white ink on transparent: particle targets and the final art. */
export const LION_SRC = "/brand/lion.webp";

// The flight. A particle leaves at `s0 × STAGGER` and takes TRAVEL to land.
const STAGGER = 1.4;
const TRAVEL = 2.2;
/** Seconds until the last particle lands. */
export const LION_FORMED_AT = STAGGER + TRAVEL;
const ART_IN = LION_FORMED_AT - 0.35;
const ART_FADE = 0.6;
/** The art has fully faded in; nothing moves after this. */
export const LION_SETTLED_AT = ART_IN + ART_FADE;

// Ice blue (#cbe9fd), on the navy ground of the lion's own palette rings.
const DOT = [203 / 255, 233 / 255, 253 / 255] as const;
const GROUND_IN = [12 / 255, 36 / 255, 104 / 255] as const; // #0c2468
const GROUND_OUT = [3 / 255, 9 / 255, 24 / 255] as const; // #030918

/** Where the lion sits on the canvas, in CSS pixels. */
export interface LionFit {
  size: number;
  cx: number;
  cy: number;
}

/** A laid-out lion: its fit, plus where the artwork actually ends below. */
export interface LionPlacement extends LionFit {
  bottom: number;
}

export interface LionInk {
  w: number;
  h: number;
  /** x, y, alpha triples for every inked pixel of the artwork. */
  pts: Float32Array;
  img: HTMLImageElement;
}

let inkLoad: Promise<LionInk> | null = null;

/** Decodes and samples the artwork once per page; every reveal shares it. */
export function loadLionInk(): Promise<LionInk> {
  if (inkLoad) return inkLoad;
  const load = (async () => {
    const img = new Image();
    img.src = LION_SRC;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) throw new Error("Canvas 2D is unavailable");
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    // Preallocated: pushing a few hundred thousand numbers into an array was
    // a long task of its own, right as the entrance began.
    const pts = new Float32Array(c.width * c.height * 3);
    let m = 0;
    for (let y = 0, o = 3; y < c.height; y++) {
      for (let x = 0; x < c.width; x++, o += 4) {
        const a = data[o];
        if (a > 110) {
          pts[m++] = x;
          pts[m++] = y;
          pts[m++] = a / 255;
        }
      }
    }
    return { w: c.width, h: c.height, pts: pts.slice(0, m), img };
  })();
  // A failed load must not stop the next screen from trying again.
  load.catch(() => {
    inkLoad = null;
  });
  inkLoad = load;
  return load;
}

/** Deterministic randoms, so a resize lands every particle where it was going. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

// One triangle that covers the screen; the radial ground is computed per pixel,
// with a whisper of noise so the gradient does not band.
const GROUND_VS = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const GROUND_FS = `
precision mediump float;
uniform vec2 uCenter;   // device pixels, bottom-left origin
uniform float uRadius;  // device pixels
uniform vec3 uIn;
uniform vec3 uOut;
void main() {
  float d = clamp(distance(gl_FragCoord.xy, uCenter) / uRadius, 0.0, 1.0);
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  gl_FragColor = vec4(mix(uIn, uOut, d) + n / 255.0, 1.0);
}`;

// aA = (target x, target y, s0, s1), aB = (s2, s3, brightness) — all in CSS pixels.
const DUST_VS = `
attribute vec4 aA;
attribute vec3 aB;
uniform float uT;
uniform vec2 uView;
uniform vec2 uCenter;
uniform float uPoint;     // landed: fine, so the strokes resolve
uniform float uPointFar;  // in flight: big enough to read as dust on a 1x laptop screen
varying float vA;
float inOutCubic(float t) {
  if (t < 0.5) return 4.0 * t * t * t;
  float f = 2.0 - 2.0 * t;
  return 1.0 - f * f * f / 2.0;
}
void main() {
  float e = inOutCubic(clamp((uT - aA.z * ${STAGGER.toFixed(2)}) / ${TRAVEL.toFixed(2)}, 0.0, 1.0));
  vec2 s = vec2(aA.w * uView.x, aB.x * uView.y);
  vec2 k = uCenter + vec2((aB.y - 0.5) * uView.x, (aA.w - 0.5) * uView.y) * 0.8;
  float u = 1.0 - e;
  vec2 p = u * u * s + 2.0 * u * e * k + e * e * aA.xy;
  vA = (0.45 + 0.55 * e) * aB.z * 0.85;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
  gl_PointSize = mix(uPointFar, uPoint, smoothstep(0.55, 1.0, e));
}`;
const DUST_FS = `
precision mediump float;
uniform vec3 uDot;
varying float vA;
void main() { gl_FragColor = vec4(uDot * vA, 1.0); }`;

// The artwork: a quad sampling the ink's alpha, tinted ice blue, premultiplied.
const ART_VS = `
attribute vec2 aPos;
uniform vec4 uRect;     // x, y, w, h in clip space
varying vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(uRect.x + aPos.x * uRect.z, uRect.y - aPos.y * uRect.w, 0.0, 1.0);
}`;
const ART_FS = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uInk;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float a = texture2D(uTex, vUv).a * uAlpha;
  gl_FragColor = vec4(uInk * a, a);
}`;

type Uniforms = Record<string, WebGLUniformLocation | null>;
type Program = { p: WebGLProgram; u: Uniforms };

function program(gl: WebGLRenderingContext, vs: string, fs: string, uniforms: string[]): Program {
  const compile = (type: number, src: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("WebGL shader allocation failed");
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return shader;
  };
  const p = gl.createProgram();
  if (!p) throw new Error("WebGL program allocation failed");
  const vertex = compile(gl.VERTEX_SHADER, vs);
  const fragment = compile(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, vertex);
  gl.attachShader(p, fragment);
  gl.linkProgram(p);
  // One status check, after linking: each check makes the CPU wait for the GPU.
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getShaderInfoLog(vertex) || gl.getShaderInfoLog(fragment) || gl.getProgramInfoLog(p) || "link");
  }
  const u: Uniforms = {};
  for (const name of uniforms) u[name] = gl.getUniformLocation(p, name);
  return { p, u };
}

interface Layout extends LionPlacement {
  W: number;
  H: number;
  artH: number;
  n: number;
}

/**
 * One canvas performing the entrance. Throws if WebGL is unavailable — the
 * caller shows the resting lion instead.
 */
export class LionDust {
  private readonly gl: WebGLRenderingContext;
  private readonly ground: Program;
  private readonly dust: Program;
  private readonly art: Program;
  private readonly tri: WebGLBuffer | null;
  private readonly quad: WebGLBuffer | null;
  private readonly particles: WebGLBuffer | null;
  private readonly tex: WebGLTexture | null;
  private dpr = 1;
  private q: Layout | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ink: LionInk,
    private readonly fit: (W: number, H: number) => LionFit,
    /** Most particles a lion gets; small lions get fewer. */
    private readonly density = 32000,
    private readonly dotScale = 1.15
  ) {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) throw new Error("WebGL is unavailable");
    this.gl = gl;
    this.ground = program(gl, GROUND_VS, GROUND_FS, ["uCenter", "uRadius", "uIn", "uOut"]);
    this.dust = program(gl, DUST_VS, DUST_FS, ["uT", "uView", "uCenter", "uPoint", "uPointFar", "uDot"]);
    this.art = program(gl, ART_VS, ART_FS, ["uRect", "uTex", "uInk", "uAlpha"]);

    this.tri = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.particles = gl.createBuffer();

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ink.img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Re-samples for the canvas's current size. Null while it has no size. */
  layout(): LionPlacement | null {
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    if (!W || !H) return null;
    const { gl, ink } = this;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);

    const { size, cx, cy } = this.fit(W, H);
    // Enough particles that the strokes resolve, scaled to how big the lion is drawn.
    const n = Math.round(Math.min(this.density, Math.max(2500, size * size * 0.26)));
    const scale = size / ink.w;
    const artH = ink.h * scale;
    const total = ink.pts.length / 3;
    const rand = seeded(7 + n);
    const data = new Float32Array(n * 7);
    for (let i = 0; i < n; i++) {
      const k = Math.floor(rand() * total) * 3;
      const o = i * 7;
      data[o] = cx - size / 2 + (ink.pts[k] + rand() - 0.5) * scale;
      data[o + 1] = cy - artH / 2 + (ink.pts[k + 1] + rand() - 0.5) * scale;
      data[o + 2] = rand(); // s0: when it leaves
      data[o + 3] = rand(); // s1: start x, pull y
      data[o + 4] = rand(); // s2: start y
      data[o + 5] = rand(); // s3: pull x
      data[o + 6] = 0.55 + 0.45 * ink.pts[k + 2]; // brightness from the stroke's ink
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particles);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    this.q = { W, H, cx, cy, size, artH, n, bottom: cy + artH / 2 };
    return { size, cx, cy, bottom: cy + artH / 2 };
  }

  /** Draws the entrance `t` seconds in. Returns false once it has settled. */
  draw(t: number): boolean {
    const { gl, q, dpr } = this;
    if (!q || gl.isContextLost()) return false;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Ground.
    gl.disable(gl.BLEND);
    gl.useProgram(this.ground.p);
    gl.uniform2f(this.ground.u.uCenter, q.cx * dpr, (q.H - q.cy) * dpr);
    gl.uniform1f(this.ground.u.uRadius, Math.max(q.W, q.H) * 0.75 * dpr);
    gl.uniform3fv(this.ground.u.uIn, GROUND_IN);
    gl.uniform3fv(this.ground.u.uOut, GROUND_OUT);
    const aGround = this.attrib(this.ground.p, "aPos", this.tri, 2, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(aGround);

    // Dust: light adds up, so dense strokes glow.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.dust.p);
    gl.uniform1f(this.dust.u.uT, t);
    gl.uniform2f(this.dust.u.uView, q.W, q.H);
    gl.uniform2f(this.dust.u.uCenter, q.cx, q.cy);
    gl.uniform1f(this.dust.u.uPoint, Math.max(1, Math.round(dpr * this.dotScale)));
    gl.uniform1f(this.dust.u.uPointFar, Math.max(2, dpr * 1.8));
    gl.uniform3fv(this.dust.u.uDot, DOT);
    const aA = this.attrib(this.dust.p, "aA", this.particles, 4, 28, 0);
    const aB = this.attrib(this.dust.p, "aB", this.particles, 3, 28, 16);
    gl.drawArrays(gl.POINTS, 0, q.n);
    gl.disableVertexAttribArray(aA);
    gl.disableVertexAttribArray(aB);

    // The artwork resolves on top as the last particles land.
    const art = Math.min(1, Math.max(0, (t - ART_IN) / ART_FADE));
    if (art > 0.01) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.art.p);
      const x = (q.cx - q.size / 2) / q.W * 2 - 1;
      const y = 1 - (q.cy - q.artH / 2) / q.H * 2;
      gl.uniform4f(this.art.u.uRect, x, y, (q.size / q.W) * 2, (q.artH / q.H) * 2);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(this.art.u.uTex, 0);
      gl.uniform3fv(this.art.u.uInk, DOT);
      gl.uniform1f(this.art.u.uAlpha, art * 0.92);
      const aArt = this.attrib(this.art.p, "aPos", this.quad, 2, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disableVertexAttribArray(aArt);
    }
    return t < LION_SETTLED_AT;
  }

  /** The resting lion: every particle home, the artwork on top. */
  drawSettled() {
    this.draw(LION_SETTLED_AT);
  }

  /**
   * Gives the GPU context back rather than whenever it is collected — but
   * when the page is idle, because releasing it can take a frame or ten and
   * the app has just been revealed.
   */
  dispose() {
    const release = () => this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(release, { timeout: 3000 });
    else setTimeout(release, 1000);
  }

  private attrib(p: WebGLProgram, name: string, buffer: WebGLBuffer | null, size: number, stride: number, offset: number) {
    const { gl } = this;
    const loc = gl.getAttribLocation(p, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
    return loc;
  }
}
