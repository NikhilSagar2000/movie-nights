import { useRef } from "react";
import "./lantern.css";
import { palette, reduced, useCanvas, useKeys, useLoop, type SoloApi } from "./kit";
import { flap, GROUND, H, LX, newSky, step, W, type Pair, type Sky } from "./logic/lantern";
import { sfx } from "./sound";

/* Sky Lantern: Flappy Bird with a Diwali paper lantern. Each tap lifts it; it drifts past rooftops with lit windows
   and marigold garlands hanging from above. The lantern stays put, the town scrolls past. */

const NOTES = { roof: "The lantern bumped a rooftop", garland: "Tangled in the marigolds", ground: "The lantern sank to the street" };

// the same stars, skyline and far lanterns every run
const seeded = (n: number) => () => (n = (n * 16807) % 2147483647) / 2147483647;
const r1 = seeded(7);
const STARS = Array.from({ length: 46 }, () => ({ x: r1() * W, y: r1() * 280, r: 0.6 + r1() * 0.9, p: r1() * 6 }));
const SKYLINE = Array.from({ length: 16 }, () => 18 + r1() * 46); // far roofs, 30 wide each
const FAR = Array.from({ length: 6 }, () => ({ x: r1() * W, y: 60 + r1() * 320, s: 0.6 + r1() * 0.5 }));

export default function Lantern({ api }: { api: SoloApi }) {
	const s = useRef<Sky>(newSky());
	const t = useRef(0); // seconds played, for the flicker and the drifting background
	const still = useRef(reduced());
	const { ref, redraw } = useCanvas(W, H, (g) => paint(g, s.current, still.current ? 0 : t.current));

	const lift = () => {
		sfx("flap");
		s.current = flap(s.current);
	};
	useKeys((k, e) => {
		if (k !== " " && k !== "ArrowUp") return false;
		if (!e.repeat) lift(); // holding the key isn't a flurry of flaps
		return true;
	}, !api.paused);

	useLoop((dt) => {
		t.current += dt;
		const before = s.current.score;
		s.current = step(s.current, dt);
		if (s.current.score !== before) {
			api.setScore(s.current.score);
			sfx("tick");
		}
		redraw();
		if (!s.current.alive) api.end(s.current.score, NOTES[s.current.died!]);
	}, !api.paused);

	return (
		<div className="ar-field ar-lantern-field" onPointerDown={(e) => !api.paused && e.button === 0 && lift()}>
			<canvas ref={ref} role="img" aria-label={`Sky Lantern, ${s.current.score} rooftops passed`} />
		</div>
	);
}

function paint(g: CanvasRenderingContext2D, s: Sky, t: number) {
	const c = palette();
	const sky = g.createLinearGradient(0, 0, 0, GROUND);
	sky.addColorStop(0, c.night);
	sky.addColorStop(1, c.dusk);
	g.fillStyle = sky;
	g.fillRect(0, 0, W, H);

	g.fillStyle = c.cream;
	for (const st of STARS) {
		g.globalAlpha = 0.45 + 0.35 * Math.sin(st.p + t * 2); // twinkle (steady when t is 0)
		g.beginPath();
		g.arc(st.x, st.y, st.r, 0, Math.PI * 2);
		g.fill();
	}
	// a crescent moon: a cream disc with a sky-coloured disc over most of it
	g.globalAlpha = 0.9;
	g.beginPath();
	g.arc(300, 62, 17, 0, Math.PI * 2);
	g.fill();
	g.globalAlpha = 1;
	g.fillStyle = sky;
	g.beginPath();
	g.arc(307, 56, 15, 0, Math.PI * 2);
	g.fill();

	// far lanterns rising, and a far skyline, both slower than the town
	for (const f of FAR) {
		const x = (((f.x - t * 9) % W) + W) % W;
		const y = (((f.y - t * 12 * f.s) % 380) + 380) % 380;
		glow(g, x, y, 9 * f.s, 0.35);
		g.fillStyle = c.flower;
		g.beginPath();
		g.roundRect(x - 2 * f.s, y - 3 * f.s, 4 * f.s, 5 * f.s, 1.5);
		g.fill();
	}
	g.fillStyle = "rgb(45 58 71 / 0.6)"; // night over dusk
	const off = (t * 22) % (SKYLINE.length * 30);
	for (let i = Math.floor(off / 30); i * 30 - off < W; i++) {
		const h = SKYLINE[i % SKYLINE.length];
		g.fillRect(i * 30 - off, GROUND - h, 31, h);
	}

	for (const p of s.pairs) {
		roof(g, p, c);
		garland(g, p, c, t);
	}

	g.fillStyle = c.night; // the street
	g.fillRect(0, GROUND, W, H - GROUND);
	g.fillStyle = c.dusk;
	g.fillRect(0, GROUND, W, 2);

	lantern(g, s, t, c);
}

