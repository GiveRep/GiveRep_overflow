import fetch, { RequestInit, Response } from 'node-fetch';

const DEFAULT_TIMEOUT = 10000; // 10 seconds
const PRODUCTION_TIMEOUT = 60000; // 60 seconds (1 minute) for production environments

/**
 * Fetch with configurable timeout and environment-aware defaults
 * 
 * @param url URL to fetch from
 * @param options RequestInit options
 * @param timeout Custom timeout in milliseconds (defaults to 10s in dev, 60s in prod)
 * @returns Promise<Response>
 * @throws Error with message "Request timeout" if the request times out
 */
export async function fetchWithTimeout(
  url: string, 
  options: RequestInit = {}, 
  timeout?: number
): Promise<Response> {
  // Determine the timeout to use
  // Use explicit timeout if provided, otherwise use environment-specific default
  const timeoutToUse = timeout || (process.env.NODE_ENV === 'production' 
    ? PRODUCTION_TIMEOUT 
    : DEFAULT_TIMEOUT);
  
  // Create an AbortController to enable timing out the fetch request
  const controller = new AbortController();
  const { signal } = controller;
  
  // Set up the timeout
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutToUse);
  
  try {
    // Add the signal to the fetch options
    const response = await fetch(url, { ...options, signal });
    
    // If we get here, the request completed before the timeout
    clearTimeout(timeoutId);
    
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    // If the error is due to the request being aborted (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutToUse}ms: ${url}`);
    }
    
    // Re-throw other errors
    throw error;
  }
}

/**
 * Fetch JSON with configurable timeout and environment-aware defaults
 * 
 * @param url URL to fetch from
 * @param options RequestInit options
 * @param timeout Custom timeout in milliseconds (defaults to 10s in dev, 60s in prod)
 * @returns Promise<any> The parsed JSON response
 */
export async function fetchJsonWithTimeout(
  url: string, 
  options: RequestInit = {}, 
  timeout?: number
): Promise<any> {
  const response = await fetchWithTimeout(url, options, timeout);
  
  // Parse and return the JSON
  return await response.json();
}