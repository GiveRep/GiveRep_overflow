import { FetchError } from '@/lib/fetchService';
import { toast } from '@/hooks/use-toast';

/**
 * Utility to standardize error handling and messages across the application
 * Particularly focused on rate limit errors
 */

/**
 * Get a user-friendly error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  if (isRateLimitError(error)) {
    return "API rate limit reached. Please try again in a moment.";
  }

  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return "An unknown error occurred";
}

/**
 * Detect if an error is related to rate limiting based on error message or status code
 */
export function isRateLimitError(error: unknown): boolean {
  // Check for the specific FetchError type first
  if (error instanceof FetchError) {
    // Check for 429 status code
    if (error.status === 429) {
      return true;
    }
    
    // Check error message for rate limit keywords
    return (
      error.message.toLowerCase().includes('rate limit') ||
      error.message.toLowerCase().includes('too many requests')
    );
  }
  
  // For generic errors, check the message
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('too many requests')
    );
  }
  
  return false;
}

/**
 * Show appropriate toast message based on error type
 */
export function handleApiError(error: unknown, customMessage?: string): void {
  if (isRateLimitError(error)) {
    toast({
      title: "Rate Limit Reached",
      description: "We're experiencing high demand on our Twitter API. Please wait a moment and try again.",
      variant: "destructive",
    });
    return;
  }
  
  // Network error handling
  if (error instanceof Error && error.message.includes('Network Error')) {
    toast({
      title: "Connection Error",
      description: "Please check your internet connection and try again.",
      variant: "destructive",
    });
    return;
  }
  
  // Default/generic error message
  toast({
    title: "Error",
    description: customMessage || (error instanceof Error ? error.message : "An unknown error occurred"),
    variant: "destructive",
  });
}

/**
 * Special handler for query errors (can be used in onError callbacks)
 */
export function handleQueryError(error: unknown): void {
  handleApiError(error);
}

/**
 * Special handler for mutation errors (can be used in onError callbacks)
 */
export function handleMutationError(error: unknown): void {
  handleApiError(error);
}