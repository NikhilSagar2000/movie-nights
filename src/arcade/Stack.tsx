import { useRef } from "react";
import "./stack.css";
import { palette, rand, reduced, useCanvas, useKeys, useLoop, type SoloApi } from "./kit";
import { cut, HI, LO, slide, speed, type Span } from "./logic/stack";
import { sfx } from "./sound";

/* Ladoo Stack: the "Stack" tower game with mithai boxes on a brass thali. A box slides over the stack; drop it and
   whatever hangs over the box below falls off. Land it within a whisker and it snaps on whole, with a sparkle. */

const W = 360;
const H = 480;
const BH = 30; // one layer: a box and the row of ladoos peeking out of it
const START_W = 200;
const CAM0 = -410; // the table top sits near the bottom at first
const TONES = ["blush", "flower", "sage", "cream"];
const LADOO = "#f0a95b"; // flower yellow deepened toward rosewood: ladoo orange

/** c: the box's colour; lx: where its ladoo row is anchored, so a cut or a snap doesn't shuffle the ladoos. */
type Box = Span & { c: number; lx: number };
type Bit = Box & { y: number; vx: number; vy: number; rot: number; vr: number }; // a falling piece
type Spark = { x: number; y: number; vx: number; vy: number; life: number };
type Game = {
	tower: Box[];
	cur: Box & { dir: 1 | -1 };
	bits: Bit[];
	sparks: Spark[];
	flash: number;
	streak: number;
	cam: number;
	/** -1 while playing; seconds since the box missed, so it can fall before the game ends. */
	missed: number;
};

const layerY = (i: number) => -(i + 1) * BH; // the top of layer i; layer 0 is the box already on the thali
const seeded = (n: number) => () => (n = (n * 16807) % 2147483647) / 2147483647;
const r1 = seeded(11);
const STARS = Array.from({ length: 160 }, () => ({ x: r1() * W, y: -1400 - r1() * 6000, r: 0.6 + r1() * 0.9 }));

/** The next box: as wide as the top, coming in from alternate sides. */
function next(tower: Box[]): Game["cur"] {
	const left = tower.length % 2 === 1;
	const x = (left ? LO : HI) - tower[tower.length - 1].w / 2;
	return { x, w: tower[tower.length - 1].w, c: tower.length % TONES.length, lx: x, dir: left ? 1 : -1 };
}
function newGame(): Game {
	const tower = [{ x: (W - START_W) / 2, w: START_W, c: 0, lx: (W - START_W) / 2 }];
	return { tower, cur: next(tower), bits: [], sparks: [], flash: 0, streak: 0, cam: CAM0, missed: -1 };
}

