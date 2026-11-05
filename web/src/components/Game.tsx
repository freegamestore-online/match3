import { useCallback, useEffect, useRef, useState } from "react";
import { useGameSounds } from "@freegamestore/games";
import type { GemType } from "../types";
import {
  type Board,
  COLS,
  ROWS,
  areAdjacent,
  cloneBoard,
  createBoard,
  findMatches,
  hasValidMoves,
  processBoard,
  swap,
} from "../lib/board";

const GAME_DURATION = 60;

const GEM_COLORS: Record<GemType, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  purple: "#a855f7",
  orange: "#f97316",
};

interface GameProps {
  onScore: (score: number) => void;
  onGameOver: () => void;
  paused?: boolean;
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
  // Read sounds through a ref so callbacks see the current mute state.
  const soundsRef = useRef(sounds);
  soundsRef.current = sounds;
  const [board, setBoard] = useState<Board>(() => createBoard());
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const scoreAccum = useRef(0);
  const onScoreRef = useRef(onScore);
  const onGameOverRef = useRef(onGameOver);
  const pausedRef = useRef(paused);
  onScoreRef.current = onScore;
  onGameOverRef.current = onGameOver;
  pausedRef.current = paused;
  const locked = paused || timeLeft <= 0;

  const dragStartRef = useRef<{ row: number; col: number; x: number; y: number } | null>(null);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (timeLeft > 0) return;
    soundsRef.current.playGameOver();
    onGameOverRef.current();
  }, [timeLeft]);

  /** Attempt a swap and settle cascades; nothing happens if the swap makes no match */
  const trySwap = useCallback(
    (r1: number, c1: number, r2: number, c2: number) => {
      if (locked || !areAdjacent(r1, c1, r2, c2)) return;

      soundsRef.current.playMove();
      setSelected(null);

      const next = cloneBoard(board);
      swap(next, r1, c1, r2, c2);
      if (findMatches(next).positions.size === 0) return;

      const result = processBoard(next);
      soundsRef.current.playScore();
      for (let level = 2; level <= result.cascades; level++) soundsRef.current.playClear();
      scoreAccum.current += result.points;
      onScoreRef.current(scoreAccum.current);

      // Reshuffle when the settled board has no moves left
      setBoard(hasValidMoves(result.board) ? result.board : createBoard());
    },
    [board, locked],
  );

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (locked) return;

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
    [selected, locked, trySwap],
  );

  const handlePointerDown = useCallback(
    (row: number, col: number, e: React.PointerEvent) => {
      if (locked) return;
      dragStartRef.current = { row, col, x: e.clientX, y: e.clientY };
    },
    [locked],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current || locked) return;
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
    [locked, trySwap],
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
                  cursor: locked ? "default" : "pointer",
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
