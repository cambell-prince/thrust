#!/usr/bin/env node
// Synthesize the game's retro (sfxr-style) sound effects into public/assets/audio/*.wav.
// Deterministic: noise comes from a seeded PRNG, so re-running gives the same files.
// Tweak a sound's entry in SOUNDS and run `npm run sfx` again.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'audio');

/** xorshift32: a small seeded PRNG giving 0..1. */
function prng(seed) {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13; s >>>= 0;
		s ^= s >>> 17;
		s ^= s << 5; s >>>= 0;
		return s / 4294967296;
	};
}

/**
 * One voice: a wave at a frequency sliding from `freq` to `freqEnd` (Hz) over `duration` (s),
 * shaped by a linear attack and an exponential-ish decay. `steps` (Hz list) instead plays notes
 * in equal slices (an arpeggio). Noise is sample-and-hold, refreshed at the voice's frequency.
 */
function voice({ wave, duration, freq = 440, freqEnd = freq, steps, attack = 0.005, decay = 1, duty = 0.5, gain = 1, seed = 1 }) {
	const n = Math.round(duration * RATE);
	const out = new Float32Array(n);
	const rand = prng(seed);
	let phase = 0;
	let held = 0;
	for (let i = 0; i < n; i++) {
		const t = i / n;
		const f = steps ? steps[Math.min(steps.length - 1, Math.floor(t * steps.length))] : freq * Math.pow(freqEnd / freq, t);
		const prev = phase;
		phase = (phase + f / RATE) % 1;
		let s;
		switch (wave) {
			case 'square': s = phase < duty ? 1 : -1; break;
			case 'saw': s = 2 * phase - 1; break;
			case 'triangle': s = 1 - 4 * Math.abs(phase - 0.5); break;
			case 'noise': if (phase < prev) held = rand() * 2 - 1; s = held; break;
			default: throw new Error(`unknown wave ${wave}`);
		}
		const time = i / RATE;
		const env = Math.min(1, time / attack) * Math.pow(1 - t, decay);
		out[i] = s * env * gain;
	}
	return out;
}

/** One-pole low-pass filter; `cutoff` in Hz. */
function lowpass(samples, cutoff) {
	const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
	let y = 0;
	return samples.map((x) => (y += a * (x - y)));
}

/** Sum voices (padding the shorter ones with silence). */
function mix(...parts) {
	const out = new Float32Array(Math.max(...parts.map((p) => p.length)));
	for (const p of parts) p.forEach((v, i) => { out[i] += v; });
	return out;
}

/**
 * Make a seamless loop: crossfade the last `fade` seconds into the start, then drop them.
 * Equal-power weights, so uncorrelated noise keeps its level through the fade (a linear fade dips ~3 dB).
 */
function seamless(samples, fade) {
	const f = Math.round(fade * RATE);
	const out = samples.slice(0, samples.length - f);
	for (let i = 0; i < f; i++) {
		const w = i / f;
		out[i] = out[i] * Math.sqrt(w) + samples[samples.length - f + i] * Math.sqrt(1 - w);
	}
	return out;
}

/** Scale so the peak is `peak` of full scale. */
function normalize(samples, peak = 0.9) {
	const max = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
	return samples.map((v) => (v / max) * peak);
}

function wav(samples) {
	const data = Buffer.alloc(samples.length * 2);
	samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
	const h = Buffer.alloc(44);
	h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
	h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
	h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
	h.write('data', 36); h.writeUInt32LE(data.length, 40);
	return Buffer.concat([h, data]);
}

const SOUNDS = {
	// Short square blip, falling pitch.
	'ship-shot': () => voice({ wave: 'square', duration: 0.14, freq: 1400, freqEnd: 350, decay: 1.5, duty: 0.5 }),
	// Low, buzzy saw shot with a touch of noise: unlike the ship's.
	'enemy-shot': () => mix(
		voice({ wave: 'saw', duration: 0.22, freq: 520, freqEnd: 160, decay: 1.2 }),
		voice({ wave: 'noise', duration: 0.08, freq: 6000, decay: 2, gain: 0.3, seed: 7 }),
	),
	// Noise burst whose grain slows as it decays.
	explosion: () => lowpass(voice({ wave: 'noise', duration: 0.7, freq: 4000, freqEnd: 300, attack: 0.002, decay: 2.2, seed: 3 }), 3000),
	// Rising two-note bling.
	pickup: () => voice({ wave: 'square', duration: 0.18, steps: [988, 1319], decay: 0.6, duty: 0.25 }),
	// Brighter rising three-note arpeggio.
	'drop-off': () => mix(
		voice({ wave: 'square', duration: 0.3, steps: [1047, 1319, 1568], decay: 0.5, duty: 0.25 }),
		voice({ wave: 'triangle', duration: 0.3, steps: [2094, 2638, 3136], decay: 0.8, gain: 0.3 }),
	),
	// ~1 s low rumble, constant level (no envelope), crossfaded so it loops without a click.
	thrust: () => seamless(lowpass(voice({ wave: 'noise', duration: 1.1, freq: 2500, attack: 0.0001, decay: 0, seed: 11 }), 500), 0.1),
};

mkdirSync(OUT, { recursive: true });
for (const [name, make] of Object.entries(SOUNDS)) {
	const samples = normalize(make());
	writeFileSync(join(OUT, `${name}.wav`), wav(samples));
	console.log(`audio/${name}.wav  ${(samples.length / RATE).toFixed(2)} s`);
}
