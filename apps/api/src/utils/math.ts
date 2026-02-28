const USDC_DECIMALS = 6;
const PRICE_DECIMALS = 18;
const BPS_BASE = 10000;

/** Parse a human-readable USDC string to 6-decimal bigint-style number */
export function parseUSDC(amount: string): bigint {
  const parts = amount.split(".");
  const whole = parts[0] || "0";
  let frac = (parts[1] || "").slice(0, USDC_DECIMALS).padEnd(USDC_DECIMALS, "0");
  return BigInt(whole) * BigInt(10 ** USDC_DECIMALS) + BigInt(frac);
}

/** Format a 6-decimal USDC bigint to human-readable string */
export function formatUSDC(amount: bigint): string {
  const str = amount.toString().padStart(USDC_DECIMALS + 1, "0");
  const whole = str.slice(0, str.length - USDC_DECIMALS);
  const frac = str.slice(str.length - USDC_DECIMALS);
  return `${whole}.${frac}`;
}

/** Parse a number USDC amount to bigint (6 dec) */
export function numberToUSDC(n: number): bigint {
  return BigInt(Math.round(n * 10 ** USDC_DECIMALS));
}

/** Convert 6-decimal USDC bigint to number */
export function usdcToNumber(amount: bigint): number {
  return Number(amount) / 10 ** USDC_DECIMALS;
}

/**
 * collateralValueUSDC (6 dec) = collateralAmount (18 dec) * oraclePrice (18 dec) / 1e30
 *
 * Example: 100 units * $100 price
 *   = (100 * 1e18) * (100 * 1e18) / 1e30
 *   = 10000 * 1e36 / 1e30
 *   = 10000 * 1e6  ← correct: $10,000 in 6-decimal USDC
 */
export function computeCollateralValueUSDC(
  collateralAmount: bigint,
  oraclePrice: bigint
): bigint {
  return (collateralAmount * oraclePrice) / BigInt(10 ** 30);
}

/**
 * maxBorrowUSDC (6 dec) = collateralValueUSDC (6 dec) * ltvBps / 10000
 */
export function computeMaxBorrow(
  collateralValueUSDC: bigint,
  ltvBps: number
): bigint {
  return (collateralValueUSDC * BigInt(ltvBps)) / BigInt(BPS_BASE);
}

/**
 * healthFactor = maxBorrowUSDC / max(debtUSDC, 1)
 * Returns as a number (e.g., 1.5)
 */
export function computeHealthFactor(
  maxBorrowUSDC: bigint,
  debtUSDC: bigint
): number {
  if (debtUSDC <= 0n) return 999.0;
  return Number(maxBorrowUSDC) / Number(debtUSDC > 0n ? debtUSDC : 1n);
}

/** Convert BPS to ratio number (14000 -> 1.4) */
export function bpsToRatio(bps: number): number {
  return bps / BPS_BASE;
}

/**
 * Convert 18-decimal collateral bigint to human-readable units number.
 * e.g. 100000000000000000000n → 100.0
 */
export function collateralToUnits(collateralAmount: bigint): number {
  return Number(collateralAmount) / 1e18;
}

/**
 * Compute percent change from old to new price.
 */
export function computeChangePct(oldPrice: number, newPrice: number): number {
  if (oldPrice === 0) return 0;
  return ((newPrice - oldPrice) / oldPrice) * 100;
}

export { USDC_DECIMALS, PRICE_DECIMALS, BPS_BASE };