export default function Stack({ api }: { api: SoloApi }) {
	const s = useRef<Game>(newGame());
	const { ref, redraw } = useCanvas(W, H, (g) => paint(g, s.current));
	const score = () => s.current.tower.length - 1;

	const drop = () => {
		const g = s.current;
		if (g.missed >= 0) return;
		const top = g.tower[g.tower.length - 1];
		const res = cut(top, g.cur);
		const y = layerY(g.tower.length);
		if (res.chip) {
			const away = res.chip.x < top.x ? -1 : 1;
			g.bits.push({ ...res.chip, c: g.cur.c, lx: g.cur.x, y, vx: away * rand(30, 60), vy: -40, rot: 0, vr: away * rand(1.5, 3) });
		}
		if (res.miss) {
			g.missed = 0;
			return;
		}
		g.streak = res.perfect ? g.streak + 1 : 0;
		sfx("thud");
		if (res.perfect) sfx("chime", Math.min(1.5, 0.9 + g.streak * 0.1)); // a little higher with each perfect in a row
		let { x, w } = res;
		if (res.perfect && g.streak >= 3 && w < START_W) {
			const grow = Math.min(8, START_W - w); // a run of perfects wins a little width back
			x -= grow / 2;
			w += grow;
		}
		g.tower.push({ x, w, c: g.cur.c, lx: res.perfect ? res.x : g.cur.x });
		if (res.perfect) {
			g.flash = 0.7;
			if (!reduced())
				for (let i = 0; i < 14; i++) g.sparks.push({ x: x + rand(0, w), y: y + 10, vx: rand(-70, 70), vy: rand(-170, -50), life: rand(0.5, 0.8) });
		}
		g.cur = next(g.tower);
		api.setScore(score());
	};
	useKeys((k, e) => {
		if (k !== " " && k !== "ArrowDown") return false;
		if (!e.repeat) drop(); // holding the key doesn't drop box after box
		return true;
	}, !api.paused);

	useLoop((dt) => {
		const g = s.current;
		if (g.missed < 0) Object.assign(g.cur, slide(g.cur.x, g.cur.dir, g.cur.w, speed(score()) * dt));
		else if ((g.missed += dt) > 0.9) api.end(score(), "Missed the stack"); // once it has fallen out of sight
		g.cur.lx = g.cur.x;
		for (const b of g.bits) {
			b.vy += 900 * dt;
			b.x += b.vx * dt;
			b.y += b.vy * dt;
			b.rot += b.vr * dt;
		}
		g.bits = g.bits.filter((b) => b.y - g.cam < H + 80);
		for (const p of g.sparks) {
			p.vy += 300 * dt;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.life -= dt;
		}
		g.sparks = g.sparks.filter((p) => p.life > 0);
		g.flash = Math.max(0, g.flash - dt);
		// keep the sliding box in the upper third
		g.cam += (Math.min(CAM0, layerY(g.tower.length) - 150) - g.cam) * Math.min(1, dt * 5);
		redraw();
	}, !api.paused);

	return (
		<div className="ar-field ar-stack-field" onPointerDown={(e) => !api.paused && e.button === 0 && drop()}>
			<canvas ref={ref} role="img" aria-label={`Ladoo Stack, ${score()} boxes stacked`} />
		</div>
	);
}

function paint(g: CanvasRenderingContext2D, s: Game) {
	const c = palette();
	g.save();
	g.translate(0, -s.cam);
	// the sky darkens into night as the tower climbs
	const sky = g.createLinearGradient(0, 200, 0, -2000);
	sky.addColorStop(0, c.haze);
	sky.addColorStop(0.25, c.fog);
	sky.addColorStop(0.5, c.mist);
	sky.addColorStop(0.8, c.dusk);
	sky.addColorStop(1, c.night);
	g.fillStyle = sky;
	g.fillRect(0, s.cam, W, H);
	g.fillStyle = c.cream;
	for (const st of STARS) {
		if (st.y < s.cam || st.y > s.cam + H) continue;
		g.globalAlpha = Math.min(0.85, (-st.y - 1400) / 800);
		g.beginPath();
		g.arc(st.x, st.y, st.r, 0, Math.PI * 2);
		g.fill();
	}
	g.globalAlpha = 1;

	table(g, c);
	s.tower.forEach((b, i) => layerY(i) < s.cam + H && box(g, b.x, layerY(i), b.w, b.c, b.lx, c)); // the boxes in view
	if (s.missed < 0) box(g, s.cur.x, layerY(s.tower.length), s.cur.w, s.cur.c, s.cur.lx, c);
	for (const b of s.bits) {
		g.save();
		g.translate(b.x + b.w / 2, b.y + BH / 2);
		g.rotate(b.rot);
		box(g, -b.w / 2, -BH / 2, b.w, b.c, b.lx - b.x - b.w / 2, c);
		g.restore();
	}
	for (const p of s.sparks) {
		g.globalAlpha = Math.min(1, p.life * 2);
		g.fillStyle = p.life > 0.6 ? c.cream : c.flower;
		twinkle(g, p.x, p.y, 5);
	}
	if (s.flash > 0) {
		// a perfect drop: a cream outline round the box, and a word near the top
		const i = s.tower.length - 1;
		const b = s.tower[i];
		g.globalAlpha = Math.min(1, s.flash / 0.3);
		g.strokeStyle = c.cream;
		g.lineWidth = 3;
		g.beginPath();
		g.roundRect(b.x - 2.5, layerY(i) + 7.5, b.w + 5, BH - 5, 7);
		g.stroke();
		const word = s.streak > 1 ? `Perfect ×${s.streak}` : "Perfect!";
		g.font = "500 26px Fredoka, sans-serif";
		g.textAlign = "center";
		g.lineJoin = "round";
		g.lineWidth = 6;
		g.strokeText(word, W / 2, s.cam + 62);
		g.fillStyle = c["rose-ink"];
		g.fillText(word, W / 2, s.cam + 62);
	}
	g.globalAlpha = 1;
	g.restore();
}

