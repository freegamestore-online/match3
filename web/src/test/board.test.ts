import { describe, expect, it } from "vitest";
import { type Board, COLS, ROWS, createBoard, findMatches, hasValidMoves, processBoard } from "../lib/board";
import type { GemType } from "../types";

const fromTypes = (rows: GemType[][]): Board =>
  rows.map((row, r) => row.map((type, c) => ({ id: r * COLS + c, type })));

// 8x8 board with no matches: a repeating 3-colour diagonal stripe.
const STRIPES: GemType[] = ["red", "blue", "green"];
const quiet = (): GemType[][] =>
  Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => STRIPES[(r + c) % 3]!));

describe("match3 board", () => {
  it("generates boards without ready-made matches", () => {
    for (let i = 0; i < 20; i++) expect(findMatches(createBoard()).positions.size).toBe(0);
  });

  it("finds a horizontal three and scores it", () => {
    const types = quiet();
    types[0] = ["purple", "purple", "purple", ...types[0]!.slice(3)];
    const { positions } = findMatches(fromTypes(types));
    expect([...positions].sort()).toEqual(["0,0", "0,1", "0,2"]);
    const result = processBoard(fromTypes(types));
    expect(result.points).toBeGreaterThanOrEqual(30);
    expect(result.cascades).toBeGreaterThanOrEqual(1);
    expect(findMatches(result.board).positions.size).toBe(0);
    expect(result.board.flat().every((c) => c !== null)).toBe(true);
  });

  it("detects whether a swap can make a match", () => {
    expect(hasValidMoves(fromTypes(quiet()))).toBe(false);
    const types = quiet();
    types[0]![0] = "purple";
    types[0]![1] = "purple";
    types[1]![2] = "purple";
    expect(findMatches(fromTypes(types)).positions.size).toBe(0);
    expect(hasValidMoves(fromTypes(types))).toBe(true);
  });
});
