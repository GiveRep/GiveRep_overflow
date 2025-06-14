import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number with commas for thousands
 * @param num Number to format
 * @param maximumFractionDigits Maximum number of decimal places
 * @returns Formatted number string
 */
export function formatNumber(num: number, maximumFractionDigits: number = 0): string {
  if (num === null || num === undefined) return '0';
  
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(num);
}

/**
 * Format a number as currency
 * @param num Number to format as currency
 * @returns Formatted currency string
 */
export function formatCurrency(num: number): string {
  if (num === null || num === undefined) return '$0.00';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}
