import { useRef, useState, type PointerEvent } from "react";
import { palette, reduced, useCanvas, useHeld, useKeys, useLoop, type SoloApi } from "./kit";
import { DROP, H, launch, newWorld, PAD, R, step, W, type Brick, type Ev, type World } from "./logic/bricks";
import "./bricks.css";
import { sfx } from "./sound";

/* Brick Breaker: a misty blue-hour sky, a wall of pastel bricks, a cream paddle and a yellow ball.
   Break a brick and sometimes a tuberose falls: catch it for an extra ball. */

const KEY_SPEED = 480; // paddle, units/s
const TAU = Math.PI * 2;
/** A broken brick's pop, and the paddle's squash when the ball lands (decoration: skipped with reduced motion). */
type Fx = { pops: { k: Brick; t: number }[]; squash: number };

export default function Bricks({ api }: { api: SoloApi }) {
	const w = useRef<World>(newWorld());
	const fx = useRef<Fx>({ pops: [], squash: 0 });
	const target = useRef<number | null>(null); // the pointer's x; null while the keys steer
	const press = useRef<{ x: number; y: number } | null>(null);
	const [calm] = useState(reduced);
	const held = useHeld(["ArrowLeft", "ArrowRight", "a", "d"]);
	const { ref, at, redraw } = useCanvas(W, H, (g) => paint(g, w.current, fx.current));

	useKeys((k) => {
		if (k !== " ") return false;
		launch(w.current);
		return true;
	}, !api.paused);

	useLoop((dt) => {
		const s = w.current;
		const keys = held.current;
		const dir = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
		if (dir) {
			target.current = null;
			s.paddle += dir * KEY_SPEED * dt;
		} else if (target.current !== null) s.paddle = target.current;

		const before = s.score;
		const f = fx.current;
		const evs = step(s, dt);
		for (const e of evs) {
			if (calm) continue;
			if (e.t === "break") f.pops.push({ k: e.brick, t: 0 });
			if (e.t === "paddle") f.squash = 1;
		}
		if (evs.length) {
			// one sound of each kind a frame, however many bricks broke: the pop pitched by the highest row
			const has = (t: Ev["t"]) => evs.some((e) => e.t === t);
			if (has("paddle")) sfx("blip");
			if (has("catch")) sfx("coin");
			if (has("lost")) sfx("hit");
			const row = Math.min(...evs.map((e) => (e.t === "break" ? e.brick.row : Infinity)));
			if (row < Infinity) sfx("pop", 1.4 - row * 0.08);
		}
		f.pops = f.pops.filter((p) => (p.t += dt) < 0.3);
		f.squash = Math.max(0, f.squash - dt / 0.18);
		if (s.score !== before) api.setScore(s.score);
		redraw();
		if (s.over) api.end(s.score, "Out of balls");
	}, !api.paused);

	// the paddle follows the pointer anywhere on the field (hover with a mouse, drag with a finger); a tap launches
	const follow = (e: PointerEvent) => {
		target.current = at(e).x;
	};
	return (
		<div
			className={`ar-field ar-bricks-field${api.paused ? "" : " playing"}`}
			onPointerMove={follow}
			onPointerDown={(e) => {
				follow(e);
				press.current = { x: e.clientX, y: e.clientY };
			}}
			onPointerUp={(e) => {
				const p = press.current;
				press.current = null;
				if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 12 && !api.paused) launch(w.current);
			}}
		>
			<canvas ref={ref} role="img" aria-label={`Brick Breaker, ${w.current.score} bricks broken, ${w.current.lives} balls left`} />
		</div>
	);
}

const ROW_COLORS = ["rosewood", "blush", "flower", "sage", "mist", "cream"];

function paint(g: CanvasRenderingContext2D, w: World, fx: Fx) {
	const c = palette();
	const sky = g.createLinearGradient(0, 0, 0, H);
	sky.addColorStop(0, c.mist);
	sky.addColorStop(0.5, c.fog);
	sky.addColorStop(1, c.haze);
	g.fillStyle = sky;
	g.fillRect(0, 0, W, H);
	// soft clouds low in the sky
	g.fillStyle = "rgb(255 252 245 / 0.45)";
	for (const [x, y, s] of [
		[70, 300, 1],
		[290, 360, 0.8],
		[190, 250, 0.6],
	]) {
		g.beginPath();
		g.ellipse(x, y, 34 * s, 11 * s, 0, 0, TAU);
		g.ellipse(x - 14 * s, y - 7 * s, 16 * s, 11 * s, 0, 0, TAU);
		g.ellipse(x + 12 * s, y - 9 * s, 19 * s, 13 * s, 0, 0, TAU);
		g.fill();
	}

	g.lineJoin = "round";
	for (const k of w.bricks) if (k.alive) brick(g, k, c, 1, 1);
	for (const { k, t } of fx.pops) brick(g, k, c, 1 + t, 1 - t / 0.3);
	for (const d of w.drops) tuberose(g, d.x, d.y, c);

	// the paddle, squashed a little when the ball lands
	const sq = fx.squash;
	g.save();
	g.translate(w.paddle, PAD.y + PAD.h);
	g.scale(1 + sq * 0.1, 1 - sq * 0.3);
	g.fillStyle = "rgb(45 58 71 / 0.15)";
	g.beginPath();
	g.roundRect(-PAD.w / 2, -PAD.h + 3, PAD.w, PAD.h, PAD.h / 2);
	g.fill();
	g.fillStyle = c.cream;
	g.strokeStyle = c.night;
	g.lineWidth = 2.5;
	g.beginPath();
	g.roundRect(-PAD.w / 2, -PAD.h, PAD.w, PAD.h, PAD.h / 2);
	g.fill();
	g.stroke();
	g.fillStyle = c.blush;
	g.beginPath();
	g.roundRect(-PAD.w / 2 + 8, -PAD.h / 2 - 1.5, PAD.w - 16, 3, 1.5);
	g.fill();
	g.restore();

	for (const b of w.balls) ball(g, b.x, b.y, R, c);

	// wall number and the balls left, small at the top
	g.fillStyle = c.night;
	g.globalAlpha = 0.7;
	g.font = "500 15px Fredoka, system-ui, sans-serif";
	g.textBaseline = "middle";
	g.fillText(`Wall ${w.wall + 1}`, 16, 26);
	g.globalAlpha = 1;
	for (let i = 0; i < 3; i++) {
		const x = W - 20 - i * 18;
		if (i < w.lives) ball(g, x, 26, 5.5, c);
		else {
			g.strokeStyle = "rgb(45 58 71 / 0.3)";
			g.lineWidth = 1.5;
			g.beginPath();
			g.arc(x, 26, 5.5, 0, TAU);
			g.stroke();
		}
	}
}

