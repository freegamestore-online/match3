import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GemType } from "../types";

// Fixed board: purple at (0,0), (0,1), (1,2); swapping (1,2) up makes a row of three.
const STRIPES: GemType[] = ["red", "blue", "green"];
vi.mock("../lib/board", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../lib/board")>();
  let id = 1000;
  return {
    ...mod,
    createBoard: () => {
      const b = Array.from({ length: mod.ROWS }, (_, r) =>
        Array.from({ length: mod.COLS }, (_, c) => ({ id: id++, type: STRIPES[(r + c) % 3]! })),
      );
      b[0]![0]!.type = "purple";
      b[0]![1]!.type = "purple";
      b[1]![2]!.type = "purple";
      return b;
    },
  };
});

const { Game } = await import("../components/Game");

const gem = (r: number, c: number) => screen.getByLabelText(new RegExp(`gem at row ${r + 1}, column ${c + 1}$`));

describe("Game", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("scores a match exactly once under StrictMode", () => {
    const onScore = vi.fn();
    render(
      <StrictMode>
        <Game onScore={onScore} onGameOver={() => {}} />
      </StrictMode>,
    );
    fireEvent.click(gem(1, 2));
    fireEvent.click(gem(0, 2));
    expect(onScore).toHaveBeenCalledTimes(1);
    expect(onScore.mock.calls[0]![0]).toBeGreaterThanOrEqual(30);
  });

  it("ignores input while paused", () => {
    const onScore = vi.fn();
    render(<Game onScore={onScore} onGameOver={() => {}} paused />);
    fireEvent.click(gem(1, 2));
    fireEvent.click(gem(0, 2));
    expect(onScore).not.toHaveBeenCalled();
  });

  it("calls onGameOver once when time runs out under StrictMode", () => {
    const onGameOver = vi.fn();
    render(
      <StrictMode>
        <Game onScore={() => {}} onGameOver={onGameOver} />
      </StrictMode>,
    );
    act(() => vi.advanceTimersByTime(61_000));
    expect(onGameOver).toHaveBeenCalledTimes(1);
  });
});
