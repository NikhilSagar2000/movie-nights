import { useRef } from "react";
import { DIR_KEYS, palette, useCanvas, useKeys, useLoop, useSwipe, type SoloApi } from "./kit";
import { newSnake, step, turn, type Pt, type Snake as S } from "./logic/snake";

/* Snake, Nokia 3310 style: a sage LCD with night pixels. Popcorn to eat; faster every 5 bites. */

const N = 17;
const CELL = 20;
const SIZE = N * CELL;
const speed = (eaten: number) => Math.min(15, 7 + Math.floor(eaten / 5) * 0.8); // moves per second

export default function Snake({ api }: { api: SoloApi }) {
	const s = useRef<S>(newSnake(N));
	const acc = useRef(0);
	const field = useRef<HTMLDivElement>(null);
	const { ref, redraw } = useCanvas(SIZE, SIZE, (g) => paint(g, s.current));

	const go = (d: Parameters<typeof turn>[1]) => (s.current = turn(s.current, d));
	useKeys((k) => {
		const d = DIR_KEYS[k];
		if (d) go(d);
		return !!d;
	}, !api.paused);
	useSwipe(field, go, !api.paused);

	useLoop((dt) => {
		acc.current += dt;
		const every = 1 / speed(s.current.eaten);
		if (acc.current < every) return;
		acc.current -= every;
		const before = s.current.eaten;
		s.current = step(s.current, N);
		if (s.current.eaten !== before) api.setScore(s.current.eaten);
		redraw();
		if (!s.current.alive) api.end(s.current.eaten, s.current.died === "wall" ? "Bumped into the wall" : s.current.died ? "Bit your own tail" : "You filled the whole board!");
	}, !api.paused);

	return (
		<div className="ar-field" ref={field}>
			<canvas ref={ref} role="img" aria-label={`Snake, ${s.current.eaten} popcorn eaten`} />
		</div>
	);
}

function paint(g: CanvasRenderingContext2D, s: S) {
	const c = palette();
	g.fillStyle = "#c9d2ad"; // the LCD: sage washed with cream
	g.fillRect(0, 0, SIZE, SIZE);
	g.fillStyle = "rgb(45 58 71 / 0.06)"; // faint pixel dots, like the old screen
	for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g.fillRect(x * CELL + 9, y * CELL + 9, 2, 2);

	popcorn(g, s.food, c);
	s.body.forEach(([x, y], i) => {
		g.fillStyle = c.night;
		const pad = i === 0 ? 1 : 2.5;
		g.beginPath();
		g.roundRect(x * CELL + pad, y * CELL + pad, CELL - pad * 2, CELL - pad * 2, i === 0 ? 5 : 3);
		g.fill();
	});
	// eyes, looking where it's going
	const [hx, hy] = s.body[0];
	const look = { up: [0, -3], down: [0, 3], left: [-3, 0], right: [3, 0] }[s.dir];
	const side = s.dir === "up" || s.dir === "down" ? [[-4, 0], [4, 0]] : [[0, -4], [0, 4]];
	g.fillStyle = c.cream;
	for (const [ox, oy] of side) {
		g.beginPath();
		g.arc(hx * CELL + CELL / 2 + ox + look[0], hy * CELL + CELL / 2 + oy + look[1], 2, 0, Math.PI * 2);
		g.fill();
	}
}

/** A popped kernel: three cream puffs with a night outline and a yellow heart. */
function popcorn(g: CanvasRenderingContext2D, [x, y]: Pt, c: Record<string, string>) {
	const cx = x * CELL + CELL / 2;
	const cy = y * CELL + CELL / 2;
	const puffs = [
		[-3.5, 1.5, 4.5],
		[3.5, 1.5, 4.5],
		[0, -3, 5],
	];
	// outline first (thick), then the fills on top: only the outer edge shows
	g.lineWidth = 3;
	g.strokeStyle = c.night;
	g.fillStyle = c.cream;
	for (const pass of ["stroke", "fill"] as const)
		for (const [ox, oy, r] of puffs) {
			g.beginPath();
			g.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
			g[pass]();
		}
	g.fillStyle = c.flower;
	g.beginPath();
	g.arc(cx, cy + 1, 2.5, 0, Math.PI * 2);
	g.fill();
}
