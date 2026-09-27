import { describe, expect, it } from "vitest";
import { canMove, slide, spawn, type Board } from "./bloom";

let id = 1000;
const board = (rows: number[][]): Board => rows.map((row) => row.map((v) => (v ? { id: id++, v } : null)));
const values = (b: Board) => b.map((row) => row.map((t) => t?.v ?? 0));
const row = (r: number[]) => [r, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];

describe("bloom", () => {
	it("merges each tile at most once per move", () => {
		const s = slide(board(row([4, 4, 8, 0])), "left");
		expect(values(s.board)[0]).toEqual([8, 8, 0, 0]);
		expect(s.gained).toBe(8);
	});
	it("merges pairs from the wall out", () => {
		const s = slide(board(row([2, 2, 2, 2])), "left");
		expect(values(s.board)[0]).toEqual([4, 4, 0, 0]);
		expect(s.gained).toBe(8);
		expect(values(slide(board(row([2, 2, 4, 4])), "left").board)[0]).toEqual([4, 8, 0, 0]);
		expect(values(slide(board(row([2, 2, 2, 0])), "right").board)[0]).toEqual([0, 0, 2, 4]);
	});
	it("slides columns up and down", () => {
		const b = board([
			[2, 0, 0, 0],
			[0, 0, 0, 0],
			[2, 0, 0, 0],
			[4, 0, 0, 0],
		]);
		expect(values(slide(b, "up").board).map((r) => r[0])).toEqual([4, 4, 0, 0]);
		expect(values(slide(b, "down").board).map((r) => r[0])).toEqual([0, 0, 4, 4]);
	});
	it("keeps ids of tiles that only slide; a merge makes a new tile and reports the two it swallowed", () => {
		const b = board(row([0, 8, 2, 2]));
		const s = slide(b, "left");
		expect(s.board[0][0]!.id).toBe(b[0][1]!.id);
		expect(s.board[0][1]).toMatchObject({ v: 4, merged: true });
		expect(s.gone.map((g) => [g.id, g.r, g.c])).toEqual([
			[b[0][2]!.id, 0, 1],
			[b[0][3]!.id, 0, 1],
		]);
	});
	it("reports a move only when something moved", () => {
		expect(slide(board(row([2, 4, 0, 0])), "left").moved).toBe(false);
		expect(slide(board(row([2, 4, 0, 0])), "right").moved).toBe(true);
		expect(slide(board(row([2, 2, 0, 0])), "left").moved).toBe(true);
	});
	it("spawns a 2 (90%) or a 4 (10%) in an empty cell", () => {
		const b = board(row([2, 4, 8, 0]));
		const two = spawn(b, () => 0.5);
		expect(values(two).flat().filter(Boolean)).toHaveLength(4);
		expect(values(two)[0].slice(0, 3)).toEqual([2, 4, 8]); // not on a full cell
		expect(values(spawn(b, () => 0.95)).flat().filter((v) => v === 4)).toHaveLength(2);
	});
	it("knows when no move is left", () => {
		const stuck = [
			[2, 4, 2, 4],
			[4, 2, 4, 2],
			[2, 4, 2, 4],
			[4, 2, 4, 2],
		];
		expect(canMove(board(stuck))).toBe(false);
		expect(canMove(board(stuck.map((r, i) => (i === 3 ? [4, 2, 4, 4] : r))))).toBe(true); // a pair in a row
		expect(canMove(board(stuck.map((r, i) => (i === 3 ? [2, 2, 4, 2] : r))))).toBe(true); // a pair in a column
		expect(canMove(board(stuck.map((r, i) => (i === 0 ? [2, 4, 2, 0] : r))))).toBe(true); // an empty cell
	});
});
