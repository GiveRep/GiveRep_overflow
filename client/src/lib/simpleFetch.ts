/**
 * Simple fetch wrapper to replace the problematic retry system
 */
export async function simpleFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  return response;
}

export async function simplePost(url: string, data?: any): Promise<Response> {
  return simpleFetch(url, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function simpleGet(url: string): Promise<Response> {
  return simpleFetch(url, {
    method: 'GET',
  });
}