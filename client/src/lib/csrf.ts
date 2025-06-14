/**
 * CSRF PROTECTION HAS BEEN REMOVED
 * 
 * This file replaces the original CSRF utility with standard fetch functionality.
 * The API is maintained for compatibility but all CSRF-related functionality is removed.
 */

/**
 * Standard fetch wrapper that includes credentials
 * @param url URL to fetch
 * @param options Fetch options
 * @returns Response from fetch
 */
const secureFetch = (url: string, options: RequestInit = {}): Promise<Response> => {
  return fetch(url, {
    ...options,
    credentials: 'same-origin' // Always include cookies
  });
};

/**
 * Export replacement functions that maintain the original API
 * but don't perform any CSRF-related operations
 */

// These functions are kept for API compatibility but do nothing with CSRF tokens
export const fetchCsrfToken = async (): Promise<string> => '';
export const getCsrfToken = async (): Promise<string> => '';
export const addCsrfHeader = async (headers: HeadersInit = {}): Promise<HeadersInit> => headers;
export const addCsrfToBody = async <T extends Record<string, any>>(body: T): Promise<T> => body;

// csrfFetch is now just a standard fetch with same-origin credentials
export const csrfFetch = secureFetch;

export default {
  fetchCsrfToken,
  getCsrfToken,
  addCsrfHeader,
  addCsrfToBody,
  csrfFetch
};