import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiRequestWithRetry, createRetryQueryFn, FetchError } from "./fetchService";
import { handleQueryError, handleMutationError } from '@/utils/errorHandler';

// Keep the original function for backwards compatibility
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Original function kept for backward compatibility but delegates to the retry version
export async function apiRequest(
  url: string,
  method: string = "GET",
  data?: unknown | undefined,
): Promise<Response> {
  // Use the enhanced version with retry logic
  return apiRequestWithRetry(url, method, data);
}

type UnauthorizedBehavior = "returnNull" | "throw";

// Create query function with retry capability
export const getQueryFn = <T>(options: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> => {
  // Type assertion to ensure compatibility with QueryFunction
  const queryFn = createRetryQueryFn<T>(options);
  return queryFn as QueryFunction<T>;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
      // By default, only cache successful responses in memory but don't persist them
      // This helps ensure we don't cache stale data for critical endpoints like memberships
      cacheTime: 1000 * 60 * 5, // 5 minutes
    },
    mutations: {
      retry: false,
    },
  },
});

// Set up global error handlers
queryClient.setDefaultOptions({
  queries: {
    onError: (error) => {
      handleQueryError(error);
    }
  },
  mutations: {
    onError: (error) => {
      handleMutationError(error);
    }
  }
});
