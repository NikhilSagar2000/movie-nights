/* Minesweeper on an n×n board. Pure: the view feeds it opens, chords and flags. The mines go down on the first
   open, never in the 3×3 around it, so the first tap always opens an area. */

export type Cell = { mine: boolean; open: boolean; flag: boolean; near: number };
export type Board = { n: number; mines: number; cells: Cell[]; placed: boolean; state: "play" | "won" | "lost"; hit?: number };

export const newBoard = (n: number, mines: number): Board => ({
	n,
	mines,
	cells: Array.from({ length: n * n }, () => ({ mine: false, open: false, flag: false, near: 0 })),
	placed: false,
	state: "play",
});

/** The (up to 8) cells touching cell i. */
export function around(n: number, i: number): number[] {
	const x = i % n;
	const y = Math.floor(i / n);
	const out: number[] = [];
	for (let dy = -1; dy <= 1; dy++)
		for (let dx = -1; dx <= 1; dx++) {
			const X = x + dx;
			const Y = y + dy;
			if ((dx || dy) && X >= 0 && Y >= 0 && X < n && Y < n) out.push(Y * n + X);
		}
	return out;
}

/** A copy of the cells with the mines laid anywhere but `first` and its neighbours, and every cell's count. */
function lay(b: Board, first: number, rnd: () => number): Cell[] {
	const safe = new Set([first, ...around(b.n, first)]);
	const spots = b.cells.map((_, i) => i).filter((i) => !safe.has(i));
	for (let k = 0; k < b.mines; k++) {
		const j = k + Math.floor(rnd() * (spots.length - k)); // a partial shuffle: the first `mines` spots are the pick
		[spots[k], spots[j]] = [spots[j], spots[k]];
	}
	const cells = b.cells.map((c) => ({ ...c }));
	for (const i of spots.slice(0, b.mines)) cells[i].mine = true;
	cells.forEach((c, i) => (c.near = around(b.n, i).filter((j) => cells[j].mine).length));
	return cells;
}

/** Opens `start` in `cells` (a fresh copy), spreading out from every zero. Flags stay shut. */
function reveal(b: Board, cells: Cell[], start: number[]): Board {
	const todo = [...start];
	let hit: number | undefined;
	while (todo.length) {
		const i = todo.pop()!;
		const c = cells[i];
		if (c.open || c.flag) continue;
		c.open = true;
		if (c.mine) hit ??= i;
		else if (c.near === 0) todo.push(...around(b.n, i));
	}
	if (hit !== undefined) return { ...b, cells, state: "lost", hit };
	const won = cells.every((c) => c.mine || c.open);
	if (won) for (const c of cells) c.flag = c.mine; // the classic tidy-up: every mine gets its flag
	return { ...b, cells, state: won ? "won" : "play" };
}

export function open(b: Board, i: number, rnd = Math.random): Board {
	if (b.state !== "play" || b.cells[i].open || b.cells[i].flag) return b;
	const cells = b.placed ? b.cells.map((c) => ({ ...c })) : lay(b, i, rnd);
	return reveal({ ...b, placed: true }, cells, [i]);
}

/** Tap on an open number whose flags add up: open everything else around it (a wrong flag loses). */
export function chord(b: Board, i: number): Board {
	const c = b.cells[i];
	if (b.state !== "play" || !c.open || !c.near) return b;
	const next = around(b.n, i);
	if (next.filter((j) => b.cells[j].flag).length !== c.near) return b;
	return reveal(b, b.cells.map((c) => ({ ...c })), next);
}

export function flag(b: Board, i: number): Board {
	if (b.state !== "play" || b.cells[i].open) return b;
	const cells = b.cells.slice();
	cells[i] = { ...cells[i], flag: !cells[i].flag };
	return { ...b, cells };
}