/** One mithai box at (x, y), BH tall: ladoos first, so the box covers their lower halves and they peek out of the top. */
function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, tone: number, lx: number, c: Record<string, string>) {
	g.lineWidth = 1.2;
	g.strokeStyle = "rgb(151 83 92 / 0.55)";
	for (let k = Math.ceil((x + 6 - lx - 7.5) / 15); lx + 7.5 + 15 * k <= x + w - 6; k++) {
		const cx = lx + 7.5 + 15 * k;
		g.fillStyle = LADOO;
		g.beginPath();
		g.arc(cx, y + 10, 6, 0, Math.PI * 2);
		g.fill();
		g.stroke();
		g.fillStyle = "rgb(255 247 230 / 0.65)";
		g.beginPath();
		g.arc(cx - 2, y + 7.5, 1.6, 0, Math.PI * 2);
		g.fill();
	}
	g.beginPath();
	g.roundRect(x, y + 10, w, BH - 10, Math.min(5, w / 2));
	g.fillStyle = c[TONES[tone]];
	g.fill();
	g.fillStyle = c["rose-ink"]; // the ribbon
	g.fillRect(x, y + 18, w, 3.5);
	g.strokeStyle = "rgb(45 58 71 / 0.5)";
	g.lineWidth = 1.5;
	g.stroke();
}

/** The table, the brass thali the first box sits on, and a diya either side. */
function table(g: CanvasRenderingContext2D, c: Record<string, string>) {
	g.fillStyle = c.steel;
	g.fillRect(0, -4, W, 16);
	g.fillStyle = c.dusk;
	g.fillRect(0, 12, W, 240);
	g.fillStyle = c.flower;
	g.strokeStyle = c["rose-ink"];
	g.lineWidth = 1.5;
	g.beginPath();
	g.ellipse(W / 2, 2, 128, 9, 0, 0, Math.PI * 2);
	g.fill();
	g.stroke();
	g.fillStyle = "rgb(255 247 230 / 0.55)";
	g.beginPath();
	g.ellipse(W / 2, 0, 100, 4.5, 0, 0, Math.PI * 2);
	g.fill();
	for (const x of [30, W - 30]) {
		const glow = g.createRadialGradient(x, -6, 2, x, -6, 26);
		glow.addColorStop(0, "rgb(247 221 141 / 0.6)");
		glow.addColorStop(1, "rgb(247 221 141 / 0)");
		g.fillStyle = glow;
		g.fillRect(x - 26, -32, 52, 52);
		g.fillStyle = c.flower;
		g.beginPath();
		g.moveTo(x, -16);
		g.quadraticCurveTo(x + 5, -4, x, -2);
		g.quadraticCurveTo(x - 5, -4, x, -16);
		g.fill();
		g.fillStyle = c.rosewood; // the clay lamp
		g.beginPath();
		g.ellipse(x, 1, 13, 7, 0, 0, Math.PI);
		g.fill();
		g.fillRect(x - 13, -1, 26, 2.5);
	}
}

/** A four-pointed sparkle. */
function twinkle(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
	g.beginPath();
	g.moveTo(x, y - r);
	g.quadraticCurveTo(x, y, x + r, y);
	g.quadraticCurveTo(x, y, x, y + r);
	g.quadraticCurveTo(x, y, x - r, y);
	g.quadraticCurveTo(x, y, x, y - r);
	g.fill();
}
