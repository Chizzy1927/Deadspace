// Deterministic match highlights: a short, rule-derived summary of what stands out about a feasible
// match. Pure: computed from the match's metrics, never from the score itself. Presentation only,
// so they never affect ranking. Thresholds: HIGHLIGHT_THRESHOLDS in ./config.ts.
// Thresholds are applied to unrounded values. Route and timing text is qualitative on purpose: a
// rounded number beside the label could appear to contradict it (e.g. 4.96 mi shown as "5 mi" on
// an under-5 ON_ROUTE). The exact est. figures are in the metrics and score breakdown instead.
import { MAX_MATCH_HIGHLIGHTS, type MatchHighlight, type TruckMatchMetrics } from '@deadspace/shared';
import { HIGHLIGHT_THRESHOLDS as T } from './config.js';
import { percent, usd } from './format.js';

/** Inputs to the highlight rules. Mileage and slack are the unrounded values the metrics round. */
export interface HighlightFacts {
  metrics: TruckMatchMetrics;
  /** Unrounded est. additional miles (metrics.estAdditionalMiles is rounded to 0.1). */
  estAdditionalMiles: number;
  /** Unrounded est. schedule slack hours (metrics.estScheduleSlackHours is rounded to 0.1). */
  scheduleSlackHours: number;
  /** Feasible candidates the price median was taken over. */
  feasibleMatches: number;
}

const positive = (code: MatchHighlight['code'], text: string): MatchHighlight => ({ code, tone: 'positive', text });
const caution = (code: MatchHighlight['code'], text: string): MatchHighlight => ({ code, tone: 'caution', text });

/**
 * At most one route highlight: ON_ROUTE below 5, NEAR_ROUTE 5–25 inclusive, LARGE_DETOUR from 60.
 * Between 25 and 60 there is deliberately none.
 */
function routeHighlight(extra: number): MatchHighlight | null {
  if (extra < T.onRouteMaxMiles) return positive('ON_ROUTE', "On the carrier's planned route");
  if (extra <= T.nearRouteMaxMiles) return positive('NEAR_ROUTE', 'Short detour from the planned route');
  if (extra >= T.largeDetourMinMiles) return caution('LARGE_DETOUR', 'Large detour from the planned route');
  return null;
}

/**
 * With a budget, only budget-relative highlights. Without one, a median comparison, and only when
 * there are enough feasible matches for "typical" to mean something.
 */
function priceHighlight(metrics: TruckMatchMetrics, feasibleMatches: number): MatchHighlight | null {
  const { estPrice, priceReference } = metrics;
  const under = 1 - estPrice / priceReference.amount;
  const isBelow = estPrice <= T.belowReferenceRatio * priceReference.amount;
  if (priceReference.basis === 'BUDGET') {
    if (estPrice > priceReference.amount) {
      const over = Math.round((estPrice - priceReference.amount) * 100) / 100;
      return caution('OVER_BUDGET', `Est. ${usd(over)} over your budget`);
    }
    return isBelow ? positive('UNDER_BUDGET', `Est. ${percent(under)} under your budget`) : null;
  }
  // The median itself is shown in the score breakdown, so the chip stays short.
  if (isBelow && feasibleMatches >= T.minMatchesForMedian) {
    return positive('BELOW_TYPICAL_PRICE', 'Below typical match price');
  }
  return null;
}

function capacityHighlight(metrics: TruckMatchMetrics): MatchHighlight | null {
  return metrics.spareCapacityUsed >= T.mostSpareCapacityShare
    ? positive('USES_MOST_SPARE_CAPACITY', "Uses most of this truck's available capacity")
    : null;
}

function timingHighlight(hours: number): MatchHighlight | null {
  if (hours < T.tightSlackHours) return caution('TIGHT_SCHEDULE', 'Tight estimated schedule');
  if (hours >= T.comfortableSlackHours) return positive('COMFORTABLE_SCHEDULE', 'Comfortable estimated schedule');
  return null;
}

/**
 * Up to MAX_MATCH_HIGHLIGHTS highlights: cautions first, then positives; within each tone the
 * order is route, price, capacity, timing.
 */
export function truckHighlights(facts: HighlightFacts): MatchHighlight[] {
  const { metrics } = facts;
  const all = [
    routeHighlight(facts.estAdditionalMiles),
    priceHighlight(metrics, facts.feasibleMatches),
    capacityHighlight(metrics),
    timingHighlight(facts.scheduleSlackHours),
  ].filter((h): h is MatchHighlight => h !== null);
  return [...all.filter((h) => h.tone === 'caution'), ...all.filter((h) => h.tone === 'positive')].slice(
    0,
    MAX_MATCH_HIGHLIGHTS,
  );
}
