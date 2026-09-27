import { useRef, useState, type PointerEvent } from "react";
import { Head, type Moment } from "../Character";
import { palette, rand, reduced, useCanvas, useHeld, useLoop, type SoloApi } from "./kit";
import { catchBox, FLOOR, H, HEAD, HEAD_H, newGame, step, W, type Game, type Item } from "./logic/popcorn";
import "./popcorn.css";
import { sfx } from "./sound";

/* Popcorn Catch: your head at the bottom of a blue-hour sky catches falling popcorn (+1) and the odd tuberose (+5).
   Burnt kernels cost a life; three and it's over. The head is the real drawn one, laid over the canvas. */

const SPEED = 420; // units/s with the keys
const KEYS = ["ArrowLeft", "ArrowRight", "a", "d"];
type Pop = { x: number; y: number; text: string; age: number };

export default function Popcorn({ api }: { api: SoloApi }) {
	const g = useRef<Game>(newGame());
	const x = useRef(W / 2);
	const aim = useRef<number | null>(null); // where the pointer wants the head; keys clear it
	const pops = useRef<Pop[]>([]); // the little "+1"s
	const me = useRef<HTMLSpanElement>(null);
	const held = useHeld(KEYS);
	const [face, setFace] = useState<{ moment: Moment | null; nonce: number }>({ moment: null, nonce: 0 });
	const [calm] = useState(reduced);
	const [over, setOver] = useState(false);
	const { ref, at, redraw } = useCanvas(W, H, (c) => paint(c, g.current, pops.current));
	const half = HEAD[api.you].w / 2;

	useLoop((dt) => {
		if (!me.current) return; // unmounting: a last frame can land after React has let go of the ref
		const k = held.current;
		const dir = (k.has("ArrowRight") || k.has("d") ? 1 : 0) - (k.has("ArrowLeft") || k.has("a") ? 1 : 0);
		if (dir) {
			aim.current = null;
			x.current += dir * SPEED * dt;
		} else if (aim.current !== null) x.current += (aim.current - x.current) * Math.min(1, dt * 18); // a quick ease, not a teleport
		x.current = Math.max(half, Math.min(W - half, x.current));
		me.current.style.transform = `translateX(${(x.current / W) * 100}cqw)`;

		const r = step(g.current, dt, catchBox(x.current, api.you));
		g.current = r.g;
		if (!calm) {
			pops.current = pops.current.filter((p) => (p.age += dt) < 0.8);
			for (const it of r.got) pops.current.push(pop(it));
		}
		if (r.got.length) {
			api.setScore(r.g.score);
			const burnt = r.got.some((it) => it.kind === "burnt");
			const rose = r.got.some((it) => it.kind === "rose");
			if (burnt || rose) setFace((f) => ({ moment: burnt ? "squish" : "happy", nonce: f.nonce + 1 }));
			if (burnt) sfx("hit");
			else if (rose) sfx("coin");
			else sfx("pop", rand(0.9, 1.15));
		}
		redraw();
		if (r.g.lives <= 0) {
			setOver(true);
			api.end(r.g.score, "Too many burnt ones");
		}
	}, !api.paused);

	const follow = (e: PointerEvent) => (aim.current = at(e).x);
	return (
		<div className="ar-field ar-popcorn-field" onPointerDown={follow} onPointerMove={follow}>
			<canvas ref={ref} role="img" aria-label="Popcorn falling from a blue-hour sky, with your head at the bottom to catch it" />
			<span className="ar-popcorn-me" ref={me} style={{ bottom: `${(1 - FLOOR / H) * 100}%` }}>
				<Head who={api.you} mood={over ? "dizzy" : api.paused ? "idle" : "bob"} moment={face.moment} nonce={face.nonce} h={`${(HEAD_H / H) * 100}cqh`} />
			</span>
		</div>
	);
}

const pop = (it: Item): Pop => ({ x: it.x, y: it.y - 18, text: it.kind === "burnt" ? "oops" : it.kind === "rose" ? "+5" : "+1", age: 0 });

