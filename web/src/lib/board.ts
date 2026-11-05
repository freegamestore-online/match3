import type { GemType } from "../types";

export const ROWS = 8;
export const COLS = 8;

export const GEM_TYPES: GemType[] = ["red", "blue", "green", "yellow", "purple", "orange"];

export interface Cell {
  id: number;
  type: GemType;
}

export type Board = (Cell | null)[][];

let nextId = 1;

function randomGem(): Cell {
  return {
    id: nextId++,
    type: GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)]!,
  };
}

export function createBoard(): Board {
  const board: Board = [];
  for (let r = 0; r < ROWS; r++) {
    const row: (Cell | null)[] = [];
    for (let c = 0; c < COLS; c++) {
      // Keep regenerating until no immediate 3-match
      let gem = randomGem();
      while (wouldMatch(board, row, r, c, gem.type)) {
        gem = randomGem();
      }
      row.push(gem);
    }
    board.push(row);
  }
  return board;
}

/** Check if placing `type` at (r,c) would create a 3-match during board generation */
function wouldMatch(
  board: Board,
  currentRow: (Cell | null)[],
  r: number,
  c: number,
  type: GemType,
): boolean {
  // Check horizontal (left 2)
  if (c >= 2) {
    const left1 = currentRow[c - 1];
    const left2 = currentRow[c - 2];
    if (left1 && left2 && left1.type === type && left2.type === type) return true;
  }
  // Check vertical (up 2)
  if (r >= 2) {
    const up1 = board[r - 1]?.[c];
    const up2 = board[r - 2]?.[c];
    if (up1 && up2 && up1.type === type && up2.type === type) return true;
  }
  return false;
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

/** Find all matches of 3+ in rows and columns. Returns set of "r,c" strings. */
export function findMatches(board: Board): { positions: Set<string>; matchCount: number } {
  const positions = new Set<string>();
  let matchCount = 0;

  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    let runStart = 0;
    for (let c = 1; c <= COLS; c++) {
      const current = c < COLS ? board[r]?.[c] : null;
      const prev = board[r]?.[runStart];
      if (current && prev && current.type === prev.type) continue;
      const runLen = c - runStart;
      if (runLen >= 3 && prev) {
        matchCount++;
        for (let k = runStart; k < c; k++) {
          positions.add(`${r},${k}`);
        }
      }
      runStart = c;
    }
  }

  // Vertical
  for (let c = 0; c < COLS; c++) {
    let runStart = 0;
    for (let r = 1; r <= ROWS; r++) {
      const current = r < ROWS ? board[r]?.[c] : null;
      const prev = board[runStart]?.[c];
      if (current && prev && current.type === prev.type) continue;
      const runLen = r - runStart;
      if (runLen >= 3 && prev) {
        matchCount++;
        for (let k = runStart; k < r; k++) {
          positions.add(`${k},${c}`);
        }
      }
      runStart = r;
    }
  }

  return { positions, matchCount };
}

/** Score for a single match group based on number of gems */
function matchScore(count: number): number {
  if (count >= 5) return 100;
  if (count >= 4) return 60;
  return 30;
}

/** Compute total score from all match positions (group matches by connected runs) */
function computeMatchScore(_board: Board, positions: Set<string>): number {
  let total = 0;

  // Horizontal runs
  for (let r = 0; r < ROWS; r++) {
    let runLen = 0;
    for (let c = 0; c <= COLS; c++) {
      if (c < COLS && positions.has(`${r},${c}`)) {
        runLen++;
      } else {
        if (runLen >= 3) total += matchScore(runLen);
        runLen = 0;
      }
    }
  }

  // Vertical runs
  for (let c = 0; c < COLS; c++) {
    let runLen = 0;
    for (let r = 0; r <= ROWS; r++) {
      if (r < ROWS && positions.has(`${r},${c}`)) {
        runLen++;
      } else {
        if (runLen >= 3) total += matchScore(runLen);
        runLen = 0;
      }
    }
  }

  return total;
}

/** Check if any valid swap exists on the board */
export function hasValidMoves(board: Board): boolean {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      // Try swap right
      if (c < COLS - 1) {
        swap(board, r, c, r, c + 1);
        const { positions } = findMatches(board);
        swap(board, r, c, r, c + 1); // swap back
        if (positions.size > 0) return true;
      }
      // Try swap down
      if (r < ROWS - 1) {
        swap(board, r, c, r + 1, c);
        const { positions } = findMatches(board);
        swap(board, r, c, r + 1, c); // swap back
        if (positions.size > 0) return true;
      }
    }
  }
  return false;
}

export function swap(board: Board, r1: number, c1: number, r2: number, c2: number) {
  const temp = board[r1]![c1];
  board[r1]![c1] = board[r2]![c2]!;
  board[r2]![c2] = temp ?? null;
}

export function areAdjacent(r1: number, c1: number, r2: number, c2: number): boolean {
  return (Math.abs(r1 - r2) + Math.abs(c1 - c2)) === 1;
}

/** Clear matches, apply gravity and refill, repeating until the board settles. */
export function processBoard(b: Board): { board: Board; points: number; cascades: number } {
  const current = cloneBoard(b);
  let totalPoints = 0;
  let cascadeLevel = 0;

  while (true) {
    const { positions } = findMatches(current);
    if (positions.size === 0) break;

    cascadeLevel++;
    const pts = computeMatchScore(current, positions);
    totalPoints += pts * cascadeLevel;

    // Remove matched gems
    for (const key of positions) {
      const [rs, cs] = key.split(",");
      const r = parseInt(rs!, 10);
      const c = parseInt(cs!, 10);
      current[r]![c] = null;
    }

    // Gravity: gems fall down
    for (let c = 0; c < COLS; c++) {
      let writeRow = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (current[r]![c] !== null) {
          if (writeRow !== r) {
            current[writeRow]![c] = current[r]![c] ?? null;
            current[r]![c] = null;
          }
          writeRow--;
        }
      }
      // Fill empty top rows with new gems
      for (let r = writeRow; r >= 0; r--) {
        current[r]![c] = randomGem();
      }
    }
  }

  return { board: current, points: totalPoints, cascades: cascadeLevel };
}
