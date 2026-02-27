/**
 * USDC utility constants and helpers.
 * USDC always has 6 decimals.
 */

export const USDC_DECIMALS = 6;
export const USDC_UNIT = BigInt(10 ** USDC_DECIMALS); // 1_000_000

export function parseUSDC(humanReadable: string): bigint {
  const parts = humanReadable.split(".");
  const whole = BigInt(parts[0] || "0");
  let fracStr = (parts[1] || "").slice(0, USDC_DECIMALS).padEnd(USDC_DECIMALS, "0");
  return whole * USDC_UNIT + BigInt(fracStr);
}

export function formatUSDC(amount: bigint): string {
  const isNeg = amount < 0n;
  const abs = isNeg ? -amount : amount;
  const str = abs.toString().padStart(USDC_DECIMALS + 1, "0");
  const whole = str.slice(0, str.length - USDC_DECIMALS);
  const frac = str.slice(str.length - USDC_DECIMALS);
  return `${isNeg ? "-" : ""}${whole}.${frac}`;
}

export function usdcToNumber(amount: bigint): number {
  return Number(amount) / Number(USDC_UNIT);
}

export function numberToUSDC(n: number): bigint {
  return BigInt(Math.round(n * Number(USDC_UNIT)));
}