/** A rounded brick with a night outline, a soft shadow and a shine, drawn scaled `s` about its centre. */
function brick(g: CanvasRenderingContext2D, k: Brick, c: Record<string, string>, s: number, alpha: number) {
	g.save();
	g.globalAlpha = alpha;
	g.translate(k.x + k.w / 2, k.y + k.h / 2);
	g.scale(s, s);
	const x = -k.w / 2;
	const y = -k.h / 2;
	g.fillStyle = "rgb(45 58 71 / 0.14)";
	g.beginPath();
	g.roundRect(x, y + 2.5, k.w, k.h, 5);
	g.fill();
	g.fillStyle = c[ROW_COLORS[k.row % ROW_COLORS.length]];
	g.strokeStyle = c.night;
	g.lineWidth = 2;
	g.beginPath();
	g.roundRect(x, y, k.w, k.h, 5);
	g.fill();
	g.stroke();
	g.fillStyle = "rgb(255 255 255 / 0.4)";
	g.beginPath();
	g.roundRect(x + 5, y + 3, k.w - 14, 3, 1.5);
	g.fill();
	g.restore();
}

function ball(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: Record<string, string>) {
	g.fillStyle = c.flower;
	g.strokeStyle = c.night;
	g.lineWidth = 2;
	g.beginPath();
	g.arc(x, y, r, 0, TAU);
	g.fill();
	g.stroke();
	g.fillStyle = "rgb(255 255 255 / 0.7)";
	g.beginPath();
	g.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, TAU);
	g.fill();
}

/** A falling tuberose, like the garden's: waxy white florets on a short sage stalk, a bud at the tip, a soft glow behind. */
function tuberose(g: CanvasRenderingContext2D, x: number, y: number, c: Record<string, string>) {
	const glow = g.createRadialGradient(x, y, 2, x, y, DROP.h * 0.75);
	glow.addColorStop(0, "rgb(247 221 141 / 0.75)"); // the flower yellow, fading out
	glow.addColorStop(1, "rgb(247 221 141 / 0)");
	g.fillStyle = glow;
	g.beginPath();
	g.arc(x, y, DROP.h * 0.75, 0, TAU);
	g.fill();
	g.lineCap = "round";
	g.beginPath();
	g.moveTo(x, y + 13);
	g.quadraticCurveTo(x + 2, y + 3, x, y - 9);
	g.strokeStyle = c.night;
	g.lineWidth = 4.4;
	g.stroke();
	g.strokeStyle = c.sage;
	g.lineWidth = 2.2;
	g.stroke();
	floret(g, x - 5, y + 4, -1, c);
	floret(g, x + 5, y + 2, 1, c);
	floret(g, x - 1, y - 5, 0, c);
	// the closed bud at the tip
	g.fillStyle = c.cream;
	g.strokeStyle = c.night;
	g.lineWidth = 1;
	g.beginPath();
	g.ellipse(x + 1, y - 12, 2, 4, 0.3, 0, TAU);
	g.fill();
	g.stroke();
}

function floret(g: CanvasRenderingContext2D, x: number, y: number, lean: number, c: Record<string, string>) {
	g.save();
	g.translate(x, y);
	g.rotate(lean * 0.26);
	g.fillStyle = c.paper;
	g.strokeStyle = c.night;
	g.lineWidth = 0.9;
	for (let i = 0; i < 6; i++) {
		g.beginPath();
		g.ellipse(Math.sin((i * TAU) / 6) * 3.2, -Math.cos((i * TAU) / 6) * 3.2, 1.9, 3.3, (i * TAU) / 6, 0, TAU);
		g.fill();
		g.stroke();
	}
	g.fillStyle = c.flower;
	g.beginPath();
	g.arc(0, 0, 1.3, 0, TAU);
	g.fill();
	g.restore();
}
