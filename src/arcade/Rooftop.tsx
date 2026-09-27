import { useEffect, useRef, useState } from "react";
import { Head } from "../Character";
import { palette, rand, reduced, useCanvas, useKeys, useLoop, type SoloApi } from "./kit";
import { GROUND, H, HEAD, HEAD_H, jump, metres, newRun, RUN_X, step, W, type Ob, type Run } from "./logic/run";
import "./run.css";

/* Rooftop Run: your head runs across the rooftops at night, under the moon, past a sleepy skyline. Jump the black
   water tanks and the dish antennas; hold the jump to go a little higher. It speeds up as you go. */

type Tower = { x: number; w: number; h: number; lit: [number, number][] };
// Two skyline strips, each a repeating tile: far (slow, hazy, tall) and near (faster, the next rooftops over).
const FAR = skyline(900, 60, 150, 0.08);
const NEAR = skyline(760, 24, 76, 0.28);
const BLACK = "#161b21"; // tank black, a touch darker than the night sky so it stands out: drawing ink, not a UI colour
const STARS = Array.from({ length: 24 }, () => [rand(0, W), rand(6, 150), rand(0.7, 1.5)]);

export default function Rooftop({ api }: { api: SoloApi }) {
	const r = useRef<Run>(newRun());
	const hold = useRef({ key: false, finger: false });
	const me = useRef<HTMLSpanElement>(null);
	const [crashed, setCrashed] = useState(false);
	const [still] = useState(reduced);
	const { ref, redraw } = useCanvas(W, H, (g) => paint(g, r.current, still));
	const up = () => (r.current = jump(r.current));

	useKeys((k, e) => {
		if (k !== " " && k !== "ArrowUp") return;
		hold.current.key = true;
		if (!e.repeat) up();
		return true;
	}, !api.paused);
	// letting go anywhere (even off the field) ends the hold
	useEffect(() => {
		const key = (e: KeyboardEvent) => (e.key === " " || e.key === "ArrowUp") && (hold.current.key = false);
		const finger = () => (hold.current.finger = false);
		const all = () => (hold.current = { key: false, finger: false });
		addEventListener("keyup", key);
		addEventListener("pointerup", finger);
		addEventListener("pointercancel", finger);
		addEventListener("blur", all);
		return () => {
			removeEventListener("keyup", key);
			removeEventListener("pointerup", finger);
			removeEventListener("pointercancel", finger);
			removeEventListener("blur", all);
		};
	}, []);

	useLoop((dt) => {
		if (!me.current) return; // unmounting: a last frame can land after React has let go of the ref
		const before = metres(r.current.dist);
		r.current = step(r.current, dt, hold.current.key || hold.current.finger, HEAD[api.you]);
		const m = metres(r.current.dist);
		if (m !== before) api.setScore(m);
		me.current.style.transform = `translateY(${(-r.current.y / H) * 100}cqh)`;
		redraw();
		if (r.current.crashed) {
			setCrashed(true);
			api.end(m, r.current.crashed === "tank" ? "Tripped over a water tank" : "Bumped a dish antenna");
		}
	}, !api.paused);

	return (
		<div
			className="ar-field ar-run-field"
			onPointerDown={() => {
				hold.current.finger = true;
				up();
			}}
		>
			<canvas ref={ref} role="img" aria-label="A rooftop at night, with water tanks and dish antennas to jump over" />
			<span className="ar-run-me" ref={me} style={{ left: `${(RUN_X / W) * 100}%`, bottom: `${(1 - GROUND / H) * 100}%` }}>
				<Head who={api.you} mood={crashed ? "dizzy" : api.paused ? "idle" : "bob"} h={`${(HEAD_H / H) * 100}cqh`} />
			</span>
		</div>
	);
}

function skyline(tile: number, lo: number, hi: number, litShare: number): Tower[] {
	const out: Tower[] = [];
	for (let x = 0; x < tile; ) {
		const w = rand(34, 78);
		const h = rand(lo, hi);
		const lit: [number, number][] = [];
		for (let wy = 10; wy < h - 10; wy += 13) for (let wx = 7; wx < w - 9; wx += 11) if (Math.random() < litShare) lit.push([wx, wy]);
		out.push({ x, w, h, lit });
		x += w + rand(0, 16);
	}
	return out;
}

function paint(g: CanvasRenderingContext2D, s: Run, still: boolean) {
	const c = palette();
	const sky = g.createLinearGradient(0, 0, 0, GROUND);
	sky.addColorStop(0, c.dusk);
	sky.addColorStop(0.75, c.night);
	g.fillStyle = sky;
	g.fillRect(0, 0, W, H);

	g.fillStyle = c.cream;
	for (const [x, y, rr] of STARS) {
		g.globalAlpha = 0.35 + rr * 0.3;
		g.beginPath();
		g.arc(x, y, rr, 0, Math.PI * 2);
		g.fill();
	}
	g.globalAlpha = 1;
	moon(g, c);

	layer(g, FAR, 900, still ? 0 : s.dist * 0.08, c.steel, 0.26, c.flower, 0.3);
	layer(g, NEAR, 760, still ? 0 : s.dist * 0.25, c.dusk, 1, c.flower, 0.95);

	// our roof: a pale coping on top of a dark parapet wall, its joints scrolling past at running speed
	g.fillStyle = "#222c36"; // a shade under night: the wall in shadow
	g.fillRect(0, GROUND, W, H - GROUND);
	g.fillStyle = c.steel;
	g.fillRect(0, GROUND, W, 7);
	g.fillStyle = c.fog;
	g.fillRect(0, GROUND, W, 2);
	g.strokeStyle = "rgb(45 58 71 / 0.9)";
	g.lineWidth = 2;
	const off = s.dist % 64;
	for (let x = -off; x < W; x += 64) {
		g.beginPath();
		g.moveTo(x, GROUND + 2);
		g.lineTo(x, GROUND + 7);
		g.moveTo(x + 32, GROUND + 7);
		g.lineTo(x + 32, H);
		g.stroke();
	}

	// the head's shadow on the roof, smaller as it jumps
	const k = Math.max(0.3, 1 - s.y / 160);
	g.fillStyle = "rgb(20 26 32 / 0.5)";
	g.beginPath();
	g.ellipse(RUN_X, GROUND + 3, 22 * k, 3.5 * k, 0, 0, Math.PI * 2);
	g.fill();

	for (const o of s.obs) (o.kind === "tank" ? tank : dish)(g, o, c);
}

