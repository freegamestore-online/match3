import { useCallback, useEffect, useRef, useState } from "react";
import { useGameSounds } from "@freegamestore/games";
import type { GemType } from "../types";

const ROWS = 8;
const COLS = 8;
const GAME_DURATION = 60;

const GEM_TYPES: GemType[] = ["red", "blue", "green", "yellow", "purple", "orange"];

const GEM_COLORS: Record<GemType, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  purple: "#a855f7",
  orange: "#f97316",
};

interface Cell {
  id: number;
  type: GemType;
  /** Pixel offset for fall animation — 0 means "at rest" */
  offsetY: number;
  /** True while matched/popping */
  matched: boolean;
  /** True while falling into place */
  falling: boolean;
}

type Board = (Cell | null)[][];

interface GameProps {
  onScore: (score: number) => void;
  onGameOver: () => void;
  paused?: boolean;
}

let nextId = 1;

function randomGem(): Cell {
  return {
    id: nextId++,
    type: GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)]!,
    offsetY: 0,
    matched: false,
    falling: false,
  };
}

function createBoard(): Board {
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

function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

/** Find all matches of 3+ in rows and columns. Returns set of "r,c" strings. */
function findMatches(board: Board): { positions: Set<string>; matchCount: number } {
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
function hasValidMoves(board: Board): boolean {
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

function swap(board: Board, r1: number, c1: number, r2: number, c2: number) {
  const temp = board[r1]![c1];
  board[r1]![c1] = board[r2]![c2]!;
  board[r2]![c2] = temp ?? null;
}

function areAdjacent(r1: number, c1: number, r2: number, c2: number): boolean {
  return (Math.abs(r1 - r2) + Math.abs(c1 - c2)) === 1;
}

/** GemShape renders the distinct shape inside each gem */
function GemShape({ type }: { type: GemType }) {
  const size = 20;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;

  switch (type) {
    case "red": // Circle
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={r} fill="rgba(255,255,255,0.4)" />
        </svg>
      );
    case "blue": // Diamond (rotated square)
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <rect
            x={cx - r * 0.6}
            y={cy - r * 0.6}
            width={r * 1.2}
            height={r * 1.2}
            fill="rgba(255,255,255,0.4)"
            transform={`rotate(45 ${cx} ${cy})`}
          />
        </svg>
      );
    case "green": // Triangle
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <polygon
            points={`${cx},${cy - r} ${cx - r * 0.87},${cy + r * 0.5} ${cx + r * 0.87},${cy + r * 0.5}`}
            fill="rgba(255,255,255,0.4)"
          />
        </svg>
      );
    case "yellow": { // Star
      const pts: string[] = [];
      for (let i = 0; i < 5; i++) {
        const outerAngle = (Math.PI / 2) * -1 + (i * 2 * Math.PI) / 5;
        const innerAngle = outerAngle + Math.PI / 5;
        pts.push(`${cx + r * Math.cos(outerAngle)},${cy + r * Math.sin(outerAngle)}`);
        pts.push(`${cx + r * 0.4 * Math.cos(innerAngle)},${cy + r * 0.4 * Math.sin(innerAngle)}`);
      }
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <polygon points={pts.join(" ")} fill="rgba(255,255,255,0.4)" />
        </svg>
      );
    }
    case "purple": { // Pentagon
      const pts: string[] = [];
      for (let i = 0; i < 5; i++) {
        const angle = (Math.PI / 2) * -1 + (i * 2 * Math.PI) / 5;
        pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
      }
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <polygon points={pts.join(" ")} fill="rgba(255,255,255,0.4)" />
        </svg>
      );
    }
    case "orange": { // Hexagon
      const pts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i * 2 * Math.PI) / 6;
        pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
      }
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <polygon points={pts.join(" ")} fill="rgba(255,255,255,0.4)" />
        </svg>
      );
    }
  }
}

