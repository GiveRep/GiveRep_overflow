/**
 * Twitter user info utility for client-side
 * 
 * This utility provides a consistent way to fetch Twitter user information
 * with caching to reduce API calls. It handles the backward compatibility
 * with the old direct Twitter API approach.
 */

// Import the fetchWithRetry utility used to make API calls with retry logic
import { fetchWithRetry, FetchError } from '../lib/fetchService';

export interface TwitterUserInfo {
  handle: string;
  username?: string;
  display_name?: string;
  profile_image_url?: string;
  profile_url?: string;
  banner_url?: string;
  follower_count?: number;
  following_count?: number;
  tweet_count?: number;
  created_at?: Date;
  description?: string;
  location?: string;
  is_verified?: boolean;
  is_blue_verified?: boolean;
  creator_score?: number; // Global creator score from twitter_user_info table
  relevance_score?: number; // Project-specific relevance score
  categories?: string[]; // User behavior categories (FARMER, CREATOR, etc.)
  trusted_follower_count?: number; // Number of trusted followers from trust_users table
}

export interface LegacyTwitterUserInfo {
  screen_name: string;
  name: string;
  profile_image_url_https?: string;
  profile_banner_url?: string;
  followers_count?: number;
  following_count?: number;
  statuses_count?: number;
  created_at?: Date;
  description?: string;
  location?: string;
  verified?: boolean;
  is_blue_verified?: boolean;
}

// In-memory cache for API responses to prevent duplicate requests
// within the same page session
const userInfoCache = new Map<string, TwitterUserInfo>();

/**
 * Convert legacy Twitter user info format to new format
 */
function convertLegacyFormat(legacyInfo: LegacyTwitterUserInfo): TwitterUserInfo {
  return {
    handle: legacyInfo.screen_name.toLowerCase(),
    username: legacyInfo.screen_name,
    display_name: legacyInfo.name,
    profile_image_url: legacyInfo.profile_image_url_https,
    profile_url: `https://twitter.com/${legacyInfo.screen_name}`,
    banner_url: legacyInfo.profile_banner_url,
    follower_count: legacyInfo.followers_count,
    following_count: legacyInfo.following_count,
    tweet_count: legacyInfo.statuses_count,
    created_at: legacyInfo.created_at,
    description: legacyInfo.description,
    location: legacyInfo.location,
    is_verified: legacyInfo.verified,
    is_blue_verified: legacyInfo.is_blue_verified,
    creator_score: 0, // Default to 0 for legacy data
  };
}

/**
 * Fetch Twitter user info for a specific handle
 * Uses the new cached endpoint with fallback to legacy endpoint
 * 
 * @param handle Twitter handle (with or without @ symbol)
 * @param projectId Optional project ID to get project-specific creator score
 * @returns TwitterUserInfo object or null
 */
export async function getTwitterUserInfo(handle: string, projectId?: number): Promise<TwitterUserInfo | null> {
  if (!handle) {
    console.warn('getTwitterUserInfo: No handle provided');
    return null;
  }

  // Normalize the handle
  const normalizedHandle = handle.replace('@', '').toLowerCase();
  
  // Create cache key that includes projectId if provided
  const cacheKey = projectId ? `${normalizedHandle}:${projectId}` : normalizedHandle;
  
  // Check in-memory cache first
  if (userInfoCache.has(cacheKey)) {
    return userInfoCache.get(cacheKey) || null;
  }

  try {
    // Try the new cached endpoint first
    try {
      const url = projectId 
        ? `/api/twitter-user-info/${normalizedHandle}?projectId=${projectId}`
        : `/api/twitter-user-info/${normalizedHandle}`;
        
      const response = await fetchWithRetry(url);
      
      if (response.ok) {
        // Parse the JSON response
        const data = await response.json();
        
        // Cache the result with appropriate key
        userInfoCache.set(cacheKey, data);
        return data;
      }
    } catch (error) {
      console.warn(`Failed to fetch Twitter user info from new endpoint for ${normalizedHandle}`, error);
      // Will fall back to legacy endpoint
    }

    // Try legacy endpoint as fallback
    try {
      const legacyResponse = await fetchWithRetry(`/api/giverep/twitter-user-legacy/${normalizedHandle}`);
      
      if (legacyResponse.ok) {
        // Parse the JSON response
        const legacyData = await legacyResponse.json();
        
        // Convert legacy format to new format
        const convertedInfo = convertLegacyFormat(legacyData);
        
        // Cache the result
        userInfoCache.set(normalizedHandle, convertedInfo);
        return convertedInfo;
      }
    } catch (error) {
      console.warn(`Failed to fetch Twitter user info from legacy endpoint for ${normalizedHandle}`, error);
    }

    return null;
  } catch (error) {
    console.error(`Error fetching Twitter user info for ${normalizedHandle}:`, error);
    return null;
  }
}

/**
 * Fetch Twitter user info for multiple handles using individual requests
 * 
 * @param handles Array of Twitter handles
 * @param projectId Optional project ID to get project-specific creator scores
 * @returns Map of handle -> TwitterUserInfo
 */
export async function getTwitterUserInfoBatch(handles: string[], projectId?: number): Promise<Map<string, TwitterUserInfo>> {
  const result = new Map<string, TwitterUserInfo>();
  
  if (!handles || handles.length === 0) {
    return result;
  }
  
  // Normalize all handles
  const normalizedHandles = handles.map(h => h.replace('@', '').toLowerCase());
  
  // Create cache keys that include projectId if provided
  const getCacheKey = (handle: string) => projectId ? `${handle}:${projectId}` : handle;
  
  // Filter out handles we already have in cache
  const uncachedHandles = normalizedHandles.filter(h => !userInfoCache.has(getCacheKey(h)));
  
  // Add cached handles to result
  normalizedHandles.forEach(handle => {
    const cacheKey = getCacheKey(handle);
    if (userInfoCache.has(cacheKey)) {
      const info = userInfoCache.get(cacheKey);
      if (info) {
        result.set(handle, info);
      }
    }
  });
  
  // If we have uncached handles, fetch them individually in parallel
  if (uncachedHandles.length > 0) {
    try {
      // Create an array of promises for each handle
      const fetchPromises = uncachedHandles.map(async (handle) => {
        try {
          // Use GET request with fetchWithRetry for better caching via Cloudflare
          const url = projectId 
            ? `/api/twitter-user-info/${handle}?projectId=${projectId}`
            : `/api/twitter-user-info/${handle}`;
            
          const response = await fetchWithRetry(url);
          
          if (response.ok) {
            const info = await response.json();
            if (info && info.handle) {
              const normalizedHandle = info.handle.toLowerCase();
              const cacheKey = getCacheKey(normalizedHandle);
              userInfoCache.set(cacheKey, info);
              result.set(normalizedHandle, info);
            }
            return info;
          }
        } catch (error) {
          console.warn(`Error fetching info for handle ${handle}:`, error);
        }
        return null;
      });
      
      // Execute all promises in parallel
      await Promise.all(fetchPromises);
    } catch (error) {
      console.error('Error fetching Twitter user info batch:', error);
    }
  }
  
  return result;
}

/**
 * Clear the in-memory cache for Twitter user info
 * Useful when you want to force a refresh of data
 * 
 * @param handle Optional specific handle to clear from cache (clears all if not provided)
 */
export function clearTwitterUserInfoCache(handle?: string) {
  if (handle) {
    const normalizedHandle = handle.replace('@', '').toLowerCase();
    userInfoCache.delete(normalizedHandle);
  } else {
    userInfoCache.clear();
  }
}