/** A soft warm light fading out to nothing. */
function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) {
	const l = g.createRadialGradient(x, y, 0, x, y, r);
	l.addColorStop(0, `rgb(247 221 141 / ${a})`);
	l.addColorStop(1, "rgb(247 221 141 / 0)");
	g.fillStyle = l;
	g.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A little pseudo-random number from a building's seed, so its windows don't flicker between frames. */
const hash = (seed: number, i: number) => {
	const v = Math.sin(seed * 9301 + i * 49.297) * 43758.5453;
	return v - Math.floor(v);
};

function roof(g: CanvasRenderingContext2D, p: Pair, c: Record<string, string>) {
	const h = GROUND - p.bottom;
	g.fillStyle = c.steel;
	g.beginPath();
	g.roundRect(p.x, p.bottom, p.w, h, [5, 5, 0, 0]);
	g.fill();
	g.fillStyle = c.dusk; // the shady side
	g.fillRect(p.x + p.w - 9, p.bottom + 6, 9, h - 6);
	g.fillStyle = [c.rosewood, c.sage, c.dusk][Math.floor(p.seed * 3)]; // a painted parapet
	g.beginPath();
	g.roundRect(p.x, p.bottom, p.w, 7, [5, 5, 1, 1]);
	g.fill();
	// windows: two or three columns, some lit
	const cols = p.w > 62 ? 3 : 2;
	const gap = (p.w - 9 - cols * 9) / (cols + 1);
	let i = 0;
	for (let y = p.bottom + 17; y + 12 < GROUND - 4; y += 21)
		for (let k = 0; k < cols; k++) {
			g.fillStyle = hash(p.seed, i++) > 0.35 ? c.flower : "rgb(45 58 71 / 0.55)";
			g.beginPath();
			g.roundRect(p.x + gap + k * (9 + gap), y, 9, 12, [4, 4, 1, 1]);
			g.fill();
		}
	// diyas along the roof edge
	for (let k = 0; k < 3; k++) {
		const x = p.x + (p.w - 9) * (k + 0.5) / 3;
		g.fillStyle = c.flower;
		g.beginPath();
		g.ellipse(x, p.bottom - 2.5, 1.8, 3, 0, 0, Math.PI * 2);
		g.fill();
	}
}

function garland(g: CanvasRenderingContext2D, p: Pair, c: Record<string, string>, t: number) {
	const n = 4;
	for (let k = 0; k < n; k++) {
		const x = p.x + 3 + ((p.w - 6) * (k + 0.5)) / n;
		g.strokeStyle = "rgb(45 58 71 / 0.8)";
		g.lineWidth = 1;
		g.beginPath();
		g.moveTo(x, 0);
		g.lineTo(x, p.top - 6);
		g.stroke();
		// marigolds and roses, then a fairy light at the end
		let j = 0;
		for (let y = p.top - 15; y > -6; y -= 9.5) {
			g.fillStyle = (j++ + k) % 3 === 2 ? c.blush : c.flower;
			g.beginPath();
			g.arc(x, y, 5, 0, Math.PI * 2);
			g.fill();
		}
		glow(g, x, p.top - 5, 11, 0.55 + 0.2 * Math.sin(t * 3 + k * 1.7));
		g.fillStyle = c.cream;
		g.beginPath();
		g.arc(x, p.top - 5, 3, 0, Math.PI * 2);
		g.fill();
	}
	// the cord across the top, with little bunting flags
	g.fillStyle = c.rosewood;
	for (let k = 0; k < n; k++) {
		const x = p.x + 3 + ((p.w - 6) * k) / n;
		const w = (p.w - 6) / n;
		g.beginPath();
		g.moveTo(x, 0);
		g.lineTo(x + w, 0);
		g.lineTo(x + w / 2, 11);
		g.fill();
	}
}

function lantern(g: CanvasRenderingContext2D, s: Sky, t: number, c: Record<string, string>) {
	const tilt = Math.max(-0.25, Math.min(0.3, s.vy / 900)); // noses up as it rises, down as it sinks
	glow(g, LX, s.y + 4, 64, 0.42);
	g.save();
	g.translate(LX, s.y);
	g.rotate(tilt);
	g.scale(1.1, 1.1); // drawn a touch bigger than its hit circle: a graze is forgiven
	// the paper: a tapered bag, round at the top, open at the bottom
	g.beginPath();
	g.moveTo(-10, 15);
	g.lineTo(-15, -8);
	g.bezierCurveTo(-15, -23, 15, -23, 15, -8);
	g.lineTo(10, 15);
	g.quadraticCurveTo(0, 18, -10, 15);
	g.closePath();
	const paper = g.createLinearGradient(0, -20, 0, 16);
	paper.addColorStop(0, c.rosewood);
	paper.addColorStop(0.55, c.flower);
	paper.addColorStop(1, c.cream);
	g.fillStyle = paper;
	g.fill();
	const lit = g.createRadialGradient(0, 12, 2, 0, 12, 22); // lit from inside by the flame
	lit.addColorStop(0, "rgb(255 247 230 / 0.8)");
	lit.addColorStop(1, "rgb(255 247 230 / 0)");
	g.fillStyle = lit;
	g.fill();
	g.strokeStyle = c["rose-ink"];
	g.lineWidth = 1.5;
	g.stroke();
	g.lineWidth = 1;
	g.globalAlpha = 0.45;
	for (const x of [-5, 5]) {
		g.beginPath();
		g.moveTo(x * 1.2, -18);
		g.quadraticCurveTo(x * 1.25, 0, x * 0.75, 16);
		g.stroke();
	}
	g.globalAlpha = 1;
	// the flame, flickering
	const f = 1 + 0.16 * Math.sin(t * 23) + 0.09 * Math.sin(t * 37);
	g.fillStyle = c.flower;
	g.beginPath();
	g.moveTo(0, 19 - 9 * f);
	g.quadraticCurveTo(4.5, 17, 0, 21);
	g.quadraticCurveTo(-4.5, 17, 0, 19 - 9 * f);
	g.fill();
	g.fillStyle = c.cream;
	g.beginPath();
	g.arc(0, 18.5, 1.8, 0, Math.PI * 2);
	g.fill();
	g.restore();
}
