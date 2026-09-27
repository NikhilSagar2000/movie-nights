import type { Dir } from "../kit";

/* 2048 on a 4×4 board. Pure: the view feeds it moves. Every tile has a stable id so the view can slide it;
   a merge makes a new tile (so its pop plays) and reports the two it swallowed as `gone`, sliding into its cell. */

export const N = 4;
/** `fresh` = just spawned, `merged` = just made by a merge (the view pops both on mount). */
export type Tile = { id: number; v: number; fresh?: true; merged?: true };
export type Board = (Tile | null)[][];
export type Gone = Tile & { r: number; c: number };

let last = 0;
const newId = () => ++last;

/** The cells of line `i`, starting at the wall the tiles slide towards. */
const line = (d: Dir, i: number): [number, number][] =>
	[0, 1, 2, 3].map((k) => {
		const j = d === "right" || d === "down" ? N - 1 - k : k;
		return d === "left" || d === "right" ? [i, j] : [j, i];
	});

/** One move. Each tile merges at most once, and the pair nearest the wall merges first ([2,2,2] left → [4,2]). */
export function slide(b: Board, d: Dir) {
	const board: Board = b.map((row) => row.map(() => null));
	const gone: Gone[] = [];
	let gained = 0;
	for (let i = 0; i < N; i++) {
		const cells = line(d, i);
		const tiles = cells.map(([r, c]) => b[r][c]).filter((t) => t !== null);
		let k = 0;
		for (let j = 0; j < tiles.length; j++) {
			const [r, c] = cells[k++];
			const t = tiles[j];
			const u = tiles[j + 1];
			if (u && u.v === t.v) {
				board[r][c] = { id: newId(), v: t.v * 2, merged: true };
				gone.push({ ...t, r, c }, { ...u, r, c });
				gained += t.v * 2;
				j++;
			} else board[r][c] = t;
		}
	}
	const moved = board.some((row, r) => row.some((t, c) => t?.id !== b[r][c]?.id));
	return { board, gained, moved, gone };
}

/** A 2 (90%) or a 4 (10%) in a random empty cell. */
export function spawn(b: Board, rnd = Math.random): Board {
	const free = b.flatMap((row, r) => row.flatMap((t, c) => (t ? [] : [[r, c]])));
	if (!free.length) return b;
	const [r, c] = free[Math.floor(rnd() * free.length)];
	const tile: Tile = { id: newId(), v: rnd() < 0.9 ? 2 : 4, fresh: true };
	return b.map((row, y) => row.map((t, x) => (y === r && x === c ? tile : t)));
}

export const newBoard = (rnd = Math.random): Board => spawn(spawn(Array.from({ length: N }, () => Array(N).fill(null)), rnd), rnd);

/** False when the board is full and no two neighbours match. */
export const canMove = (b: Board) =>
	b.some((row, r) => row.some((t, c) => !t || t.v === row[c + 1]?.v || t.v === b[r + 1]?.[c]?.v));
