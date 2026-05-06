// Aetheria — Glicko-2 update (pure).
//
// Reference: Glickman, "Example of the Glicko-2 system" (2013).
// Defaults: τ = 0.5, σ₀ = 0.06, RD₀ = 350. We operate on a single
// "rating period" containing one match for simplicity (matches the
// real-time write path in `MmrService.applyMatchResult`).

const SCALE = 173.7178;
const ANCHOR = 1500;
const DEFAULT_TAU = 0.5;
const CONVERGENCE = 1e-6;
const MAX_ITERATIONS = 50;

export interface GlickoRating {
  readonly rating: number;
  readonly rd: number;
  readonly volatility: number;
}

export interface GlickoOpponent {
  readonly rating: number;
  readonly rd: number;
  /** 1 = win, 0 = loss, 0.5 = draw. */
  readonly score: 0 | 0.5 | 1;
}

export const DEFAULT_RATING: GlickoRating = {
  rating: 1000,
  rd: 350,
  volatility: 0.06,
};

const toMu = (r: number): number => (r - ANCHOR) / SCALE;
const toPhi = (rd: number): number => rd / SCALE;
const fromMu = (mu: number): number => mu * SCALE + ANCHOR;
const fromPhi = (phi: number): number => phi * SCALE;

const g = (phi: number): number => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

const expected = (mu: number, muJ: number, phiJ: number): number =>
  1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/**
 * Solve for the new volatility σ' using the "Illinois" variant of
 * regula-falsi exactly as in the Glickman example. Pure.
 */
const newVolatility = (
  sigma: number,
  phi: number,
  v: number,
  delta: number,
  tau: number,
): number => {
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * (phi * phi + v + ex) ** 2;
    return num / den - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0 && k < 100) k++;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < MAX_ITERATIONS && Math.abs(B - A) > CONVERGENCE; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
};

/**
 * Apply one rating period containing the given opponents. Returns the
 * updated rating + RD + volatility for `self`.
 */
export const glicko2Update = (
  self: GlickoRating,
  opponents: readonly GlickoOpponent[],
  tau: number = DEFAULT_TAU,
): GlickoRating => {
  if (opponents.length === 0) {
    // No games this period: only RD inflates.
    const phi = toPhi(self.rd);
    const phiNew = Math.sqrt(phi * phi + self.volatility * self.volatility);
    return {
      rating: self.rating,
      rd: fromPhi(phiNew),
      volatility: self.volatility,
    };
  }

  const mu = toMu(self.rating);
  const phi = toPhi(self.rd);

  // v = 1 / Σ g(φj)² E (1 - E)
  let invV = 0;
  let scoreSum = 0;
  for (const op of opponents) {
    const muJ = toMu(op.rating);
    const phiJ = toPhi(op.rd);
    const E = expected(mu, muJ, phiJ);
    const gPhiJ = g(phiJ);
    invV += gPhiJ * gPhiJ * E * (1 - E);
    scoreSum += gPhiJ * (op.score - E);
  }
  const v = 1 / invV;
  const delta = v * scoreSum;

  const sigmaNew = newVolatility(self.volatility, phi, v, delta, tau);
  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * scoreSum;

  return {
    rating: Math.round(fromMu(muNew)),
    rd: fromPhi(phiNew),
    volatility: sigmaNew,
  };
};

/** Convenience: single-opponent 1v1 update. */
export const glicko2Single = (
  self: GlickoRating,
  opponent: Pick<GlickoRating, "rating" | "rd">,
  score: GlickoOpponent["score"],
  tau: number = DEFAULT_TAU,
): GlickoRating =>
  glicko2Update(self, [{ rating: opponent.rating, rd: opponent.rd, score }], tau);