// soft out-of-focus lights in the sky: x, y, radius, colour
const BOKEH: [number, number, number, string][] = [
	[62, 120, 26, "cream"],
	[300, 90, 34, "blush"],
	[250, 210, 18, "flower"],
	[40, 290, 20, "blush"],
	[320, 330, 28, "cream"],
	[150, 60, 14, "flower"],
	[190, 280, 22, "cream"],
];

function paint(g: CanvasRenderingContext2D, s: Game, pops: Pop[]) {
	const c = palette();
	const sky = g.createLinearGradient(0, 0, 0, H);
	sky.addColorStop(0, c.haze);
	sky.addColorStop(0.5, c.fog);
	sky.addColorStop(1, c.mist);
	g.fillStyle = sky;
	g.fillRect(0, 0, W, H);
	g.globalAlpha = 0.35;
	for (const [x, y, r, col] of BOKEH) {
		g.fillStyle = c[col];
		g.beginPath();
		g.arc(x, y, r, 0, Math.PI * 2);
		g.fill();
	}
	g.globalAlpha = 1;
	curtain(g, c);
	// the floor the head stands on
	g.fillStyle = "rgb(45 58 71 / 0.12)";
	g.beginPath();
	g.ellipse(W / 2, FLOOR + 4, W * 0.62, 16, 0, 0, Math.PI * 2);
	g.fill();

	for (const it of s.items) {
		g.save();
		g.translate(it.x, it.y);
		if (it.kind === "rose") tuberose(g, Math.sin(it.a) * 0.25, c);
		else {
			if (it.kind === "burnt") smoke(g, it.a, c);
			g.rotate(it.a);
			kernel(g, it.kind === "burnt", c);
		}
		g.restore();
	}

	// lives, top-left: yellow flowers, a faded one for each life lost
	for (let i = 0; i < 3; i++) flower(g, 26 + i * 26, 40, i < s.lives, c);

	g.textAlign = "center";
	g.font = "600 17px Fredoka, system-ui, sans-serif";
	for (const p of pops) {
		g.globalAlpha = 1 - p.age / 0.8;
		g.fillStyle = p.text === "oops" ? c["rose-ink"] : c.night;
		g.fillText(p.text, p.x, p.y - p.age * 40);
	}
	g.globalAlpha = 1;
}

/** A faint cinema curtain: a scalloped valance and two soft side drapes. */
function curtain(g: CanvasRenderingContext2D, c: Record<string, string>) {
	g.fillStyle = c.rosewood;
	g.globalAlpha = 0.28;
	for (const side of [0, W]) {
		const d = side ? -1 : 1;
		g.beginPath();
		g.moveTo(side, 0);
		g.lineTo(side + d * 30, 0);
		g.quadraticCurveTo(side + d * 12, H * 0.45, side + d * 20, H);
		g.lineTo(side, H);
		g.fill();
	}
	g.globalAlpha = 0.5;
	g.beginPath();
	g.moveTo(0, 0);
	g.lineTo(W, 0);
	g.lineTo(W, 12);
	for (let x = W; x > 0; x -= 30) g.quadraticCurveTo(x - 15, 26, x - 30, 12);
	g.fill();
	g.globalAlpha = 1;
}

/** A popped kernel (the Snake one, bigger): cream puffs with a night outline and a yellow heart. Burnt: brown, no heart. */
function kernel(g: CanvasRenderingContext2D, burnt: boolean, c: Record<string, string>) {
	const s = burnt ? 1.5 : 2;
	const puffs = [
		[-3.5, 1.5, 4.5],
		[3.5, 1.5, 4.5],
		[0, -3, 5],
	];
	g.lineWidth = 3;
	g.strokeStyle = c.night;
	g.fillStyle = burnt ? "#5b463c" : c.cream; // burnt toffee brown: drawing ink, not a UI colour
	for (const pass of ["stroke", "fill"] as const)
		for (const [ox, oy, r] of puffs) {
			g.beginPath();
			g.arc(ox * s, oy * s, r * s, 0, Math.PI * 2);
			g[pass]();
		}
	g.fillStyle = burnt ? c.night : c.flower;
	g.beginPath();
	g.arc(0, s, 2.5 * s, 0, Math.PI * 2);
	g.fill();
}

