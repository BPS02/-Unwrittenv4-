import type { Genre, Mood } from "./types";
import { hashString, mulberry32, pick, type Rng } from "./rng";

/**
 * Local demo audio: renders a short instrumental sketch in the browser with
 * OfflineAudioContext and encodes it as a WAV blob. Deterministic for a given
 * (title, mood, genre) so demo mode is reproducible. This is intentionally an
 * honest "sketch" — real vocal music requires a dedicated provider
 * (see lib/music/provider.ts and the README).
 */

interface MoodMusic {
  bpm: number;
  /** Chord roots as semitone offsets from the key root, one per bar. */
  progression: number[][];
  /** Scale degrees (semitones) for the lead line. */
  scale: number[];
  bright: number; // filter openness 0..1
  percussion: boolean;
}

const MOOD_MUSIC: Record<Mood, MoodMusic> = {
  Hopeful: { bpm: 96, progression: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], scale: [0, 2, 4, 7, 9], bright: 0.7, percussion: false },
  Bittersweet: { bpm: 84, progression: [[0, 3, 7], [-4, 0, 3], [5, 8, 12], [-2, 2, 5]], scale: [0, 3, 5, 7, 10], bright: 0.5, percussion: false },
  Melancholy: { bpm: 68, progression: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7]], scale: [0, 3, 5, 7, 10], bright: 0.3, percussion: false },
  Peaceful: { bpm: 72, progression: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [0, 4, 7]], scale: [0, 2, 4, 7, 9], bright: 0.4, percussion: false },
  Uplifting: { bpm: 118, progression: [[0, 4, 7], [7, 11, 14], [-3, 0, 4], [5, 9, 12]], scale: [0, 2, 4, 7, 9], bright: 0.9, percussion: true },
  "Raw & honest": { bpm: 80, progression: [[0, 3, 7], [5, 8, 12], [-4, 0, 3], [-2, 2, 5]], scale: [0, 3, 5, 7, 10], bright: 0.45, percussion: false },
  Playful: { bpm: 110, progression: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], scale: [0, 2, 4, 7, 9], bright: 0.85, percussion: true },
  Cinematic: { bpm: 90, progression: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [3, 7, 10]], scale: [0, 2, 3, 7, 8], bright: 0.6, percussion: true },
};

const GENRE_ROOT: Partial<Record<Genre, number>> = {
  Pop: 220.0, // A3
  "Acoustic / Folk": 196.0, // G3
  "R&B / Soul": 174.61, // F3
  Indie: 207.65, // G#3
  Rock: 164.81, // E3
  Country: 196.0,
  "Hip-Hop": 155.56, // D#3
  Electronic: 220.0,
  "Lo-fi": 174.61,
};

export interface DemoAudioSpec {
  title: string;
  mood: Mood;
  genre: Genre;
}

const DURATION_S = 24;
const SAMPLE_RATE = 44100;

export async function renderDemoAudio(spec: DemoAudioSpec): Promise<Blob> {
  const music = MOOD_MUSIC[spec.mood];
  const root = GENRE_ROOT[spec.genre] ?? 196.0;
  const rng = mulberry32(hashString(`${spec.title}|${spec.mood}|${spec.genre}`));

  const ctx = new OfflineAudioContext(2, SAMPLE_RATE * DURATION_S, SAMPLE_RATE);
  const master = ctx.createGain();
  master.gain.value = 0.8;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 800 + music.bright * 4200;
  filter.Q.value = 0.5;

  const reverb = createReverb(ctx, rng);
  const dry = ctx.createGain();
  dry.gain.value = 0.7;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;

  filter.connect(dry).connect(master);
  filter.connect(reverb).connect(wet).connect(master);
  master.connect(ctx.destination);

  // Gentle fade in/out on the master bus.
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(0.8, 1.2);
  master.gain.setValueAtTime(0.8, DURATION_S - 2.5);
  master.gain.linearRampToValueAtTime(0, DURATION_S - 0.05);

  const secondsPerBeat = 60 / music.bpm;
  const barLength = secondsPerBeat * 4;

  for (let bar = 0; bar * barLength < DURATION_S; bar++) {
    const chord = music.progression[bar % music.progression.length];
    if (!chord) continue;
    const start = bar * barLength;
    schedulePad(ctx, filter, root, chord, start, barLength);
    scheduleBass(ctx, filter, root, chord[0] ?? 0, start, barLength, secondsPerBeat);
    scheduleLead(ctx, filter, rng, root, music.scale, start, barLength, secondsPerBeat);
    if (music.percussion) {
      schedulePercussion(ctx, master, rng, start, secondsPerBeat);
    }
  }

  const buffer = await ctx.startRendering();
  return encodeWav(buffer);
}