export function Game({ onScore, onGameOver, paused }: GameProps) {
  const sounds = useGameSounds();
  const [board, setBoard] = useState<Board>(() => createBoard());
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [animating, setAnimating] = useState(false);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const scoreAccum = useRef(0);
  const onScoreRef = useRef(onScore);
  const onGameOverRef = useRef(onGameOver);
  const pausedRef = useRef(paused);
  onScoreRef.current = onScore;
  onGameOverRef.current = onGameOver;
  pausedRef.current = paused;

  const dragStartRef = useRef<{ row: number; col: number; x: number; y: number } | null>(null);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          sounds.playGameOver();
          onGameOverRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  /** Process matches, cascade, repeat. Returns total points earned. */
  const processBoard = useCallback((b: Board): { board: Board; points: number } => {
    let current = cloneBoard(b);
    let totalPoints = 0;
    let cascadeLevel = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { positions } = findMatches(current);
      if (positions.size === 0) break;

      cascadeLevel++;
      if (cascadeLevel === 1) {
        sounds.playScore();
      } else {
        sounds.playClear();
      }
      const multiplier = cascadeLevel;
      const pts = computeMatchScore(current, positions);
      totalPoints += pts * multiplier;

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

    return { board: current, points: totalPoints };
  }, []);

  /** Attempt a swap, process matches, or swap back if no match */
  const trySwap = useCallback(
    (r1: number, c1: number, r2: number, c2: number) => {
      if (animating) return;
      if (!areAdjacent(r1, c1, r2, c2)) return;

      sounds.playMove();
      setAnimating(true);
      setSelected(null);

      setBoard((prev) => {
        const next = cloneBoard(prev);
        swap(next, r1, c1, r2, c2);

        const { positions } = findMatches(next);
        if (positions.size === 0) {
          // No match — swap back
          setTimeout(() => setAnimating(false), 0);
          return prev;
        }

        // Process cascades
        const result = processBoard(next);
        scoreAccum.current += result.points;
        onScoreRef.current(scoreAccum.current);

        // Check for valid moves after settling
        if (!hasValidMoves(result.board)) {
          // Shuffle
          const shuffled = createBoard();
          setTimeout(() => setAnimating(false), 0);
          return shuffled;
        }

        setTimeout(() => setAnimating(false), 0);
        return result.board;
      });
    },
    [animating, processBoard],
  );

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (animating || timeLeft <= 0) return;

      if (selected) {
        if (selected.row === row && selected.col === col) {
          setSelected(null);
        } else if (areAdjacent(selected.row, selected.col, row, col)) {
          trySwap(selected.row, selected.col, row, col);
        } else {
          setSelected({ row, col });
        }
      } else {
        setSelected({ row, col });
      }
    },
    [selected, animating, trySwap, timeLeft],
  );

  const handlePointerDown = useCallback(
    (row: number, col: number, e: React.PointerEvent) => {
      if (animating || timeLeft <= 0) return;
      dragStartRef.current = { row, col, x: e.clientX, y: e.clientY };
    },
    [animating, timeLeft],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current || animating || timeLeft <= 0) return;
      const start = dragStartRef.current;
      dragStartRef.current = null;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Need minimum drag distance
      if (absDx < 15 && absDy < 15) return; // handled by click

      let targetRow = start.row;
      let targetCol = start.col;

      if (absDx > absDy) {
        targetCol += dx > 0 ? 1 : -1;
      } else {
        targetRow += dy > 0 ? 1 : -1;
      }

      if (targetRow >= 0 && targetRow < ROWS && targetCol >= 0 && targetCol < COLS) {
        setSelected(null);
        trySwap(start.row, start.col, targetRow, targetCol);
      }
    },
    [animating, trySwap, timeLeft],
  );

  const timerPercent = (timeLeft / GAME_DURATION) * 100;
  const timerColor = timeLeft <= 10 ? "var(--error)" : "var(--accent)";

  return (
    <div
      className="flex flex-col items-center justify-center h-full w-full gap-3 p-4 select-none"
      onPointerUp={handlePointerUp}
    >
      {/* Timer bar */}
      <div className="w-full flex items-center gap-3" style={{ maxWidth: "min(90vw, 450px)" }}>
        <div
          className="flex-1 h-3 rounded-full overflow-hidden"
          style={{ background: "var(--line)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${timerPercent}%`,
              background: timerColor,
              transition: "width 1s linear",
            }}
          />
        </div>
        <span
          className="text-sm font-bold tabular-nums"
          style={{ color: timerColor, fontFamily: "Fraunces, serif", minWidth: "2ch" }}
        >
          {timeLeft}
        </span>
      </div>

      {/* Board */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gap: 3,
          width: "min(90vw, 450px)",
          maxWidth: 450,
          aspectRatio: "1",
          background: "var(--line)",
          borderRadius: "1.25rem",
          padding: 4,
          touchAction: "none",
        }}
      >
        {board.map((row, r) =>
          row.map((cell, c) => {
            if (!cell) return <div key={`${r}-${c}`} />;
            const isSelected = selected?.row === r && selected?.col === c;
            return (
              <button
                key={cell.id}
                onClick={() => handleCellClick(r, c)}
                onPointerDown={(e) => handlePointerDown(r, c, e)}
                className="relative flex items-center justify-center rounded-lg"
                style={{
                  background: GEM_COLORS[cell.type],
                  aspectRatio: "1",
                  minWidth: 0,
                  minHeight: 0,
                  border: "none",
                  outline: isSelected ? "3px solid var(--ink)" : "2px solid rgba(255,255,255,0.2)",
                  outlineOffset: isSelected ? -1 : 0,
                  cursor: animating || timeLeft <= 0 ? "default" : "pointer",
                  transition: "transform 0.15s, outline 0.1s",
                  transform: isSelected ? "scale(1.1)" : "scale(1)",
                  boxShadow: isSelected
                    ? "0 0 12px rgba(0,0,0,0.3)"
                    : "inset 0 -2px 4px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.2)",
                  touchAction: "none",
                }}
                aria-label={`${cell.type} gem at row ${r + 1}, column ${c + 1}`}
              >
                <GemShape type={cell.type} />
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