function moon(g: CanvasRenderingContext2D, c: Record<string, string>) {
	const glow = g.createRadialGradient(548, 62, 16, 548, 62, 70);
	glow.addColorStop(0, "rgb(255 247 230 / 0.28)");
	glow.addColorStop(1, "rgb(255 247 230 / 0)");
	g.fillStyle = glow;
	g.fillRect(470, 0, 160, 140);
	g.fillStyle = c.cream;
	g.beginPath();
	g.arc(548, 62, 20, 0, Math.PI * 2);
	g.fill();
	g.fillStyle = c.fog;
	for (const [x, y, rr] of [
		[541, 56, 4],
		[554, 70, 3],
		[556, 55, 2],
	]) {
		g.beginPath();
		g.arc(x, y, rr, 0, Math.PI * 2);
		g.fill();
	}
}

/** One skyline strip, tiled across the screen and scrolled by `off`. Windows are small yellow squares. */
function layer(g: CanvasRenderingContext2D, towers: Tower[], tile: number, off: number, body: string, alpha: number, win: string, winAlpha: number) {
	const o = off % tile;
	for (const base of [-o, tile - o])
		for (const t of towers) {
			const x = base + t.x;
			if (x > W || x + t.w < 0) continue;
			g.globalAlpha = alpha;
			g.fillStyle = body;
			g.fillRect(x, GROUND - t.h, t.w, t.h);
			g.globalAlpha = winAlpha;
			g.fillStyle = win;
			for (const [wx, wy] of t.lit) g.fillRect(x + wx, GROUND - t.h + wy, 4, 5);
		}
	g.globalAlpha = 1;
}

/** The classic black rooftop water tank: a ridged cylinder with a lid, on a little stand. */
function tank(g: CanvasRenderingContext2D, o: Ob, c: Record<string, string>) {
	const top = GROUND - o.h;
	const stand = 7;
	g.fillStyle = c.steel;
	g.fillRect(o.x + 5, GROUND - stand, 4, stand);
	g.fillRect(o.x + o.w - 9, GROUND - stand, 4, stand);
	g.fillRect(o.x + 2, GROUND - stand - 2, o.w - 4, 3);
	g.fillStyle = BLACK;
	g.beginPath();
	g.roundRect(o.x, top + 4, o.w, o.h - stand - 5, [o.w * 0.3, o.w * 0.3, 5, 5]);
	g.fill();
	g.strokeStyle = c.steel;
	g.lineWidth = 1.5;
	g.stroke();
	// ridges, and a soft highlight down one side for the curve
	g.strokeStyle = "rgb(122 139 158 / 0.55)";
	g.lineWidth = 1.2;
	for (let y = top + 16; y < GROUND - stand - 4; y += 7) {
		g.beginPath();
		g.moveTo(o.x + 2, y);
		g.lineTo(o.x + o.w - 2, y);
		g.stroke();
	}
	g.fillStyle = "rgb(211 220 229 / 0.22)";
	g.fillRect(o.x + o.w * 0.2, top + 10, 4, o.h - stand - 16);
	// the lid
	g.fillStyle = BLACK;
	g.beginPath();
	g.roundRect(o.x + o.w * 0.32, top, o.w * 0.36, 6, 2);
	g.fill();
	g.strokeStyle = c.steel;
	g.stroke();
}

/** A dish antenna: a pale bowl tilted at the sky, on a short pole. */
function dish(g: CanvasRenderingContext2D, o: Ob, c: Record<string, string>) {
	const mid = o.x + o.w / 2;
	const cy = GROUND - o.h + o.w * 0.28;
	g.strokeStyle = BLACK;
	g.lineWidth = 5;
	g.lineCap = "round";
	g.beginPath();
	g.moveTo(mid, cy);
	g.lineTo(mid, GROUND - 2);
	g.stroke();
	g.fillStyle = BLACK;
	g.fillRect(mid - 9, GROUND - 5, 18, 5);
	g.save();
	g.translate(mid, cy);
	g.rotate(-0.4);
	g.fillStyle = c.fog;
	g.strokeStyle = BLACK;
	g.lineWidth = 2;
	g.beginPath();
	g.ellipse(0, 0, o.w / 2, o.w * 0.24, 0, 0, Math.PI * 2);
	g.fill();
	g.stroke();
	g.fillStyle = c.mist;
	g.beginPath();
	g.ellipse(0, -1.5, o.w * 0.34, o.w * 0.13, 0, 0, Math.PI * 2);
	g.fill();
	// the arm and the little receiver it holds out front
	g.strokeStyle = c.haze;
	g.lineWidth = 2;
	g.beginPath();
	g.moveTo(0, 0);
	g.lineTo(-2, -o.w * 0.5);
	g.stroke();
	g.fillStyle = c.haze;
	g.fillRect(-5, -o.w * 0.5 - 4, 6, 5);
	g.restore();
}
