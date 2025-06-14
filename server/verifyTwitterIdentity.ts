// server/lib/verifyTwitterIdentity.ts
import { Request, Response, Router, NextFunction } from "express";
import { TwitterApi, TwitterApiTokens, UserV2Result } from "twitter-api-v2";
import { getCachedValue, setCachedValue } from "../utils/cache";
import crypto from "crypto";

// Duration for caching successful verifications (2 days in minutes)
const VERIFICATION_CACHE_DURATION = 2880; // 60 * 24 * 2 = 2880 minutes (2 days)

/**
 * Generate a secure hash from twitter tokens for use as a cache key
 * @param accessToken Twitter access token
 * @param accessSecret Twitter access secret
 * @returns Secure hash string
 */
function generateTokenHash(accessToken: string, accessSecret: string): string {
  return crypto
    .createHash("sha256")
    .update(`${accessToken}:${accessSecret}`)
    .digest("hex");
}

/**
 * Verifies that the authenticated Twitter user matches the provided username
 * @param req The Express request object containing cookies
 * @param username The Twitter username to verify
 * @returns An object with success status and optional error message
 */
export async function verifyTwitterIdentity(
  req: Request,
  username: string
): Promise<{
  success: boolean;
  message?: string;
  twitterUser?: UserV2Result;
}> {
  console.log(`[TwitterVerify] Starting verification for username: ${username}`);
  
  // Skip verification if username is empty (avoid unnecessary API calls)
  if (!username) {
    console.log(`[TwitterVerify] No username provided, skipping verification`);
    return {
      success: false,
      message: "Twitter username is required for verification",
    };
  }
  
  const twitterAccessToken = req.cookies["TWITTER_ACCESS_TOKEN"];
  const twitterAccessSecret = req.cookies["TWITTER_ACCESS_SECRET"];

  console.log(`[TwitterVerify] Access token present: ${!!twitterAccessToken}, Access secret present: ${!!twitterAccessSecret}`);

  if (!twitterAccessToken || !twitterAccessSecret) {
    return {
      success: false,
      message:
        "Twitter authentication required. Please login with Twitter first.",
    };
  }

  // Generate token hash for cache key
  const tokenHash = generateTokenHash(twitterAccessToken, twitterAccessSecret);
  const cacheKey = `twitter:verification:${tokenHash}`;

  // OPTIMIZATION: Check cache for existing verified username for these tokens
  const cachedResult = await getCachedValue<{handle: string, userId: string}>(
    cacheKey,
    VERIFICATION_CACHE_DURATION
  );

  const normalizedRequestedUsername = username.toLowerCase();

  // If cached result found, check if the username matches
  if (cachedResult) {
    console.log(`[TwitterVerify] Found cached verification for token hash: ${tokenHash}`);
    const cachedUsername = cachedResult.handle.toLowerCase();
    
    if (cachedUsername === normalizedRequestedUsername) {
      console.log(`[TwitterVerify] Cache hit! User ${username} already verified with these tokens`);
      // Create a dummy Twitter user result with just enough data
      const mockTwitterUser = {
        data: {
          id: cachedResult.userId,
          username: cachedResult.handle,
          name: cachedResult.handle, // Just use handle as name since we don't need it
        }
      } as UserV2Result;
      
      return { 
        success: true, 
        twitterUser: mockTwitterUser,
        message: "Verification from cache"
      };
    } else {
      console.log(`[TwitterVerify] Cache username mismatch - cached: ${cachedUsername}, requested: ${normalizedRequestedUsername}`);
      // Continue with verification as the token is for a different username
    }
  } else {
    console.log(`[TwitterVerify] No cached verification found for token hash: ${tokenHash}`);
  }

  // Verify API keys are set
  if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_API_KEY_SECRET) {
    console.error("[TwitterVerify] Twitter API keys not set in environment variables");
    return {
      success: false,
      message: "Twitter API configuration error. Please contact support.",
    };
  }

  try {
    console.log(`[TwitterVerify] Creating Twitter client and verifying credentials`);
    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_KEY_SECRET,
      accessToken: twitterAccessToken,
      accessSecret: twitterAccessSecret,
    } as TwitterApiTokens);

    console.log(`[TwitterVerify] Fetching user data from Twitter API`);
    const twitterUser = await twitterClient.v2.me();
    console.log(`[TwitterVerify] User data fetched, username: ${twitterUser.data.username}`);

    // Compare lowercased usernames to ensure case-insensitive matching
    const apiUsername = twitterUser.data.username.toLowerCase();
    const requestedUsername = username.toLowerCase();
    console.log(`[TwitterVerify] Comparing usernames - API: ${apiUsername}, Requested: ${requestedUsername}`);

    if (apiUsername !== requestedUsername) {
      console.log(`[TwitterVerify] Username mismatch, verification failed`);
      return {
        success: false,
        message: "You can only perform actions for your own Twitter account",
      };
    }

    // OPTIMIZATION: Cache successful verification
    console.log(`[TwitterVerify] Caching successful verification for ${twitterUser.data.username}`);
    await setCachedValue(
      cacheKey, 
      {
        handle: twitterUser.data.username,
        userId: twitterUser.data.id
      }, 
      VERIFICATION_CACHE_DURATION
    );

    console.log(`[TwitterVerify] Verification successful for user: ${username}`);
    return { success: true, twitterUser };
  } catch (e: any) {
    console.error("[TwitterVerify] Error during Twitter verification:", e);
    let errorMessage = "X (Twitter) verification failed. Please re-login.";
    
    // Add specific message for common error types
    if (e.message && e.message.includes("401")) {
      errorMessage = "Twitter session expired. Please log in again.";
    } else if (e.message && e.message.includes("429")) {
      errorMessage = "Twitter API rate limit exceeded. Please try again later.";
    }
    
    return {
      success: false,
      message: errorMessage
    };
  }
}
