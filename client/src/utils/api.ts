import { FetchError } from '@/lib/fetchService';
import { toast } from '@/hooks/use-toast';

/**
 * Simple API client for making requests
 */
export const api = {
  async get(url: string, options?: RequestInit) {
    const response = await fetch(url, {
      ...options,
      method: 'GET',
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }
    
    return response;
  },
  
  async post(url: string, body?: any, options?: RequestInit) {
    const response = await fetch(url, {
      ...options,
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }
    
    return response;
  },
};

/**
 * Detect if an error is related to rate limiting
 */
export function isRateLimitError(error: unknown): boolean {
  // Check for FetchError with 429 status
  if (error instanceof FetchError && error.status === 429) {
    return true;
  }
  
  // Check for error message containing rate limit keywords
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('429') || 
           message.includes('rate limit') || 
           message.includes('too many requests');
  }
  
  // Generic object with status check
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as any).status === 429;
  }
  
  return false;
}

/**
 * Get a user-friendly error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  if (isRateLimitError(error)) {
    return "We're experiencing high demand on our Twitter API. Please wait a moment and try again.";
  }
  
  if (error instanceof FetchError) {
    return error.responseText || error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unknown error occurred';
}

/**
 * Handle API errors with standardized toast messages
 */
export function handleApiError(error: unknown): void {
  if (isRateLimitError(error)) {
    toast({
      title: "Rate Limit Reached",
      description: "We're experiencing high demand on our Twitter API. Please wait a moment and try again.",
      variant: "destructive",
    });
    return;
  }
  
  toast({
    title: "Error",
    description: getErrorMessage(error),
    variant: "destructive",
  });
}

/**
 * Fetch data with automatic retry logic for rate limits
 */
export async function getWithRetry<T>(
  url: string, 
  options: RequestInit = {}
): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      credentials: "include", // Always include credentials
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        throw new FetchError(
          "Rate limit reached",
          429,
          "Too Many Requests",
          "Twitter API rate limit reached. Please try again in a moment."
        );
      }
      
      throw new FetchError(
        `Request failed with status ${response.status}`,
        response.status,
        response.statusText,
        await response.text()
      );
    }
    
    return await response.json() as T;
  } catch (error) {
    // Handle and rethrow the error
    if (isRateLimitError(error)) {
      console.warn('Rate limit error detected:', error);
    } else {
      console.error('API request failed:', error);
    }
    throw error;
  }
}

/**
 * Create standard headers for admin API calls using Bearer authentication
 * 🌟 UNIFIED ADMIN AUTH: Uses Authorization Bearer header (preferred method)
 */
export function createAdminHeaders(adminPassword: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${adminPassword}`,
  };
}

/**
 * Make admin API call with Bearer header authentication
 * 🌟 PREFERRED METHOD: Use this for all admin API calls
 */
export async function adminApiCall<T>(
  url: string,
  adminPassword: string,
  options: Omit<RequestInit, 'headers'> & { 
    headers?: Record<string, string>;
    body?: any;
  } = {}
): Promise<T> {
  const { headers = {}, body, ...restOptions } = options;
  
  const requestOptions: RequestInit = {
    ...restOptions,
    headers: {
      ...createAdminHeaders(adminPassword),
      ...headers, // Allow override of headers if needed
    },
    credentials: "include",
  };

  // Handle JSON body serialization
  if (body !== undefined) {
    if (typeof body === 'object' && body !== null) {
      requestOptions.body = JSON.stringify(body);
    } else {
      requestOptions.body = body;
    }
  }

  try {
    const response = await fetch(url, requestOptions);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new FetchError(
        `Admin API request failed: ${response.status} ${response.statusText}`,
        response.status,
        response.statusText,
        errorText
      );
    }
    
    // Handle responses that may not be JSON (like CSV downloads)
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json() as T;
    } else {
      return response as unknown as T;
    }
  } catch (error) {
    console.error('Admin API call failed:', { url, error });
    throw error;
  }
}

/**
 * Make admin GET request with Bearer header authentication
 */
export async function adminGet<T>(
  url: string, 
  adminPassword: string,
  options: Omit<RequestInit, 'method' | 'headers'> & { 
    headers?: Record<string, string> 
  } = {}
): Promise<T> {
  return adminApiCall<T>(url, adminPassword, { 
    ...options, 
    method: 'GET' 
  });
}

/**
 * Make admin POST request with Bearer header authentication
 */
export async function adminPost<T>(
  url: string,
  adminPassword: string, 
  body?: any,
  options: Omit<RequestInit, 'method' | 'headers' | 'body'> & { 
    headers?: Record<string, string> 
  } = {}
): Promise<T> {
  return adminApiCall<T>(url, adminPassword, { 
    ...options, 
    method: 'POST',
    body 
  });
}

/**
 * Make admin PUT request with Bearer header authentication
 */
export async function adminPut<T>(
  url: string,
  adminPassword: string,
  body?: any, 
  options: Omit<RequestInit, 'method' | 'headers' | 'body'> & { 
    headers?: Record<string, string> 
  } = {}
): Promise<T> {
  return adminApiCall<T>(url, adminPassword, { 
    ...options, 
    method: 'PUT',
    body 
  });
}

/**
 * Make admin DELETE request with Bearer header authentication
 */
export async function adminDelete<T>(
  url: string,
  adminPassword: string,
  body?: any,
  options: Omit<RequestInit, 'method' | 'headers' | 'body'> & { 
    headers?: Record<string, string> 
  } = {}
): Promise<T> {
  return adminApiCall<T>(url, adminPassword, { 
    ...options, 
    method: 'DELETE',
    body 
  });
}

/**
 * Make admin PATCH request with Bearer header authentication
 */
export async function adminPatch<T>(
  url: string,
  adminPassword: string,
  body?: any,
  options: Omit<RequestInit, 'method' | 'headers' | 'body'> & { 
    headers?: Record<string, string> 
  } = {}
): Promise<T> {
  return adminApiCall<T>(url, adminPassword, { 
    ...options, 
    method: 'PATCH',
    body 
  });
}