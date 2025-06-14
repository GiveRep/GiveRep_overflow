import { MIST_PER_SUI } from "@mysten/sui/utils";

/**
 * Format a number with commas as thousands separators
 * @param value Number to format
 * @param decimals Number of decimal places to show (default: 0)
 * @returns Formatted number string
 */
export function formatNumber(value: number | string | undefined | null, decimals = 0): string {
  if (value === undefined || value === null) {
    return '0';
  }
  
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num)) {
    return '0';
  }
  
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Format a dollar amount with $ symbol and commas
 * @param value Dollar amount to format
 * @param decimals Number of decimal places to show (default: 2)
 * @returns Formatted dollar amount string
 */
export function formatDollars(value: number | string | undefined | null, decimals = 2): string {
  if (value === undefined || value === null) {
    return '$0.00';
  }
  
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num)) {
    return '$0.00';
  }

  return `$${formatNumber(num, decimals)}`;
}

/**
 * Format a percentage with % symbol
 * @param value Percentage value to format
 * @param decimals Number of decimal places to show (default: 2)
 * @returns Formatted percentage string
 */
export function formatPercent(value: number | string | undefined | null, decimals = 2): string {
  if (value === undefined || value === null) {
    return '0%';
  }
  
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num)) {
    return '0%';
  }

  return `${formatNumber(num, decimals)}%`;
}

export const formatMistToSui = (mist: bigint | number | undefined): string => {
	if (!mist) return '0.00';

	const mistBigInt = BigInt(mist);
	const suiValue = Number(mistBigInt) / Number(MIST_PER_SUI);

	return suiValue.toFixed(2);
};

export const formatMistToSuiCompact = (mist: bigint | number | undefined): string => {
	if (!mist) return '0.0';

	const mistBigInt = BigInt(mist);
	const suiValue = Number(mistBigInt) / Number(MIST_PER_SUI);

	return suiValue.toFixed(1);
};

/**
 * Format a number with K/M/B suffixes for compact display
 * @param value Number to format
 * @param decimals Number of decimal places to show (default: 1 for K, 2 for M/B)
 * @returns Formatted compact number string
 */
export function formatCompactNumber(value: number | string | undefined | null): string {
  if (value === undefined || value === null) {
    return '0';
  }
  
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  // Handle invalid numbers
  if (!isFinite(num) || isNaN(num)) {
    return '0';
  }
  
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(2) + 'B';
  } else if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  
  return num.toString();
}
