import { describe, expect, it } from "vitest";
import { newSnake, step, turn, type Snake } from "./snake";

const at = (body: [number, number][], food: [number, number] = [0, 0]): Snake => ({ body, dir: "right", queue: [], food, alive: true, eaten: 0 });

describe("snake", () => {
	it("moves one cell and keeps its length", () => {
		const s = step(at([[3, 5], [2, 5], [1, 5]]), 10);
		expect(s.body).toEqual([[4, 5], [3, 5], [2, 5]]);
		expect(s.alive).toBe(true);
	});
	it("grows when it eats", () => {
		const s = step(at([[3, 5], [2, 5], [1, 5]], [4, 5]), 10, () => 0);
		expect(s.body).toHaveLength(4);
		expect(s.eaten).toBe(1);
		expect(s.body.some(([x, y]) => x === s.food[0] && y === s.food[1])).toBe(false); // new food lands on a free cell
	});
	it("dies on a wall", () => {
		expect(step(at([[9, 5], [8, 5], [7, 5]]), 10).alive).toBe(false);
	});
	it("dies on its own body, but may follow its tail", () => {
		// a 2×2 loop: moving into the cell the tail is leaving is fine
		const loop = at([[1, 0], [1, 1], [0, 1], [0, 0]], [5, 5]);
		expect(step({ ...loop, dir: "left" }, 10).alive).toBe(true);
		const s = at([[2, 1], [2, 2], [1, 2], [1, 1], [1, 0], [2, 0]], [5, 5]);
		expect(step({ ...s, dir: "left" }, 10).alive).toBe(false);
	});
	it("can't reverse, and queues two turns", () => {
		let s = newSnake(17);
		s = turn(s, "left"); // reverse of right: ignored
		expect(s.queue).toEqual([]);
		s = turn(turn(turn(s, "up"), "left"), "down");
		expect(s.queue).toEqual(["up", "left"]); // a third is dropped
		s = step(step(s, 17), 17);
		expect(s.dir).toBe("left");
	});
});
