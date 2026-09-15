const LIVE_INPUT_SAMPLE_RATE = 16000;
const LIVE_OUTPUT_SAMPLE_RATE = 24000;

const MIC_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: LIVE_INPUT_SAMPLE_RATE,
};

let playbackAudioContext: AudioContext | null = null;
let captureAudioContext: AudioContext | null = null;
let audioUnlockPromise: Promise<void> | null = null;

function createAudioContext(): AudioContext {
  const scope = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Ctor) {
    throw new Error("Web Audio is not supported in this browser.");
  }
  return new Ctor();
}

function isUsableContext(context: AudioContext | null): context is AudioContext {
  return !!context && context.state !== "closed";
}

function getOrCreateContext(
  current: AudioContext | null,
  assign: (context: AudioContext) => void
): AudioContext {
  if (!isUsableContext(current)) {
    const next = createAudioContext();
    assign(next);
    return next;
  }
  if (current.state === "suspended") {
    void current.resume();
  }
  return current;
}

/**
 * Speaker-only graph. Must stay separate from the mic graph — Chrome echo
 * cancellation will mute AI playback if both share one AudioContext.
 */
export function getPlaybackAudioContext(): AudioContext {
  return getOrCreateContext(playbackAudioContext, (context) => {
    playbackAudioContext = context;
  });
}

/** Microphone processing only. Never play AI audio through this context. */
export function getCaptureAudioContext(): AudioContext {
  return getOrCreateContext(captureAudioContext, (context) => {
    captureAudioContext = context;
  });
}

/** @deprecated Use getPlaybackAudioContext — kept for wake-button unlock. */
export function getLiveAudioContext(): AudioContext {
  return getPlaybackAudioContext();
}

function playSilentPulse(context: AudioContext) {
  const buffer = context.createBuffer(1, 1, context.sampleRate);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0);
}

/** Browsers block audio until a user gesture — call during the tap that starts voice. */
export async function ensureAudioUnlocked(): Promise<void> {
  if (typeof window === "undefined") return;

  const playback = getPlaybackAudioContext();
  const capture = getCaptureAudioContext();
  if (
    !audioUnlockPromise ||
    playback.state === "suspended" ||
    capture.state === "suspended"
  ) {
    audioUnlockPromise = (async () => {
      await Promise.all([
        playback.state === "suspended" ? playback.resume() : Promise.resolve(),
        capture.state === "suspended" ? capture.resume() : Promise.resolve(),
      ]);
      playSilentPulse(playback);
    })();
  }

  await audioUnlockPromise;
}

export async function requestLiveMicStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone is not supported in this browser.");
  }

  try {
    return await navigator.mediaDevices.getUserMedia({ audio: MIC_AUDIO_CONSTRAINTS });
  } catch {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  }
}

export function arrayBufferToBase64(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Linear resample — works for both downsample (48k→16k) and upsample (24k→48k). */
export function resampleBuffer(
  buffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  if (outputSampleRate === inputSampleRate || buffer.length === 0) return buffer;
  if (inputSampleRate <= 0 || outputSampleRate <= 0) return buffer;

  const ratio = inputSampleRate / outputSampleRate;
  const newLength = Math.max(1, Math.round(buffer.length / ratio));
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i += 1) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, buffer.length - 1);
    const frac = srcIndex - i0;
    result[i] = buffer[i0]! * (1 - frac) + buffer[i1]! * frac;
  }

  return result;
}

export function downsampleBuffer(
  buffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  return resampleBuffer(buffer, inputSampleRate, outputSampleRate);
}

export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]!));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

export function int16ToFloat32(input: Int16Array): Float32Array {
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    output[i] = input[i]! / (input[i]! < 0 ? 0x8000 : 0x7fff);
  }
  return output;
}

export function pcm16LeToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.byteLength);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < pcm.length; i += 1) {
    view.setInt16(i * 2, pcm[i]!, true);
  }
  return arrayBufferToBase64(bytes.buffer);
}

export function base64ToPcm16Le(base64: string): Int16Array {
  const buffer = base64ToArrayBuffer(base64);
  const view = new DataView(buffer);
  const samples = new Int16Array(Math.floor(buffer.byteLength / 2));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = view.getInt16(i * 2, true);
  }
  return samples;
}

export interface MicStreamer {
  stop: () => void;
  setSending: (enabled: boolean) => void;
}

function computeRmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i]!;
    sum += sample * sample;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 10);
}

