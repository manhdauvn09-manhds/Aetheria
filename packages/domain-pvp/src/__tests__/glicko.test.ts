import { describe, expect, it } from "vitest";

import { DEFAULT_RATING, glicko2Single, glicko2Update } from "../glicko.js";

describe("glicko2Update — Glickman 2013 example", () => {
  // From "Example of the Glicko-2 system" (Mark Glickman):
  // self r=1500 RD=200 σ=0.06; opponents (1400,30,1), (1550,100,0), (1700,300,0)
  // expected new r ≈ 1464.06, RD ≈ 151.52, σ ≈ 0.05999.
  it("matches the published worked example within 1 rating point", () => {
    const result = glicko2Update(
      { rating: 1500, rd: 200, volatility: 0.06 },
      [
        { rating: 1400, rd: 30, score: 1 },
        { rating: 1550, rd: 100, score: 0 },
        { rating: 1700, rd: 300, score: 0 },
      ],
      0.5,
    );
    expect(result.rating).toBeGreaterThanOrEqual(1463);
    expect(result.rating).toBeLessThanOrEqual(1465);
    expect(result.rd).toBeGreaterThan(150);
    expect(result.rd).toBeLessThan(153);
    expect(result.volatility).toBeGreaterThan(0.0599);
    expect(result.volatility).toBeLessThan(0.06005);
  });
});

describe("glicko2Single", () => {
  const a = DEFAULT_RATING;
  const b = DEFAULT_RATING;

  it("winner gains, loser loses (equal opponents)", () => {
    const aWin = glicko2Single(a, b, 1);
    const bLoss = glicko2Single(b, a, 0);
    expect(aWin.rating).toBeGreaterThan(a.rating);
    expect(bLoss.rating).toBeLessThan(b.rating);
  });

  it("draw vs equal opponent does not move rating much", () => {
    const draw = glicko2Single(a, b, 0.5);
    expect(Math.abs(draw.rating - a.rating)).toBeLessThanOrEqual(2);
  });

  it("RD shrinks after a game (more confidence)", () => {
    const after = glicko2Single({ rating: 1500, rd: 350, volatility: 0.06 }, b, 1);
    expect(after.rd).toBeLessThan(350);
  });
});

describe("glicko2Update — no games", () => {
  it("only inflates RD by σ", () => {
    const r = glicko2Update({ rating: 1500, rd: 200, volatility: 0.06 }, []);
    expect(r.rating).toBe(1500);
    expect(r.rd).toBeGreaterThan(200);
    expect(r.volatility).toBe(0.06);
  });
});
