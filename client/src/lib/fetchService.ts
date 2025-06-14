/**
 * Enhanced fetch service with retry functionality for rate limiting (429) errors
 */

// Configuration for retry logic
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  statusCodesToRetry: [429] // Only retry on 429 (Too Many Requests) by default
};

/**
 * Custom error class for fetch errors that includes the response status
 */
export class FetchError extends Error {
  status: number;
  statusText: string;
  responseText: string;

  constructor(message: string, status: number, statusText: string, responseText: string) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.statusText = statusText;
    this.responseText = responseText;
  }
}

/**
 * Delay execution for the specified number of milliseconds
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Enhanced fetch function with retry logic for rate limit errors
 * 
 * @param url The URL to fetch
 * @param options Fetch options (same as the native fetch API)
 * @param retryOptions Custom retry configuration (optional)
 * @returns Promise with the fetch response
 */
export async function fetchWithRetry(
  url: string, 
  options: RequestInit = {}, 
  retryOptions = RETRY_CONFIG
): Promise<Response> {
  const { maxRetries, retryDelay, statusCodesToRetry } = { ...RETRY_CONFIG, ...retryOptions };
  
  let lastError: FetchError | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // If response is OK or it's not a status code we want to retry, return the response
      if (response.ok || !statusCodesToRetry.includes(response.status)) {
        return response;
      }
      
      // For status codes we want to retry (e.g., 429), prepare for retry
      const responseText = await response.text();
      
      // Log the rate limit hit to console
      if (response.status === 429) {
        console.warn(`Rate limit hit (429) on attempt ${attempt + 1}/${maxRetries + 1}. Retrying in ${retryDelay}ms...`);
      }
      
      // Store the error for potential re-throw if we run out of retries
      lastError = new FetchError(
        `Request failed with status ${response.status}`,
        response.status,
        response.statusText,
        responseText
      );
      
      // If we haven't reached max retries, wait before trying again
      if (attempt < maxRetries) {
        await delay(retryDelay);
      }
    } catch (error) {
      // For network errors or other exceptions
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Fetch error on attempt ${attempt + 1}/${maxRetries + 1}: ${errorMessage}`);
      
      lastError = new FetchError(
        `Fetch error: ${errorMessage}`,
        0, // No status code for network errors
        'Network Error',
        errorMessage
      );
      
      // If we haven't reached max retries, wait before trying again
      if (attempt < maxRetries) {
        await delay(retryDelay);
      }
    }
  }
  
  // If we've exhausted all retries, throw the last error
  if (lastError) {
    throw lastError;
  }
  
  // This should never happen as we should either return a successful response or throw an error
  throw new Error('Unexpected state in fetchWithRetry');
}

/**
 * Enhanced API request function with retry logic
 * Drop-in replacement for the original apiRequest function
 */
export async function apiRequestWithRetry(
  url: string,
  method: string = "GET",
  data?: unknown | undefined,
): Promise<Response> {
  const response = await fetchWithRetry(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });
  
  // Check if response is not ok (status outside 200-299 range)
  if (!response.ok) {
    const text = await response.text();
    throw new FetchError(
      `${response.status}: ${text || response.statusText}`,
      response.status,
      response.statusText,
      text
    );
  }
  
  return response;
}

/**
 * Creates a query function for React Query with retry logic for rate limits
 */
export function createRetryQueryFn<T>(options: { on401: 'returnNull' | 'throw' }): (context: { queryKey: readonly unknown[]; signal?: AbortSignal; meta?: Record<string, unknown> | undefined }) => Promise<T | null> {
  return async (context) => {
    const url = context.queryKey[0] as string;
    
    const fetchOptions: RequestInit = {
      credentials: "include",
    };
    
    // If we have an abort signal, pass it along
    if (context.signal) {
      fetchOptions.signal = context.signal;
    }
    
    const response = await fetchWithRetry(url, fetchOptions);
    
    // Handle 401 unauthorized according to options
    if (options.on401 === 'returnNull' && response.status === 401) {
      return null;
    }
    
    // Check if response is not ok (after handling 401 special case)
    if (!response.ok) {
      const text = await response.text();
      throw new FetchError(
        `${response.status}: ${text || response.statusText}`,
        response.status,
        response.statusText,
        text
      );
    }
    
    return await response.json() as T;
  };
}