export async function startMicStreamer(
  onChunk: (base64Pcm: string) => void,
  onLevel?: (level: number) => void,
  options?: { audioContext?: AudioContext; stream?: MediaStream; sending?: boolean }
): Promise<MicStreamer> {
  await ensureAudioUnlocked();

  const stream = options?.stream ?? (await requestLiveMicStream());
  const audioContext = options?.audioContext ?? getCaptureAudioContext();
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  let source: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNode | null = null;
  let gain: GainNode | null = null;

  try {
    source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    gain = audioContext.createGain();
    gain.gain.value = 0;

    let sending = options?.sending ?? false;
    let stopped = false;

    processor.onaudioprocess = (event) => {
      if (stopped) return;
      const channel = event.inputBuffer.getChannelData(0);
      onLevel?.(computeRmsLevel(channel));
      if (!sending) return;

      const downsampled = resampleBuffer(
        channel,
        audioContext.sampleRate,
        LIVE_INPUT_SAMPLE_RATE
      );
      const pcm = floatTo16BitPCM(downsampled);
      onChunk(pcm16LeToBase64(pcm));
    };

    source.connect(processor);
    processor.connect(gain);
    gain.connect(audioContext.destination);

    return {
      setSending: (enabled: boolean) => {
        sending = enabled;
      },
      stop: () => {
        stopped = true;
        sending = false;
        processor?.disconnect();
        source?.disconnect();
        gain?.disconnect();
        stream.getTracks().forEach((track) => track.stop());
      },
    };
  } catch (error) {
    processor?.disconnect();
    source?.disconnect();
    gain?.disconnect();
    if (!options?.stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    throw error;
  }
}

export class LiveAudioPlayer {
  private audioContext: AudioContext;
  private output: GainNode;
  private pending: Float32Array[] = [];
  private pendingSamples = 0;
  private nextStartTime = 0;
  private sources: AudioBufferSourceNode[] = [];
  private closed = false;
  private scheduling = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private levelDecayTimer: ReturnType<typeof setTimeout> | null = null;
  private onLevel?: (level: number) => void;
  /** ~80ms at 24kHz — smaller batch means the reply starts sooner. */
  private readonly minBatchSamples = 1920;

  constructor(options?: { onLevel?: (level: number) => void; audioContext?: AudioContext }) {
    this.onLevel = options?.onLevel;
    this.audioContext = options?.audioContext ?? getPlaybackAudioContext();
    this.output = this.audioContext.createGain();
    this.output.gain.value = 1;
    this.output.connect(this.audioContext.destination);
    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume();
    }
  }

  enqueueBase64Pcm(base64: string) {
    if (this.closed || !base64) return;
    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume();
    }
    const pcm = base64ToPcm16Le(base64);
    if (pcm.length === 0) return;
    this.pending.push(int16ToFloat32(pcm));
    this.pendingSamples += pcm.length;
    this.queueSchedule();
  }

  private queueSchedule() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.pendingSamples >= this.minBatchSamples) {
      void this.schedule();
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.schedule();
    }, 45);
  }

  private takeBatch(): Float32Array | null {
    if (this.pendingSamples === 0) return null;

    const merged = new Float32Array(this.pendingSamples);
    let offset = 0;
    for (const chunk of this.pending) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.pending = [];
    this.pendingSamples = 0;
    return merged;
  }

  private async schedule() {
    if (this.scheduling || this.closed || this.pendingSamples === 0) return;
    this.scheduling = true;

    try {
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      const samples = this.takeBatch();
      if (!samples || samples.length === 0) return;

      const playback = resampleBuffer(
        samples,
        LIVE_OUTPUT_SAMPLE_RATE,
        this.audioContext.sampleRate
      );

      this.onLevel?.(computeRmsLevel(playback));
      if (this.levelDecayTimer) clearTimeout(this.levelDecayTimer);
      this.levelDecayTimer = setTimeout(() => {
        this.onLevel?.(0);
      }, 180);

      const audioBuffer = this.audioContext.createBuffer(
        1,
        playback.length,
        this.audioContext.sampleRate
      );
      audioBuffer.getChannelData(0).set(playback);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.output);
      source.onended = () => {
        this.sources = this.sources.filter((item) => item !== source);
      };
      this.sources.push(source);

      const startAt = Math.max(this.audioContext.currentTime + 0.02, this.nextStartTime);
      source.start(startAt);
      this.nextStartTime = startAt + audioBuffer.duration;
    } catch {
      if (this.audioContext.state === "suspended") {
        void this.audioContext.resume();
      }
    } finally {
      this.scheduling = false;
      if (this.pendingSamples > 0 && !this.closed) {
        this.queueSchedule();
      }
    }
  }

  get isSpeaking() {
    if (this.closed) return false;
    if (this.pendingSamples > 0 || this.sources.length > 0) return true;
    return this.nextStartTime > this.audioContext.currentTime + 0.05;
  }

  /** Drop queued and playing audio so a new reply cannot overlap the last one. */
  interrupt() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.levelDecayTimer) {
      clearTimeout(this.levelDecayTimer);
      this.levelDecayTimer = null;
    }
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.sources = [];
    this.pending = [];
    this.pendingSamples = 0;
    this.nextStartTime = 0;
    this.onLevel?.(0);
  }

  stop() {
    this.closed = true;
    this.interrupt();
    try {
      this.output.disconnect();
    } catch {
      // Already disconnected.
    }
  }
}

export { LIVE_INPUT_SAMPLE_RATE, LIVE_OUTPUT_SAMPLE_RATE };