/** A little wisp of smoke trailing up from a burnt kernel (not rotated with it). */
function smoke(g: CanvasRenderingContext2D, a: number, c: Record<string, string>) {
	const w = Math.sin(a * 2) * 2;
	g.strokeStyle = c.steel;
	g.lineWidth = 2;
	g.lineCap = "round";
	g.beginPath();
	g.moveTo(0, -11);
	g.bezierCurveTo(7 + w, -17, -7 + w, -24, 2, -32);
	g.stroke();
}

/** A short tuberose spike: sage stem, waxy white florets, blush buds at the tip (see Garden's TuberoseArt). */
function tuberose(g: CanvasRenderingContext2D, tilt: number, c: Record<string, string>) {
	g.rotate(tilt);
	g.scale(1.35, 1.35);
	g.lineCap = "round";
	for (const [w, col] of [
		[5, c.night],
		[2.6, c.sage],
	] as const) {
		g.lineWidth = w;
		g.strokeStyle = col;
		g.beginPath();
		g.moveTo(0, 20);
		g.lineTo(0, -14);
		g.stroke();
	}
	g.lineWidth = 1;
	g.strokeStyle = c.night;
	for (const [bx, by, lean] of [
		[-2.5, -19, -1],
		[2.5, -21, 1],
		[0, -24, 0],
	]) {
		g.save();
		g.translate(bx, by);
		g.rotate(lean * 0.5);
		g.fillStyle = c.blush;
		g.beginPath();
		g.ellipse(0, 0, 2.2, 4.4, 0, 0, Math.PI * 2);
		g.fill();
		g.stroke();
		g.restore();
	}
	for (const [fx, fy] of [
		[-6, 10],
		[6, 5],
		[-6, -1],
		[6, -7],
	])
		floret(g, fx, fy, c);
}

function floret(g: CanvasRenderingContext2D, x: number, y: number, c: Record<string, string>) {
	g.save();
	g.translate(x, y);
	g.fillStyle = c.cream;
	g.lineWidth = 1;
	g.strokeStyle = c.night;
	for (let i = 0; i < 6; i++) {
		g.rotate(Math.PI / 3);
		g.beginPath();
		g.ellipse(0, -3.8, 2.2, 3.8, 0, 0, Math.PI * 2);
		g.fill();
		g.stroke();
	}
	g.fillStyle = c.flower;
	g.beginPath();
	g.arc(0, 0, 1.6, 0, Math.PI * 2);
	g.fill();
	g.restore();
}

/** A small five-petal flower for a life; a faded outline once it's lost. */
function flower(g: CanvasRenderingContext2D, x: number, y: number, on: boolean, c: Record<string, string>) {
	g.save();
	g.translate(x, y);
	g.globalAlpha = on ? 1 : 0.3;
	g.lineWidth = 1.6;
	g.strokeStyle = c.night;
	g.fillStyle = on ? c.flower : "transparent";
	for (let i = 0; i < 5; i++) {
		const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
		g.beginPath();
		g.arc(Math.cos(a) * 5.5, Math.sin(a) * 5.5, 4.8, 0, Math.PI * 2);
		g.fill();
		g.stroke();
	}
	for (let i = 0; i < 5; i++) {
		const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
		g.beginPath();
		g.arc(Math.cos(a) * 5.5, Math.sin(a) * 5.5, 4, 0, Math.PI * 2);
		g.fill();
	}
	g.fillStyle = on ? c.rosewood : c.night;
	g.beginPath();
	g.arc(0, 0, 2.8, 0, Math.PI * 2);
	g.fill();
	g.restore();
}
