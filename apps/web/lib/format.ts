/**
 * Display scaling for institutional presentation.
 * All raw values are testnet-scale (e.g. $44 debt).
 * Multiply by DISPLAY_SCALE so the UI shows institutional magnitudes ($44M).
 */
export const DISPLAY_SCALE = 1_000_000;

/** Format a raw dollar value as an institutional USD amount (applies 1M scale) */
export function fmtUSD(n: number): string {
  const scaled = n * DISPLAY_SCALE;
  if (scaled >= 1_000_000_000) {
    return `$${(scaled / 1_000_000_000).toFixed(2)}B`;
  }
  if (scaled >= 1_000_000) {
    return `$${(scaled / 1_000_000).toFixed(1)}M`;
  }
  return `$${scaled.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Format a raw USDC value as institutional USDC (applies 1M scale) */
export function fmtUSDC(n: number): string {
  const scaled = n * DISPLAY_SCALE;
  if (scaled >= 1_000_000_000) {
    return `${(scaled / 1_000_000_000).toFixed(2)}B USDC`;
  }
  if (scaled >= 1_000_000) {
    return `${(scaled / 1_000_000).toFixed(1)}M USDC`;
  }
  return `${scaled.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC`;
}

/** Format without scale (for ratios, HF, percentages) */
export function fmtNum(n: number, decimals = 2): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}
