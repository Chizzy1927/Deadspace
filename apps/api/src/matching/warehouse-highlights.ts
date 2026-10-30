// Deterministic storage-match highlights: a short, rule-derived summary of what stands out about a
// feasible warehouse match. Pure: computed from the metrics, never from the score. Presentation
// only, so they never affect ranking. Thresholds: STORAGE_HIGHLIGHT_THRESHOLDS in ./config.ts,
// compared with unrounded values; distance text is qualitative for the same reason as trucks.
import { MAX_MATCH_HIGHLIGHTS, type StorageMatchHighlight, type StorageMatchMetrics } from '@deadspace/shared';
import { STORAGE_HIGHLIGHT_THRESHOLDS as T } from './config.js';
import { percent, usd } from './format.js';

/** Inputs to the highlight rules. */
export interface StorageHighlightFacts {
  metrics: StorageMatchMetrics;
  /** Unrounded est. distance (metrics.estDistanceMiles is rounded to 0.1). */
  estDistanceMiles: number;
  /** The shipper's search radius (est. miles). */
  maxDistanceMiles: number;
  /** Feasible candidates the price median was taken over. */
  feasibleMatches: number;
}

type Code = StorageMatchHighlight['code'];
const positive = (code: Code, text: string): StorageMatchHighlight => ({ code, tone: 'positive', text });
const caution = (code: Code, text: string): StorageMatchHighlight => ({ code, tone: 'caution', text });

/** NEARBY up to 10 est. mi; otherwise NEAR_EDGE_OF_RADIUS from 90% of the shipper's radius. */
function locationHighlight(distance: number, radius: number): StorageMatchHighlight | null {
  if (distance <= T.nearbyMaxMiles) return positive('NEARBY', 'Close to your location');
  if (distance >= T.nearEdgeOfRadiusShare * radius)
    return caution('NEAR_EDGE_OF_RADIUS', 'Near the edge of your search radius');
  return null;
}

/** Same rules as truck price highlights, on the est. total cost. */
function priceHighlight(metrics: StorageMatchMetrics, feasibleMatches: number): StorageMatchHighlight | null {
  const { estTotalCost, priceReference } = metrics;
  const isBelow = estTotalCost <= T.belowReferenceRatio * priceReference.amount;
  if (priceReference.basis === 'BUDGET') {
    if (estTotalCost > priceReference.amount) {
      const over = Math.round((estTotalCost - priceReference.amount) * 100) / 100;
      return caution('OVER_BUDGET', `Est. ${usd(over)} over your budget`);
    }
    const under = 1 - estTotalCost / priceReference.amount;
    return isBelow ? positive('UNDER_BUDGET', `Est. ${percent(under)} under your budget`) : null;
  }
  if (isBelow && feasibleMatches >= T.minMatchesForMedian) {
    return positive('BELOW_TYPICAL_PRICE', 'Below typical match price');
  }
  return null;
}

/** NO_ROOM_TO_EXTEND when availability ends on the move-out day; ROOM_TO_EXTEND from the full-credit days. */
function extensionHighlight(daysAfterEnd: number): StorageMatchHighlight | null {
  if (daysAfterEnd === 0) return caution('NO_ROOM_TO_EXTEND', 'Availability ends on your move-out day');
  if (daysAfterEnd >= T.roomToExtendMinDays) return positive('ROOM_TO_EXTEND', 'Room to extend your stay');
  return null;
}

/**
 * Up to MAX_MATCH_HIGHLIGHTS highlights: cautions first, then positives; within each tone the
 * order is location, price, room to extend.
 */
export function storageHighlights(facts: StorageHighlightFacts): StorageMatchHighlight[] {
  const all = [
    locationHighlight(facts.estDistanceMiles, facts.maxDistanceMiles),
    priceHighlight(facts.metrics, facts.feasibleMatches),
    extensionHighlight(facts.metrics.daysAfterEnd),
  ].filter((h): h is StorageMatchHighlight => h !== null);
  return [...all.filter((h) => h.tone === 'caution'), ...all.filter((h) => h.tone === 'positive')].slice(
    0,
    MAX_MATCH_HIGHLIGHTS,
  );
}
