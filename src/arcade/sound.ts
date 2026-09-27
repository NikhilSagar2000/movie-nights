import { useSyncExternalStore } from "react";

/* Little synthesized sounds for the solo games (no audio files): a few WebAudio blips, pops and chimes.
   One mute switch for all of them, remembered in this browser. */

export type Sfx = "pop" | "blip" | "tick" | "coin" | "chime" | "hit" | "thud" | "zap" | "flap" | "hop" | "boom" | "over" | "best";

let ctx: AudioContext | null = null;
let muted = (() => {
	try {
		return localStorage.getItem("sound") === "off";
	} catch {
		return false;
	}
})();
const subs = new Set<() => void>();

export function setMuted(m: boolean) {
	muted = m;
	try {
		localStorage.setItem("sound", m ? "off" : "on");
	} catch {
		/* no storage: it resets next visit */
	}
	subs.forEach((f) => f());
}
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
export const useMuted = () => useSyncExternalStore(subscribe, () => muted);

/** Call from a tap or key press (browsers only start audio from a gesture; Solo listens for them). Also wakes it after
 *  iOS "interrupted" it (a call, the app in the background). */
export function unlockSound() {
	try {
		ctx ??= new AudioContext();
		if (ctx.state !== "running") void ctx.resume();
	} catch {
		/* no WebAudio: silent */
	}
}

type Tone = { f: number; to?: number; dur: number; type?: OscillatorType; gain?: number; at?: number };
function tone(a: AudioContext, { f, to, dur, type = "sine", gain = 0.12, at = 0 }: Tone) {
	const t = a.currentTime + at;
	const o = a.createOscillator();
	const g = a.createGain();
	o.type = type;
	o.frequency.setValueAtTime(f, t);
	if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	o.connect(g).connect(a.destination);
	o.start(t);
	o.stop(t + dur + 0.02);
}
function noise(a: AudioContext, dur: number, freq: number, gain: number, kind: BiquadFilterType = "bandpass") {
	const t = a.currentTime;
	const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
	const d = buf.getChannelData(0);
	for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
	const src = a.createBufferSource();
	src.buffer = buf;
	const filter = a.createBiquadFilter();
	filter.type = kind;
	filter.frequency.value = freq;
	const g = a.createGain();
	g.gain.setValueAtTime(gain, t);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	src.connect(filter).connect(g).connect(a.destination);
	src.start(t);
}

/** Play a sound. `pitch` scales it (e.g. higher for bigger merges). Silent when muted or before any gesture. */
export function sfx(name: Sfx, pitch = 1) {
	if (muted || !ctx || ctx.state !== "running") return;
	const a = ctx;
	const p = pitch;
	try {
		switch (name) {
			case "pop":
				return tone(a, { f: 520 * p, to: 880 * p, dur: 0.09 });
			case "blip":
				return tone(a, { f: 440 * p, dur: 0.06, type: "square", gain: 0.04 });
			case "tick":
				return tone(a, { f: 1200 * p, dur: 0.035, type: "triangle", gain: 0.05 });
			case "coin":
				tone(a, { f: 880 * p, dur: 0.08, gain: 0.1 });
				return tone(a, { f: 1320 * p, dur: 0.16, gain: 0.1, at: 0.07 });
			case "chime":
				return [1047, 1319, 1568].forEach((f, i) => tone(a, { f: f * p, dur: 0.3, gain: 0.08, at: i * 0.06 }));
			case "hit":
				return tone(a, { f: 240 * p, to: 110 * p, dur: 0.16, type: "triangle", gain: 0.16 });
			case "thud":
				return tone(a, { f: 160 * p, to: 60 * p, dur: 0.13, gain: 0.22 });
			case "zap":
				tone(a, { f: 1500 * p, to: 280 * p, dur: 0.12, type: "sawtooth", gain: 0.05 });
				return noise(a, 0.08, 3000, 0.06, "highpass");
			case "flap":
				return noise(a, 0.12, 900 * p, 0.07);
			case "hop":
				return tone(a, { f: 320 * p, to: 640 * p, dur: 0.11, gain: 0.09 });
			case "boom":
				noise(a, 0.5, 420, 0.3, "lowpass");
				return tone(a, { f: 90, to: 40, dur: 0.45, gain: 0.25 });
			case "over":
				return [523, 392, 262].forEach((f, i) => tone(a, { f, dur: 0.18, type: "triangle", gain: 0.1, at: i * 0.13 }));
			case "best":
				return [523, 659, 784, 1047].forEach((f, i) => tone(a, { f, dur: 0.22, gain: 0.09, at: i * 0.09 }));
		}
	} catch {
		/* a sound is never worth an error */
	}
}
