// Price comparison shared by truck and warehouse matching. Pure: plain numbers in and out.
// The zero-score ratio is a tunable default in ./config.ts.
import { PRICE_ZERO_SCORE_RATIO } from './config.js';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Median of a non-empty list (mean of the middle two for an even count). Order-independent. */
export function medianPrice(prices: readonly number[]): number {
  if (prices.length === 0) throw new Error('medianPrice needs at least one price');
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** The shipper's budget if given; otherwise the median est. price of all feasible matches. */
export function priceReference(maxBudget: number | null, feasiblePrices: readonly number[]): number {
  return maxBudget ?? medianPrice(feasiblePrices);
}

/** 1 at half the reference or less, 0.5 at the reference, 0 at 1.5× or more (linear between). */
export function priceScore(estPrice: number, reference: number): number {
  return clamp01(PRICE_ZERO_SCORE_RATIO - estPrice / reference);
}