function createReverb(ctx: OfflineAudioContext, rng: Rng): ConvolverNode {
  const convolver = ctx.createConvolver();
  const length = SAMPLE_RATE * 2.2;
  const impulse = ctx.createBuffer(2, length, SAMPLE_RATE);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (rng() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
  }
  convolver.buffer = impulse;
  return convolver;
}

function freq(root: number, semitones: number): number {
  return root * Math.pow(2, semitones / 12);
}

function schedulePad(
  ctx: OfflineAudioContext,
  out: AudioNode,
  root: number,
  chord: number[],
  start: number,
  barLength: number
): void {
  for (const semis of chord) {
    for (const detune of [-4, 4]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq(root, semis);
      osc.detune.value = detune;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.05, start + barLength * 0.3);
      gain.gain.setValueAtTime(0.05, start + barLength * 0.8);
      gain.gain.linearRampToValueAtTime(0.0, start + barLength * 1.05);
      osc.connect(gain).connect(out);
      osc.start(start);
      osc.stop(start + barLength * 1.1);
    }
  }
}

function scheduleBass(
  ctx: OfflineAudioContext,
  out: AudioNode,
  root: number,
  rootSemis: number,
  start: number,
  barLength: number,
  secondsPerBeat: number
): void {
  for (const beat of [0, 2]) {
    const t = start + beat * secondsPerBeat;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq(root, rootSemis) / 2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.16, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + secondsPerBeat * 1.8);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + barLength);
  }
}

function scheduleLead(
  ctx: OfflineAudioContext,
  out: AudioNode,
  rng: Rng,
  root: number,
  scale: number[],
  start: number,
  barLength: number,
  secondsPerBeat: number
): void {
  const notesPerBar = rng() < 0.5 ? 2 : 3;
  for (let n = 0; n < notesPerBar; n++) {
    if (rng() < 0.25) continue; // leave space
    const t = start + n * (barLength / notesPerBar) + secondsPerBeat * 0.5 * rng();
    const semis = pick(rng, scale) + 12 * (rng() < 0.3 ? 2 : 1);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq(root, semis);
    const gain = ctx.createGain();
    const peak = 0.07 + rng() * 0.04;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + secondsPerBeat * 2.5);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + secondsPerBeat * 3);
  }
}

function schedulePercussion(
  ctx: OfflineAudioContext,
  out: AudioNode,
  rng: Rng,
  start: number,
  secondsPerBeat: number
): void {
  // Soft kick on 1 and 3, hat ticks on offbeats.
  for (const beat of [0, 2]) {
    const t = start + beat * secondsPerBeat;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 0.25);
  }
  for (let beat = 0.5; beat < 4; beat += 1) {
    if (rng() < 0.2) continue;
    const t = start + beat * secondsPerBeat;
    const bufferSize = Math.floor(SAMPLE_RATE * 0.05);
    const buffer = ctx.createBuffer(1, bufferSize, SAMPLE_RATE);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (rng() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    src.connect(hp).connect(gain).connect(out);
    src.start(t);
  }
}

/** Encodes an AudioBuffer as a 16-bit PCM WAV blob. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const dataSize = numFrames * numChannels * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch]?.[i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([arrayBuffer], { type: "audio/wav" });
}
