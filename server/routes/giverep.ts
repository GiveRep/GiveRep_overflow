import { Request, Response, Router } from "express";
import { db } from "@db";
import {
  giverepUsers,
  giverepTweets,
  giverepCollectionLogs,
} from "@db/giverep_schema";
import {
  eq,
  desc,
  and,
  or,
  gte,
  lte,
  sql,
  ilike,
  inArray,
  ne,
} from "drizzle-orm";
import {
  collectGiveRepTweets,
  collectGiveRepTweetsForUser,
  getGiveRepStats,
} from "../services/giverep";
import { getUserEngagementRank, getRankedUsers, updateAllEngagementScores } from "../services/engagement-calculator";
// import { triggerImmediateTradingDataUpdate } from "../services/insidex-scheduler"; // Removed in public version
import { getUserMetrics, queueUserMetricsRefresh } from "../services/user-metrics-aggregator";
import dotenv from "dotenv";
import { verifyTwitterIdentity } from "server/lib/verifyTwitterIdentity";
import { getOrComputeData, clearCacheByPrefix } from "../utils/apiCache";
import { isAdmin } from "../middleware/auth";
import { getRedisValue, setRedisValue, removeRedisValue } from "../utils/redisCache";
import { setCachedValue } from "../utils/cache";
import { withCache, CacheDuration } from "../middleware/redisCacheMiddleware";

// Cache duration configuration (in minutes)
const CACHE_DURATION = {
  'GET /engagement-rank/:handle': 10,       // User engagement rank cache
  'GET /engagement-leaderboard': 15,        // Engagement leaderboard cache
  'GET /content-quality/:handle': 60,       // Content quality cache (1 hour since it's expensive)
  'GET /stats': 30,                         // GiveRep stats cache (reduced from 60 to 30 min since we now have granular caching)
  'GET /top-tweet': 60,                     // Top tweet cache
  'GET /tweets': 60                         // Tweets list cache
};

// Compatibility function - no longer used except for empty references
// since we switched to Twitter auth instead of verification codes
function generateVerificationCode(): string {
  return '';
}

// Load environment variables
dotenv.config();

export const giverepRouter = Router();


// User registration
giverepRouter.post("/users", async (req: Request, res: Response) => {
  try {
    const { twitterHandle, walletAddress, twitterId } = req.body;

    if (!twitterHandle) {
      return res.status(400).json({ error: "Twitter handle is required" });
    }
    
    // Normalize handle
    const normalizedHandle = twitterHandle.toLowerCase();
    
    // OPTIMIZATION: Check if user exists first with a fast DB query before Twitter verification
    // This avoids the Twitter API call if the user already exists
    console.log(`Checking if user already exists: ${normalizedHandle}`);
    const startTime = Date.now();
    
    // Use a single optimized query that checks both twitter_id and twitter_handle
    let existingUser = null;
    if (twitterId) {
      // Use the index we created for faster lookups
      const userRow = await db.execute(sql`
        SELECT * FROM giverep_users 
        WHERE twitter_id = ${twitterId} 
        OR LOWER(twitter_handle) = ${normalizedHandle}
        LIMIT 1
      `);
      
      if (userRow.rows.length > 0) {
        existingUser = userRow.rows[0];
      }
    } else {
      // Just check by handle if no ID provided
      const userRow = await db.execute(sql`
        SELECT * FROM giverep_users 
        WHERE LOWER(twitter_handle) = ${normalizedHandle}
        LIMIT 1
      `);
      
      if (userRow.rows.length > 0) {
        existingUser = userRow.rows[0];
      }
    }
    
    console.log(`User lookup took ${Date.now() - startTime}ms`);
    
    // If user exists and is verified, return 409 immediately without Twitter verification
    if (existingUser && existingUser.is_verified) {
      console.log(`User already exists and is verified: ${normalizedHandle}`);
      return res.status(409).json({
        id: existingUser.id,
        twitter_handle: existingUser.twitter_handle,
        twitter_id: existingUser.twitter_id,
        wallet_address: existingUser.wallet_address,
        is_verified: existingUser.is_verified,
        message: "User already exists and is verified",
      });
    }
    
    // Only do Twitter verification if the user doesn't exist or isn't verified
    console.log(`Performing Twitter verification for: ${normalizedHandle}`);
    const verificationResult = await verifyTwitterIdentity(req, twitterHandle);
    
    // Now update the user if needed - we already have the existing user
    if (existingUser) {
      // We need to update either the handle or the twitter ID
      let needsUpdate = false;
      const updateData: any = {
        updated_at: new Date(),
      };
      
      // Handle case where Twitter ID changed
      if (twitterId && existingUser.twitter_id !== twitterId) {
        console.log(`Updating Twitter ID for user ${normalizedHandle}: ${twitterId}`);
        updateData.twitter_id = twitterId;
        needsUpdate = true;
      }
      
      // Handle case where Twitter handle changed
      if (existingUser.twitter_handle !== normalizedHandle) {
        console.log(`User changed handle from ${existingUser.twitter_handle} to ${normalizedHandle}`);
        updateData.twitter_handle = normalizedHandle;
        needsUpdate = true;
      }
      
      // Handle Twitter verification if it wasn't verified before
      if (!existingUser.is_verified && verificationResult.success) {
        console.log(`Verifying previously unverified user: ${normalizedHandle}`);
        updateData.is_verified = true;
        needsUpdate = true;
      }
      
      // Perform update if needed
      if (needsUpdate) {
        await db
          .update(giverepUsers)
          .set(updateData)
          .where(eq(giverepUsers.id, existingUser.id));
          
        // Refresh the user data for the response
        existingUser = await db.query.giverepUsers.findFirst({
          where: eq(giverepUsers.id, existingUser.id),
        });
      }
    }

    // Handle existing users - this part is already handled in the code above
    // We check if they need updates and if so, we've already applied them
    if (existingUser) {
      // If the user exists but isn't verified yet, handle special verification flow
      if (!existingUser.is_verified) {
        // Return response for unverified users
        return res.status(200).json({
          id: existingUser.id,
          twitter_handle: existingUser.twitter_handle,
          twitter_id: existingUser.twitter_id,
          wallet_address: existingUser.wallet_address,
          verification_code: existingUser.verification_code,
          is_verified: verificationResult.success,
          existingUnverified: !verificationResult.success,
          message:
            "This user has already registered but not verified. Please complete verification.",
        });
      }
      
      // If code reaches here, user exists and is verified
      // This shouldn't normally happen as we already check this condition earlier
      // but keeping as a fallback to ensure proper error handling
      return res.status(409).json({
        id: existingUser.id,
        twitter_handle: existingUser.twitter_handle,
        twitter_id: existingUser.twitter_id,
        wallet_address: existingUser.wallet_address,
        is_verified: existingUser.is_verified,
        message: "User already exists and is verified",
      });
    }

    // Create new user
    const profileUrl = `https://twitter.com/${normalizedHandle}`;

    const insertedUser = await db
      .insert(giverepUsers)
      .values({
        twitter_handle: normalizedHandle,
        twitter_id: twitterId, // Store Twitter ID if provided
        wallet_address: walletAddress,
        is_verified: verificationResult.success,
        profile_url: profileUrl,
        registered_at: new Date(),
        updated_at: new Date(),
      })
      .returning();
    
    // If user is verified, immediately start collecting their tweets
    if (verificationResult.success) {
      try {
        // Import the collectGiveRepTweetsForUser function
        const { collectGiveRepTweetsForUser } = await import("../services/giverep");
        
        // Start the tweet collection in the background (don't await)
        // This allows the registration to complete quickly while tweets are collected
        collectGiveRepTweetsForUser(normalizedHandle)
          .then(result => {
            console.log(`Auto-collection for new user ${normalizedHandle}: ${result.message}`);
          })
          .catch(error => {
            console.error(`Error in auto-collection for new user ${normalizedHandle}:`, error);
          });
        
        console.log(`Started tweet collection for new user: ${normalizedHandle}`);
      } catch (error) {
        // Log error but don't fail the registration
        console.error(`Failed to start tweet collection for new user ${normalizedHandle}:`, error);
      }
    }

    return res.status(201).json({
      ...insertedUser[0],
      message: "User created successfully",
    });
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get all users
giverepRouter.get("/users", async (req: Request, res: Response) => {
  try {
    // Get query params for filtering
    const { verified, order, limit = "100", offset = "0" } = req.query;

    // Convert limit and offset to numbers
    const limitNum = parseInt(limit as string);
    const offsetNum = parseInt(offset as string);

    // Base query
    let query = db.select().from(giverepUsers);

    // Add filters
    if (verified) {
      const isVerified = verified === "true";
      query = query.where(eq(giverepUsers.is_verified, isVerified));
    }

    // Add order by
    if (order === "newest") {
      query = query.orderBy(desc(giverepUsers.registered_at));
    } else {
      query = query.orderBy(desc(giverepUsers.updated_at));
    }

    // Add pagination
    query = query.limit(limitNum).offset(offsetNum);

    // Execute query
    const users = await query;

    return res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get user by ID or handle
giverepRouter.get("/users/:idOrHandle", 
  withCache(CacheDuration.MEDIUM, {
    compress: true,
    keyPrefix: 'giverep:user:',
    serveStaleOnError: true,
    skipCacheIf: (req) => req.query.fresh === 'true' || req.query.bypass === 'true'
  }),
  async (req: Request, res: Response) => {
  try {
    const idOrHandle = req.params.idOrHandle;
    console.log(`Looking up user with ID or handle: "${idOrHandle}"`);
    console.log('Starting user lookup process - debugging issue');

    let user;

    // Check if the string is numeric (avoid hexadecimal conversion for handles like 0xd34th)
    const isNumeric = /^[0-9]+$/.test(idOrHandle);
    const userId = isNumeric ? parseInt(idOrHandle) : NaN;

    if (!isNaN(userId) && isNumeric) {
      // If it's a valid number, search by ID with a single optimized query
      console.log(`Looking up user by ID: ${userId}`);
      
      const userRow = await db.execute(sql`
        SELECT u.*
        FROM giverep_users u
        WHERE u.id = ${userId}
        LIMIT 1
      `);
      
      if (userRow.rows.length > 0) {
        user = userRow.rows[0];
      }
    } else {
      // Otherwise, search by handle
      // Normalize handle (remove @ if present and convert to lowercase)
      const normalizedHandle = (
        idOrHandle.startsWith("@") ? idOrHandle.substring(1) : idOrHandle
      ).toLowerCase();
      console.log(`Looking up user by handle: "${normalizedHandle}"`);

      // Optimized user lookup with multiple approaches for better performance
      // 1. First try exact case match using the existing index
      // 2. If not found, fallback to case-insensitive search
      let userRow;
      
      // Start by checking the Redis cache
      const cacheKey = `user_lookup:${normalizedHandle}`;
      try {
        // Use the Redis cache utility instead of REPLIT_DB_URL
        const cachedData = await getRedisValue<any>(cacheKey, 60); // 60 minute cache
        
        if (cachedData) {
          console.log(`User lookup cache hit for ${normalizedHandle}`);
          userRow = { rows: [cachedData] };
        } else {
          console.log(`User lookup cache miss for ${normalizedHandle}`);
        }
      } catch (cacheErr) {
        console.log(`Cache error for ${normalizedHandle}:`, cacheErr);
      }
      
      if (!userRow) {
        console.log(`Cache miss for ${normalizedHandle}, performing DB lookup`);
        
        // SQL optimization strategy:
        // 1. Using direct functional index match with LOWER(twitter_handle)
        // 2. Limiting tweets subquery to most recent 20 to reduce payload
        // 3. Using prepared statement with parameter binding for security and caching
        console.log(`Using optimized case-insensitive index lookup for ${normalizedHandle}`);
        
        // First try with exact functional index match - much faster than pattern matching
        userRow = await db.execute(sql`
          SELECT u.*
          FROM giverep_users u
          WHERE LOWER(u.twitter_handle) = ${normalizedHandle}
          LIMIT 1
        `);
      }

      // Add to cache if we found a user
      if (userRow && userRow.rows && userRow.rows.length > 0) {
        try {
          // Determine cache time based on user popularity
          const userData = userRow.rows[0];
          // Longer cache for popular accounts (>1000 followers) - 3 hours instead of 1
          const cacheMinutes = userData.follower_count > 1000 ? 180 : 60; // 3 hours or 1 hour
          
          // Import Redis cache utility
          const { setRedisValue } = await import('../utils/redisCache');
          
          // Store in Redis cache with appropriate TTL
          await setRedisValue(cacheKey, userData, cacheMinutes);
          
          console.log(`Cached user ${normalizedHandle} for ${cacheMinutes/60} hours`);
        } catch (cacheErr) {
          console.log(`Error caching user ${normalizedHandle}:`, cacheErr);
        }
        
        // Get user from result
        user = userRow.rows[0];
        
        // Tweets will be fetched separately if needed
      }
    }

    if (!user) {
      // Get the original ID or handle from params for error reporting
      const originalIdOrHandle = req.params.idOrHandle;
      
      // Check if there were recent rate limit errors with Twitter API
      const rateLimitErrorKey = `rate_limit_error:${originalIdOrHandle}`;
      try {
        // Import Redis cache utility
        const { getRedisValue } = await import('../utils/redisCache');
        
        // Check if we recently had a rate limit error with this handle (last 1 minute)
        const recentRateLimit = await getRedisValue<number>(rateLimitErrorKey, 1);
        
        if (recentRateLimit && Date.now() - recentRateLimit < 60000) { // Within last minute
          console.log(`Rate limit error detected for handle: ${originalIdOrHandle}`);
          return res.status(429).json({ 
            error: "Rate limit exceeded", 
            message: "Twitter API rate limit reached. Please try again later." 
          });
        }
      } catch (err) {
        // Ignore errors in rate limit checking
        console.log("Error checking rate limit status:", err);
      }
      
      return res.status(404).json({ error: "User not found" });
    }

    // Cast user to any to handle the raw SQL result 
    // (we already checked that user exists in the previous if block)
    const userData = user as Record<string, any>;
    
    // Fix profile picture URL to use high resolution (remove _normal)
    const highResProfilePicture = userData.profile_picture ? 
      userData.profile_picture.replace('_normal.', '.') : userData.profile_picture;
      
    // Fetch tweets separately only if requested
    let tweets = [];
    const includeTweets = req.query.includeTweets === 'true';
    
    if (includeTweets) {
      try {
        const tweetsResult = await db.execute(sql`
          SELECT * FROM giverep_tweets 
          WHERE user_id = ${userData.id}
          ORDER BY date_posted DESC 
          LIMIT 20
        `);
        tweets = tweetsResult.rows || [];
      } catch (error) {
        console.error("Error fetching tweets:", error);
        tweets = [];
      }
    }
      
    // Skip metrics calculation for basic user lookup
    const includeMetrics = req.query.includeMetrics !== 'false'; // Default true for backward compatibility
    
    // Define default metrics
    const defaultMetrics = {
      tweetCount: tweets.length,
      totalViews: 0,
      totalLikes: 0,
      totalRetweets: 0,
      totalComments: 0
    };
    
    let userMetrics = defaultMetrics;
    
    if (includeMetrics && tweets.length > 0) {
      try {
        // Queue a background refresh of metrics if needed (non-blocking)
        queueUserMetricsRefresh(userData.twitter_handle);
        
        // Get pre-calculated metrics (much faster than calculating at request time)
        userMetrics = await getUserMetrics(userData.id);
      } catch (metricsError) {
        console.error("Error loading user metrics:", metricsError);
        // Continue with default metrics
      }
    }
    
    // Format response for frontend with pre-calculated metrics
    const userResponse = {
      id: userData.id,
      twitterHandle: userData.twitter_handle,
      profileUrl:
        userData.profile_url || `https://twitter.com/${userData.twitter_handle}`,
      followerCount: userData.follower_count || 0,
      isVerified: userData.is_verified,
      walletAddress: userData.wallet_address,
      // Include new Twitter profile fields
      displayName: userData.display_name,
      profilePicture: highResProfilePicture, // Use high resolution version
      coverPicture: userData.cover_picture, // Add cover picture field
      bio: userData.bio,
      location: userData.location,
      accountCreatedAt: userData.account_created_at ? new Date(userData.account_created_at).toISOString() : undefined,
      followingCount: userData.following_count,
      isTwitterVerified: userData.is_twitter_verified,
      isBlueVerified: userData.is_blue_verified,
      tweets: includeTweets ? tweets.map((tweet: any) => ({
        id: tweet.id,
        tweetId: tweet.tweet_id,
        content: tweet.content,
        views: tweet.views || 0,
        likes: tweet.likes || 0,
        retweetCount: tweet.retweet_count || 0,
        commentCount: tweet.comment_count || 0,
        datePosted: new Date(tweet.date_posted).toISOString(),
        isVerificationTweet: tweet.is_verification_tweet || false,
      })) : [],
      // Use pre-calculated metrics instead of calculating on each request
      tweet_count: includeMetrics ? userMetrics.tweetCount : 0,
      total_views: includeMetrics ? userMetrics.totalViews : 0,
      total_likes: includeMetrics ? userMetrics.totalLikes : 0,
      total_retweets: includeMetrics ? userMetrics.totalRetweets : 0,
      total_comments: includeMetrics ? userMetrics.totalComments : 0,
    };

    return res.status(200).json(userResponse);
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Verify a user
giverepRouter.post("/users/verify", async (req: Request, res: Response) => {
  try {
    const { twitterHandle, walletAddress, twitterId } = req.body;

    if (!twitterHandle) {
      return res.status(400).json({ error: "Twitter handle is required" });
    }

    // Verify with Twitter auth
    const verificationResult = await verifyTwitterIdentity(req, twitterHandle);

    if (!verificationResult.success) {
      return res.status(400).json({
        error: "Twitter verification failed. Please authenticate with Twitter."
      });
    }

    // Normalize handle
    const normalizedHandle = twitterHandle.toLowerCase();

    // If Twitter ID is provided, first check if user exists with this ID and different handle
    // This indicates the user changed their handle
    if (twitterId) {
      const existingUserById = await db.query.giverepUsers.findFirst({
        where: eq(giverepUsers.twitter_id, twitterId),
      });

      if (
        existingUserById &&
        existingUserById.twitter_handle !== normalizedHandle
      ) {
        console.log(
          `User with ID ${twitterId} changed handle from ${existingUserById.twitter_handle} to ${normalizedHandle}. Updating...`
        );

        // Update the handle
        await db
          .update(giverepUsers)
          .set({
            twitter_handle: normalizedHandle,
            updated_at: new Date(),
          })
          .where(eq(giverepUsers.id, existingUserById.id));
      }
    }

    // Find or create user
    let user = null;

    // First try to find by Twitter ID if provided
    if (twitterId) {
      user = await db.query.giverepUsers.findFirst({
        where: eq(giverepUsers.twitter_id, twitterId),
      });
    }

    // If not found by ID, try by handle
    if (!user) {
      user = await db.query.giverepUsers.findFirst({
        where: eq(giverepUsers.twitter_handle, normalizedHandle),
      });

      // If found by handle and we have a Twitter ID, update the user's Twitter ID
      if (user && twitterId && !user.twitter_id) {
        console.log(
          `Adding Twitter ID ${twitterId} to verified user ${normalizedHandle}`
        );

        await db
          .update(giverepUsers)
          .set({
            twitter_id: twitterId,
            updated_at: new Date(),
          })
          .where(eq(giverepUsers.id, user.id));

        // Refresh user data
        user = await db.query.giverepUsers.findFirst({
          where: eq(giverepUsers.id, user.id),
        });
      }
    }

    // If user not found, create new one
    if (!user) {
      const profileUrl = `https://twitter.com/${normalizedHandle}`;
      
      const insertedUser = await db
        .insert(giverepUsers)
        .values({
          twitter_handle: normalizedHandle,
          twitter_id: twitterId,
          wallet_address: walletAddress,
          is_verified: true, // Auto-verify with Twitter auth
          profile_url: profileUrl,
          registered_at: new Date(),
          updated_at: new Date(),
        })
        .returning();
        
      user = insertedUser[0];
      
      // Start collecting tweets for the new user in the background
      try {
        // Import the collectGiveRepTweetsForUser function
        const { collectGiveRepTweetsForUser } = await import("../services/giverep");
        
        // Start the tweet collection in the background (don't await)
        // This allows the registration to complete quickly while tweets are collected
        collectGiveRepTweetsForUser(normalizedHandle)
          .then(result => {
            console.log(`Auto-collection for newly verified user ${normalizedHandle}: ${result.message}`);
          })
          .catch(error => {
            console.error(`Error in auto-collection for newly verified user ${normalizedHandle}:`, error);
          });
        
        console.log(`Started tweet collection for newly verified user: ${normalizedHandle}`);
      } catch (error) {
        // Log error but don't fail the verification
        console.error(`Failed to start tweet collection for newly verified user ${normalizedHandle}:`, error);
      }
    } else if (!user.is_verified) {
      // If user exists but isn't verified, mark them as verified
      await db
        .update(giverepUsers)
        .set({ 
          is_verified: true,
          updated_at: new Date()
        })
        .where(eq(giverepUsers.id, user.id));
        
      // Refresh user data
      user = await db.query.giverepUsers.findFirst({
        where: eq(giverepUsers.id, user.id),
      });
      
      // Start collecting tweets for the newly verified user
      try {
        // Import the collectGiveRepTweetsForUser function
        const { collectGiveRepTweetsForUser } = await import("../services/giverep");
        
        // Start the tweet collection in the background (don't await)
        collectGiveRepTweetsForUser(normalizedHandle)
          .then(result => {
            console.log(`Auto-collection for newly verified user ${normalizedHandle}: ${result.message}`);
          })
          .catch(error => {
            console.error(`Error in auto-collection for newly verified user ${normalizedHandle}:`, error);
          });
        
        console.log(`Started tweet collection for newly verified user: ${normalizedHandle}`);
      } catch (error) {
        // Log error but don't fail the verification
        console.error(`Failed to start tweet collection for newly verified user ${normalizedHandle}:`, error);
      }
    }

    return res.status(200).json({
      id: user?.id,
      twitter_handle: user?.twitter_handle,
      twitter_id: user?.twitter_id,
      wallet_address: user?.wallet_address,
      is_verified: user?.is_verified,
      message: "User verified successfully",
    });
  } catch (error) {
    console.error("Error verifying user:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Link wallet to user account
giverepRouter.post(
  "/users/link-wallet",
  async (req: Request, res: Response) => {
    try {
      const { twitterHandle, walletAddress, twitterId } = req.body;

      if (!twitterHandle || !walletAddress) {
        return res
          .status(400)
          .json({ error: "Twitter handle and wallet address are required" });
      }

      // Normalize handle
      const normalizedHandle = twitterHandle.toLowerCase();

      // Find user - first try by Twitter ID if provided
      let user = null;

      if (twitterId) {
        user = await db.query.giverepUsers.findFirst({
          where: eq(giverepUsers.twitter_id, twitterId),
        });

        // If found by ID but handle is different, update handle
        if (user && user.twitter_handle !== normalizedHandle) {
          console.log(
            `Updating Twitter handle from ${user.twitter_handle} to ${normalizedHandle} during wallet linking`
          );

          await db
            .update(giverepUsers)
            .set({
              twitter_handle: normalizedHandle,
              updated_at: new Date(),
            })
            .where(eq(giverepUsers.id, user.id));

          // Refresh user data
          user = await db.query.giverepUsers.findFirst({
            where: eq(giverepUsers.id, user.id),
          });
        }
      }

      // If not found by ID, try by handle
      if (!user) {
        user = await db.query.giverepUsers.findFirst({
          where: eq(giverepUsers.twitter_handle, normalizedHandle),
        });

        // If found by handle and we have Twitter ID but user doesn't have one stored,
        // update the user with the Twitter ID
        if (user && twitterId && !user.twitter_id) {
          console.log(
            `Adding Twitter ID ${twitterId} to user ${normalizedHandle} during wallet linking`
          );

          await db
            .update(giverepUsers)
            .set({
              twitter_id: twitterId,
              updated_at: new Date(),
            })
            .where(eq(giverepUsers.id, user.id));

          // Refresh user data
          user = await db.query.giverepUsers.findFirst({
            where: eq(giverepUsers.id, user.id),
          });
        }
      }

      if (!user) {
        // User doesn't exist, create a new one with the wallet address
        const profileUrl = `https://twitter.com/${normalizedHandle}`;

        const newUser = await db
          .insert(giverepUsers)
          .values({
            twitter_handle: normalizedHandle,
            twitter_id: twitterId, // Store Twitter ID if provided
            wallet_address: walletAddress,
            is_verified: true, // Auto-verify users that link wallets
            profile_url: profileUrl,
            registered_at: new Date(),
            updated_at: new Date(),
          })
          .returning();
        
        // Start collecting tweets for the new user in the background
        try {
          // Import the collectGiveRepTweetsForUser function
          const { collectGiveRepTweetsForUser } = await import("../services/giverep");
          
          // Start the tweet collection in the background (don't await)
          collectGiveRepTweetsForUser(normalizedHandle)
            .then(result => {
              console.log(`Auto-collection for new user with wallet ${normalizedHandle}: ${result.message}`);
            })
            .catch(error => {
              console.error(`Error in auto-collection for new user with wallet ${normalizedHandle}:`, error);
            });
          
          console.log(`Started tweet collection for new user with wallet: ${normalizedHandle}`);
        } catch (error) {
          // Log error but don't fail the wallet linking
          console.error(`Failed to start tweet collection for new user with wallet ${normalizedHandle}:`, error);
        }

        return res.status(201).json({
          id: newUser[0].id,
          twitter_handle: newUser[0].twitter_handle,
          twitter_id: newUser[0].twitter_id,
          wallet_address: newUser[0].wallet_address,
          is_verified: true,
          message: "User created successfully with wallet linked",
        });
      }

      // Check if this wallet is already linked to a different user
      if (user.wallet_address !== walletAddress) {
        const walletLinkedToOtherUser = await db.query.giverepUsers.findFirst({
          where: and(
            eq(giverepUsers.wallet_address, walletAddress),
            ne(giverepUsers.twitter_handle, normalizedHandle)
          ),
        });

        if (walletLinkedToOtherUser) {
          return res.status(409).json({
            error: "This wallet is already linked to another Twitter account",
          });
        }
      }

      // Update existing user with wallet address (either new or changing existing)
      const updatedUser = await db
        .update(giverepUsers)
        .set({
          wallet_address: walletAddress,
          updated_at: new Date(),
        })
        .where(eq(giverepUsers.id, user.id))
        .returning();

      return res.status(200).json({
        id: updatedUser[0].id,
        twitter_handle: updatedUser[0].twitter_handle,
        twitter_id: updatedUser[0].twitter_id,
        wallet_address: updatedUser[0].wallet_address,
        is_verified: updatedUser[0].is_verified,
        message: "Wallet linked successfully",
      });
    } catch (error) {
      console.error("Error linking wallet:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Auto-verify a user without needing verification tweet
giverepRouter.post(
  "/users/auto-verify",
  async (req: Request, res: Response) => {
    try {
      const { twitterHandle, twitterId } = req.body;
      
      console.log(`Auto-verify endpoint called for: ${twitterHandle} (ID: ${twitterId || 'not provided'})`);
      

      if (!twitterHandle) {
        return res.status(400).json({ error: "Twitter handle is required" });
      }

      // Normalize handle
      const normalizedHandle = twitterHandle.toLowerCase();

      // Find user - first try by Twitter ID if provided
      let user = null;

      if (twitterId) {
        user = await db.query.giverepUsers.findFirst({
          where: eq(giverepUsers.twitter_id, twitterId),
        });

        // If found by ID but handle is different, update handle
        if (user && user.twitter_handle !== normalizedHandle) {
          console.log(
            `Updating Twitter handle from ${user.twitter_handle} to ${normalizedHandle} during auto-verify`
          );

          await db
            .update(giverepUsers)
            .set({
              twitter_handle: normalizedHandle,
              updated_at: new Date(),
            })
            .where(eq(giverepUsers.id, user.id));
        }
      }

      // If not found by ID, try by handle
      if (!user) {
        user = await db.query.giverepUsers.findFirst({
          where: eq(giverepUsers.twitter_handle, normalizedHandle),
        });

        // If found by handle and we have Twitter ID but user doesn't, update with ID
        if (user && twitterId && !user.twitter_id) {
          console.log(
            `Adding Twitter ID ${twitterId} to user ${normalizedHandle} during auto-verify`
          );

          await db
            .update(giverepUsers)
            .set({
              twitter_id: twitterId,
              updated_at: new Date(),
            })
            .where(eq(giverepUsers.id, user.id));
        }
      }

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // If already verified, just return success
      if (user.is_verified) {
        return res.status(200).json({
          id: user.id,
          twitter_handle: user.twitter_handle,
          twitter_id: user.twitter_id,
          wallet_address: user.wallet_address,
          is_verified: true,
          message: "User already verified",
        });
      }

      // Update user to verify them
      const updatedUser = await db
        .update(giverepUsers)
        .set({
          is_verified: true,
          updated_at: new Date(),
        })
        .where(eq(giverepUsers.id, user.id))
        .returning();
        
      // Start collecting tweets for the newly verified user
      try {
        // Import the collectGiveRepTweetsForUser function
        const { collectGiveRepTweetsForUser } = await import("../services/giverep");
        
        // Start the tweet collection in the background (don't await)
        collectGiveRepTweetsForUser(normalizedHandle)
          .then(result => {
            console.log(`Auto-collection for newly auto-verified user ${normalizedHandle}: ${result.message}`);
          })
          .catch(error => {
            console.error(`Error in auto-collection for newly auto-verified user ${normalizedHandle}:`, error);
          });
        
        console.log(`Started tweet collection for newly auto-verified user: ${normalizedHandle}`);
      } catch (error) {
        // Log error but don't fail the verification
        console.error(`Failed to start tweet collection for newly auto-verified user ${normalizedHandle}:`, error);
      }

      return res.status(200).json({
        id: updatedUser[0].id,
        twitter_handle: updatedUser[0].twitter_handle,
        twitter_id: updatedUser[0].twitter_id,
        wallet_address: updatedUser[0].wallet_address,
        is_verified: updatedUser[0].is_verified,
        message: "User auto-verified successfully",
      });
    } catch (error) {
      console.error("Error auto-verifying user:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Admin routes

// Tweet collection endpoints removed - not available in public version

// Engagement update endpoints removed - not available in public version

// User tweet collection endpoints removed - not available in public version

// Get user's engagement rank
giverepRouter.get("/engagement-rank/:handle", async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    
    if (!handle) {
      return res.status(400).json({ error: "Twitter handle is required" });
    }

    // Verify user exists before heavy computation (prevent spam with random handles)
    const userExists = await db.query.giverepUsers.findFirst({
      where: sql`LOWER(${giverepUsers.twitter_handle}) = ${handle.toLowerCase()}`,
      columns: {
        id: true,
      },
    });

    // If user doesn't exist in our database, return early
    if (!userExists) {
      // Cache this negative result to prevent future computation for this handle
      const negativeResult = {
        handle,
        rank: null,
        score: null,
        notFound: true,
        lastUpdated: new Date().toISOString()
      };
      
      // We'll still cache this for a short time to prevent repeated lookups
      // But use a shorter cache time for negative results
      await setCachedValue(`/api/giverep/engagement-rank/${handle}`, negativeResult, 5); // 5 minutes cache
      
      return res.status(404).json({ 
        error: "User not found in the system",
        message: "This Twitter handle doesn't exist in our database"
      });
    }
    
    // Use caching for engagement rank with cache duration from config
    const rankResponse = await getOrComputeData(
      req,
      async () => {
        console.log(`Cache miss for engagement rank of ${handle} - computing fresh data...`);
        
        // Get user's rank from the engagement calculator service
        const rankData = await getUserEngagementRank(handle);
        
        if (!rankData) {
          return null; // Will be handled after the cache function
        }
        
        return {
          handle,
          rank: rankData.rank,
          score: rankData.score,
          lastUpdated: new Date().toISOString() // We'll improve this later with actual timestamp
        };
      },
      CACHE_DURATION['GET /engagement-rank/:handle']
    );
    
    if (!rankResponse) {
      return res.status(404).json({ error: "User not found or has no engagement rank" });
    }
    
    return res.status(200).json(rankResponse);
  } catch (error) {
    console.error(`Error getting engagement rank for ${req.params.handle}:`, error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get ranked users sorted by engagement score
giverepRouter.get("/engagement-leaderboard", async (req: Request, res: Response) => {
  try {
    const { 
      limit = "100", 
      offset = "0",
      includeContentQuality = "false"
    } = req.query;
    
    // Use caching for engagement leaderboard with cache duration from config
    const leaderboardData = await getOrComputeData(
      req,
      async () => {
        console.log("Cache miss for engagement leaderboard - computing fresh data...");
        
        // Convert parameters
        const limitNum = parseInt(limit as string);
        const offsetNum = parseInt(offset as string);
        const shouldIncludeContentQuality = (includeContentQuality as string).toLowerCase() === "true";
        
        // Get ranked users with optional content quality analysis
        const users = await getRankedUsers(limitNum, offsetNum, shouldIncludeContentQuality);
        
        // Get the total count separately for pagination info
        const totalCount = await db.query.giverepUsers.findMany({
          where: eq(giverepUsers.is_verified, true),
          columns: {
            id: true
          }
        }).then(results => results.length);
        
        return {
          users: users.map((user, index) => {
            const baseUser = {
              id: user.id,
              handle: user.twitter_handle,
              rank: user.engagement_rank || (offsetNum + index + 1),
              score: user.engagement_score || 0,
              follower_count: user.follower_count || 0,
              profile_url: user.profile_url || `https://twitter.com/${user.twitter_handle}`,
              profile_picture: user.profile_picture,
              is_verified: user.is_verified,
              is_twitter_verified: user.is_twitter_verified,
              is_blue_verified: user.is_blue_verified
            };
            
            // Add content quality data if it was requested and is available
            if (shouldIncludeContentQuality && 'contentQualityScore' in user) {
              return {
                ...baseUser,
                contentQualityScore: (user as any).contentQualityScore,
                contentQuality: (user as any).contentQuality
              };
            }
            
            return baseUser;
          }),
          total: totalCount,
          updated_at: new Date().toISOString(), // We'll improve this later with actual timestamp from database
          nextUpdateTime: "2:00 AM UTC" // Time of daily leaderboard update
        };
      },
      CACHE_DURATION['GET /engagement-leaderboard']
    );
    
    return res.status(200).json(leaderboardData);
  } catch (error) {
    console.error("Error getting engagement leaderboard:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Analyze content quality for a specific user
giverepRouter.get("/content-quality/:handle", async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    const startDateStr = req.query.startDate as string;
    const endDateStr = req.query.endDate as string;
    const forceRefresh = req.query.refresh === 'true';
    
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    
    if (startDateStr) {
      startDate = new Date(startDateStr);
    }
    
    if (endDateStr) {
      endDate = new Date(endDateStr);
    }
    
    // Verify user exists before heavy computation (prevent spam with random handles)
    const userExists = await db.query.giverepUsers.findFirst({
      where: sql`LOWER(${giverepUsers.twitter_handle}) = ${handle.toLowerCase()}`,
      columns: {
        id: true,
      },
    });

    // If user doesn't exist in our database, return early
    if (!userExists) {
      // Cache this negative result to prevent future computation for this handle
      const negativeResult = {
        handle,
        score: 0,
        quality: "unknown",
        notFound: true,
        hasNoTweets: true,
        lastAnalyzed: new Date().toISOString()
      };
      
      // We'll still cache this for a short time to prevent repeated lookups
      // But use a shorter cache time for negative results
      await setCachedValue(`/api/giverep/content-quality/${handle}`, negativeResult, 5); // 5 minutes cache
      
      return res.status(404).json({ 
        error: "User not found in the system",
        message: "This Twitter handle doesn't exist in our database"
      });
    }
    
    // If not forcing a refresh, use caching with a 1-day cache duration
    // This caching only applies if we don't have fresh DB data or if forceRefresh is true
    if (!forceRefresh) {
      // First check the database for recent data (within the last 7 days)
      const existingData = await db.query.giverepUsers.findFirst({
        where: eq(giverepUsers.twitter_handle, handle),
        columns: {
          content_quality_score: true,
          content_quality: true,
          content_quality_last_analyzed: true,
          content_quality_confidence: true,
          content_quality_depth: true,
          content_quality_originality: true,
          content_quality_engagement: true,
          content_quality_educational: true
        }
      });
      
      // If we have relatively recent data (within the last 7 days), return it
      if (existingData?.content_quality_score && 
          existingData?.content_quality &&
          existingData?.content_quality_last_analyzed) {
        
        const lastAnalyzed = new Date(existingData.content_quality_last_analyzed);
        const now = new Date();
        const daysSinceLastAnalysis = Math.floor((now.getTime() - lastAnalyzed.getTime()) / (1000 * 60 * 60 * 24));
        
        // Data is still fresh (less than 7 days old)
        if (daysSinceLastAnalysis < 7) {
          return res.json({
            score: existingData.content_quality_score,
            quality: existingData.content_quality,
            lastAnalyzed: existingData.content_quality_last_analyzed,
            confidence: existingData.content_quality_confidence,
            hasNoTweets: existingData.content_quality_score === 0, // Assuming a score of 0 means no tweets
            characteristics: {
              depth: existingData.content_quality_depth || 0.5,
              originality: existingData.content_quality_originality || 0.5,
              engagementQuality: existingData.content_quality_engagement || 0.5,
              educationalValue: existingData.content_quality_educational || 0.5
            }
          });
        }
      }
    }
    
    // If we don't have fresh DB data or forceRefresh is true, calculate new data with caching
    const contentQuality = await getOrComputeData(
      req,
      async () => {
        console.log(`Cache miss for content quality of ${handle} - computing fresh data...`);
        
        // Import the content analyzer service
        const { analyzeUserContentQuality } = await import('../services/content-analyzer');
        
        // Analyze the user's content quality and save to database
        return await analyzeUserContentQuality(
          handle, 
          startDate,
          endDate,
          true // Always save to database
        );
      },
      forceRefresh ? 0 : CACHE_DURATION['GET /content-quality/:handle'] // 0 min cache (no cache) if forceRefresh
    );
    
    res.json(contentQuality);
  } catch (error) {
    console.error("Error analyzing content quality:", error);
    res.status(500).json({ error: "Failed to analyze content quality" });
  }
});

// Analyze content quality for users who haven't been analyzed or need refresh
giverepRouter.post("/content-analysis", isAdmin, async (req: Request, res: Response) => {
  try {
    // Import the giverep scheduler functions
    const { runContentQualityAnalysis } = await import('../services/giverep-scheduler');
    
    // Run the content analysis process
    await runContentQualityAnalysis();
    
    res.json({ success: true, message: "Content quality analysis initiated" });
  } catch (error) {
    console.error("Error running content quality analysis:", error);
    res.status(500).json({ error: "Failed to run content quality analysis" });
  }
});

// Analyze content quality for ALL verified users (may take some time)
giverepRouter.post("/content-analysis/all", isAdmin, async (req: Request, res: Response) => {
  try {
    // Import necessary modules
    const { db } = await import('@db');
    const { giverepUsers, giverepTweets } = await import('@db/giverep_schema');
    const { eq, isNotNull, and, between, desc } = await import('drizzle-orm');
    const { analyzeUserContentQuality, batchAnalyzeMultipleUsers, batchAnalyzeContentQuality } = await import('../services/content-analyzer');
    const { log } = await import('../vite');
    
    // Return immediately to avoid timeout, but continue processing
    res.json({ 
      success: true, 
      message: "Full content quality analysis initiated for all verified users. This will run in the background and may take some time to complete."
    });
    
    // Get all verified users with follower count
    const users = await db.select({
      id: giverepUsers.id,
      twitter_handle: giverepUsers.twitter_handle,
    })
    .from(giverepUsers)
    .where(
      and(
        eq(giverepUsers.is_verified, true),
        isNotNull(giverepUsers.follower_count)
      )
    );
    
    const totalUsers = users.length;
    log(`Starting content quality analysis for all ${totalUsers} verified users using batch processing`, "content-analysis");
    
    // Process users in batches using the new batch API
    if (totalUsers > 0) {
      // Set date range (current month)
      const startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const endDate = new Date();
      
      // Execute batch analysis
      await batchAnalyzeContentQuality(
        users.map(user => user.twitter_handle),
        startDate,
        endDate
      );
      
      log(`Completed batch content quality analysis for ${totalUsers} verified users`, "content-analysis");
    } else {
      log(`No verified users found for content quality analysis`, "content-analysis");
    }
  } catch (error) {
    console.error("Error running full content quality analysis:", error);
    // Response already sent, so just log the error
  }
});

giverepRouter.get("/stats", async (req: Request, res: Response) => {
  try {
    // Get query params
    const { startDate, endDate, limit, offset, includeTotal, search, sortField, sortDir } = req.query;

    // Parse dates if provided
    let start = startDate ? new Date(startDate as string) : undefined;
    if (start) {
      // Reset to day level, ignoring hours, minutes, seconds
      start = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      if(start){
        req.query.startDate = start.toISOString();
      }
    }
    let end = endDate ? new Date(endDate as string) : undefined;
    if (end) {
      // Reset to day level, ignoring hours, minutes, seconds
      end = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      if(end){
        req.query.endDate = end.toISOString();
      }
    }

    // Parse pagination params
    const limitNum = limit ? parseInt(limit as string, 10) : 100;
    const offsetNum = offset ? parseInt(offset as string, 10) : 0;
    const includeTotalFlag = includeTotal === "true";
    
    // Parse search and sort params
    const searchTerm = search as string;
    const sortFieldParam = sortField as string;
    const sortDirection = (sortDir as string || 'asc') as 'asc' | 'desc';

    // Use a more refined cache key that accounts for all parameters
    // This helps with cache segmentation and more precise cache invalidation
    const searchPart = searchTerm ? `-search_${encodeURIComponent(searchTerm)}` : '';
    const sortPart = sortFieldParam ? `-sort_${sortFieldParam}_${sortDirection}` : '';
    const datePart = `${start?.toISOString().split('T')[0] || 'all'}_to_${end?.toISOString().split('T')[0] || 'now'}`;
    const paginationPart = `-limit_${limitNum}-offset_${offsetNum}${includeTotalFlag ? '-with_total' : ''}`;
    
    const refinedCacheKey = `/giverep/stats-${datePart}${searchPart}${sortPart}${paginationPart}`;
    
    // Add logging for debugging
    console.log(`Getting GiveRep stats with cache key: ${refinedCacheKey}`);
    
    // Use getOrComputeData with our refined cache key
    // Modify req.originalUrl to use our custom cache key instead
    const originalUrl = req.originalUrl;
    req.originalUrl = refinedCacheKey;
    
    const stats = await getOrComputeData(
      req,
      async () => {
        console.log("Cache miss for stats - computing fresh data...");
        console.time('Stats computation');
        // Get stats with search and sort parameters
        const result = await getGiveRepStats(
          start,
          end,
          limitNum,
          offsetNum,
          includeTotalFlag,
          searchTerm,
          sortFieldParam,
          sortDirection
        );
        console.timeEnd('Stats computation');
        return result;
      },
      CACHE_DURATION['GET /stats'] // Use 30-minute cache time from config
    );
    
    // Restore original URL
    req.originalUrl = originalUrl;

    // Set Cache-Control headers to match our Cloudflare caching strategy
    res.set('Cache-Control', 'public, max-age=1800');
    
    return res.status(200).json(stats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get top tweet
giverepRouter.get("/top-tweet", async (req: Request, res: Response) => {
  try {
    // Use caching for top tweet with cache duration from config
    const formattedTweet = await getOrComputeData(
      req,
      async () => {
        console.log("Cache miss for top tweet - computing fresh data...");
        
        // Get today's date (start of day)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        console.log(`Looking for top tweet since ${today.toISOString()}`);

        // First try to find today's top tweet by engagement (views + likes + retweets)
        let topTweet = await db.query.giverepTweets.findFirst({
          where: gte(giverepTweets.date_posted, today),
          orderBy: [
            desc(
              sql`(${giverepTweets.views} + ${giverepTweets.likes} + ${giverepTweets.retweet_count})`
            ),
          ],
          with: {
            user: true,
          },
        });

        // If no tweets found today, get the latest tweet with highest engagement
        if (!topTweet) {
          console.log(
            "No tweets found today, getting latest tweet with highest engagement"
          );
          topTweet = await db.query.giverepTweets.findFirst({
            orderBy: [
              desc(giverepTweets.date_posted),
              desc(
                sql`(${giverepTweets.views} + ${giverepTweets.likes} + ${giverepTweets.retweet_count})`
              ),
            ],
            with: {
              user: true,
            },
          });
        }

        if (!topTweet) {
          return null; // Will be handled after the cache function
        }

        // Format for frontend
        return {
          id: topTweet.id,
          tweetId: topTweet.tweet_id,
          content: topTweet.content,
          views: topTweet.views || 0,
          likes: topTweet.likes || 0,
          retweetCount: topTweet.retweet_count || 0,
          commentCount: topTweet.comment_count || 0,
          datePosted: topTweet.date_posted.toISOString(),
          userHandle: topTweet.user.twitter_handle,
          profileUrl:
            topTweet.user.profile_url ||
            `https://twitter.com/${topTweet.user.twitter_handle}`,
        };
      },
      CACHE_DURATION['GET /top-tweet']
    );
    
    if (!formattedTweet) {
      return res.status(404).json({ error: "No tweets found" });
    }

    return res.status(200).json(formattedTweet);
  } catch (error) {
    console.error("Error fetching top tweet:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get tweets
// Check if tweet IDs already exist in the database
giverepRouter.post("/tweets/check-existing", async (req: Request, res: Response) => {
  try {
    const { tweetIds } = req.body;
    
    if (!tweetIds || !Array.isArray(tweetIds) || tweetIds.length === 0) {
      return res.status(400).json({ 
        error: "Tweet IDs array is required",
        existingIds: []
      });
    }
    
    // Query the database for existing tweets
    const existingTweets = await db.query.giverepTweets.findMany({
      where: inArray(giverepTweets.tweet_id, tweetIds),
      columns: {
        tweet_id: true
      }
    });
    
    // Extract the tweet IDs from the results
    const existingIds = existingTweets.map(tweet => tweet.tweet_id);
    
    console.log(`[OPTIMIZATION] Checked ${tweetIds.length} tweet IDs, found ${existingIds.length} existing tweets`);
    
    return res.status(200).json({
      existingIds
    });
  } catch (error) {
    console.error("Error checking existing tweets:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      existingIds: [] 
    });
  }
});

// Get the most recent tweet and recent tweet IDs for a user
giverepRouter.get("/tweets/most-recent", async (req: Request, res: Response) => {
  try {
    const { twitterHandle } = req.query;
    
    if (!twitterHandle) {
      return res.status(400).json({ error: "Twitter handle is required" });
    }
    
    // Find the user ID from the handle
    const user = await db.query.giverepUsers.findFirst({
      where: eq(giverepUsers.twitter_handle, twitterHandle as string),
    });
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Get the most recent tweet for this user
    const mostRecentTweet = await db.query.giverepTweets.findFirst({
      where: eq(giverepTweets.user_id, user.id),
      orderBy: [desc(giverepTweets.date_posted)],
    });
    
    // Calculate timestamp for 24 hours ago
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    // Get IDs of tweets posted in the last 24 hours
    const recentTweets = await db.query.giverepTweets.findMany({
      where: and(
        eq(giverepTweets.user_id, user.id),
        gte(giverepTweets.date_posted, twentyFourHoursAgo)
      ),
      columns: {
        tweet_id: true,
        date_posted: true
      }
    });
    
    const recentTweetIds = recentTweets.map(tweet => tweet.tweet_id);
    
    if (!mostRecentTweet) {
      return res.status(200).json({
        mostRecentTweet: null,
        recentTweetIds: recentTweetIds,
        twentyFourHourCutoff: twentyFourHoursAgo
      });
    }
    
    return res.status(200).json({
      tweetId: mostRecentTweet.tweet_id,
      datePosted: mostRecentTweet.date_posted,
      recentTweetIds: recentTweetIds,
      twentyFourHourCutoff: twentyFourHoursAgo
    });
  } catch (error) {
    console.error("Error getting most recent tweet:", error);
    return res.status(500).json({ error: "Failed to get most recent tweet" });
  }
});

giverepRouter.get("/tweets", async (req: Request, res: Response) => {
  try {
    // Get query params
    const {
      handle,
      limit = "50",
      offset = "0",
      hashtag,
      startDate,
      endDate,
    } = req.query;

    // Use caching for tweets with cache duration from config
    const tweetsWithUsers = await getOrComputeData(
      req,
      async () => {
        console.log("Cache miss for tweets - computing fresh data...");
        
        // Convert limit and offset to numbers
        const limitNum = parseInt(limit as string);
        const offsetNum = parseInt(offset as string);

        // Build filters
        let filters = [];

        // Filter by handle
        if (handle) {
          const user = await db.query.giverepUsers.findFirst({
            where: eq(giverepUsers.twitter_handle, handle as string),
          });

          if (user) {
            filters.push(eq(giverepTweets.user_id, user.id));
          } else {
            // Handle not found, return empty array
            return [];
          }
        }

        // Filter by hashtag
        if (hashtag) {
          filters.push(ilike(giverepTweets.content, `%#${hashtag}%`));
        }

        // Filter by date range
        if (startDate) {
          const start = new Date(startDate as string);
          filters.push(gte(giverepTweets.date_posted, start));
        }

        if (endDate) {
          const end = new Date(endDate as string);
          filters.push(lte(giverepTweets.date_posted, end));
        }

        // Build query
        let query = db.select().from(giverepTweets);

        if (filters.length > 0) {
          query = query.where(and(...filters));
        }

        // Add order and pagination
        query = query
          .orderBy(desc(giverepTweets.date_posted))
          .limit(limitNum)
          .offset(offsetNum);

        // Execute query
        const tweets = await query;

        // For each tweet, fetch user info
        return Promise.all(
          tweets.map(async (tweet) => {
            const user = await db.query.giverepUsers.findFirst({
              where: eq(giverepUsers.id, tweet.user_id),
            });

            return {
              id: tweet.id,
              tweetId: tweet.tweet_id,
              content: tweet.content,
              views: tweet.views || 0,
              likes: tweet.likes || 0,
              retweetCount: tweet.retweet_count || 0,
              commentCount: tweet.comment_count || 0,
              datePosted: tweet.date_posted.toISOString(),
              userHandle: user?.twitter_handle || "unknown",
              profileUrl:
                user?.profile_url ||
                `https://twitter.com/${user?.twitter_handle || "unknown"}`,
            };
          })
        );
      },
      CACHE_DURATION['GET /tweets']
    );

    return res.status(200).json(tweetsWithUsers);
  } catch (error) {
    console.error("Error fetching tweets:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin authentication - supports both Bearer token and request body password
giverepRouter.post("/admin/auth", async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminPassword) {
      console.error("ADMIN_PASSWORD environment variable not set");
      return res.status(500).json({
        success: false,
        error: "Server authentication configuration error",
      });
    }

    // Check Bearer token first (preferred method)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      
      if (token === adminPassword) {
        // Store in session for future requests
        if (req.session) {
          req.session.adminPassword = adminPassword;
        }
        return res.status(200).json({ success: true });
      }
    }
    
    // Fallback to request body password
    if (password && password === adminPassword) {
      // Store in session for future requests
      if (req.session) {
        req.session.adminPassword = adminPassword;
      }
      return res.status(200).json({ success: true });
    }

    console.log('- Authentication failed');
    return res.status(401).json({ 
      success: false,
      error: "Invalid admin password" 
    });
  } catch (error) {
    console.error("Error authenticating admin:", error);
    return res.status(500).json({ 
      success: false,
      error: "Internal server error" 
    });
  }
});

// Admin collection logs
giverepRouter.get("/admin/logs", async (req: Request, res: Response) => {
  try {
    // Check admin auth from session
    if (req.session && !(req.session as any).adminAuth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get collection logs
    const logs = await db
      .select()
      .from(giverepCollectionLogs)
      .orderBy(desc(giverepCollectionLogs.started_at));

    return res.status(200).json(logs);
  } catch (error) {
    console.error("Error fetching collection logs:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Import tweets from an external Apify dataset
 * This endpoint allows admins to import tweets from datasets created outside the application
 */
giverepRouter.post("/admin/import-dataset", async (req: Request, res: Response) => {
  try {
    // Check admin auth from session
    if (req.session && !(req.session as any).adminAuth) {
      // If not authenticated via session, check for password in request body
      const { password } = req.body;
      
      // No password provided and not authenticated via session
      if (!password) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Check if admin password is set in environment variables
      const adminPassword = process.env.ADMIN_PASSWORD || "ExD123$";

      if (!adminPassword) {
        return res.status(500).json({ error: "Admin password not configured" });
      }

      if (password !== adminPassword) {
        return res.status(401).json({ error: "Invalid admin password" });
      }

      // Set auth in session
      if (req.session) {
        (req.session as any).adminAuth = true;
      }
    }
    
    const { datasetId, twitterHandle } = req.body;
    
    if (!datasetId) {
      return res.status(400).json({ error: "Dataset ID is required" });
    }
    
    // First check if the Twitter handle exists in our system (if specified)
    let user;
    
    if (twitterHandle) {
      const normalizedHandle = twitterHandle.toLowerCase();
      
      user = await db.query.giverepUsers.findFirst({
        where: eq(giverepUsers.twitter_handle, normalizedHandle)
      });
      
      if (!user) {
        return res.status(404).json({ 
          error: `Twitter handle @${twitterHandle} is not registered in GiveRep. Please register the user first.` 
        });
      }
    }
    
    // Fetch tweets from the Apify dataset
    const { fetchTweetsFromDataset } = await import("../twitter-service");
    const tweets = await fetchTweetsFromDataset(datasetId, twitterHandle);
    
    if (tweets.length === 0) {
      return res.status(404).json({ 
        error: "No valid tweets found in the dataset" 
      });
    }
    
    // Process the tweets
    const results = {
      totalTweets: tweets.length,
      tweetsProcessed: 0,
      newTweets: 0,
      updatedTweets: 0,
      usersUpdated: 0,
      errors: []
    };
    
    // Group tweets by author
    const tweetsByAuthor = tweets.reduce((acc: Record<string, any[]>, tweet) => {
      const authorHandle = tweet.author.userName;
      if (!acc[authorHandle]) {
        acc[authorHandle] = [];
      }
      acc[authorHandle].push(tweet);
      return acc;
    }, {});
    
    // Process each author's tweets
    for (const [authorHandle, authorTweets] of Object.entries(tweetsByAuthor)) {
      try {
        // Find or create user
        let twitterUser = await db.query.giverepUsers.findFirst({
          where: eq(giverepUsers.twitter_handle, authorHandle.toLowerCase())
        });
        
        if (!twitterUser) {
          // If user doesn't exist, create a new one (unverified)
          const newUser = await db.insert(giverepUsers)
            .values({
              twitter_handle: authorHandle.toLowerCase(),
              twitter_id: authorTweets[0].author.id,
              is_verified: false,
              created_at: new Date()
            })
            .returning();
            
          twitterUser = newUser[0];
          results.usersUpdated++;
        } else {
          // Update user profile with latest information from tweets
          const latestTweet = authorTweets[0]; // Assuming tweets are sorted newest first
          const updateData: any = {};
          
          // Update Twitter ID if available
          if (latestTweet.author.id && !twitterUser.twitter_id) {
            updateData.twitter_id = latestTweet.author.id;
          }
          
          // Update profile data
          const author = latestTweet.author;
          
          if (author.name) updateData.display_name = author.name;
          if (author.followers !== undefined) updateData.follower_count = author.followers;
          if (author.profilePicture) updateData.profile_picture = author.profilePicture;
          if (author.description) updateData.bio = author.description;
          if (author.location) updateData.location = author.location;
          
          // Handle the following count field
          if (author.following !== undefined) updateData.following_count = author.following;
          else if (author.followingCount !== undefined) updateData.following_count = author.followingCount;
          
          // Handle account creation date
          if (author.createdAt) {
            try {
              updateData.account_created_at = new Date(author.createdAt);
            } catch (error) {
              console.error(`Error parsing account creation date: ${author.createdAt}`, error);
            }
          }
          // Fallback to accountCreatedAt if available
          else if (author.accountCreatedAt) {
            updateData.account_created_at = new Date(author.accountCreatedAt);
          }
          
          // Only update if we have data to update
          if (Object.keys(updateData).length > 0) {
            await db.update(giverepUsers)
              .set(updateData)
              .where(eq(giverepUsers.id, twitterUser.id));
            
            results.usersUpdated++;
          }
        }
        
        // Process and store tweets for this user
        for (const tweet of authorTweets) {
          try {
            // Skip verification tweets
            if (tweet.text.toLowerCase().includes('verifying my twitter account for @giverep')) {
              continue;
            }
            
            // Check if tweet already exists
            const existingTweet = await db.query.giverepTweets.findFirst({
              where: eq(giverepTweets.tweet_id, tweet.id)
            });
            
            if (existingTweet) {
              // Update existing tweet's metrics if the new values are higher
              const updateData: Record<string, any> = {};
              
              // Only update metrics if the new values are higher (engagement generally only increases)
              if ((tweet.viewCount || 0) > existingTweet.views) {
                updateData.views = tweet.viewCount || 0;
              }
              
              if ((tweet.likeCount || 0) > existingTweet.likes) {
                updateData.likes = tweet.likeCount || 0;
              }
              
              if ((tweet.retweetCount || 0) > existingTweet.retweet_count) {
                updateData.retweet_count = tweet.retweetCount || 0;
              }
              
              const commentCount = tweet.replyCount || tweet.commentCount || 0;
              if (commentCount > existingTweet.comment_count) {
                updateData.comment_count = commentCount;
              }
              
              // Only update if we have changes
              if (Object.keys(updateData).length > 0) {
                await db.update(giverepTweets)
                  .set(updateData)
                  .where(eq(giverepTweets.tweet_id, tweet.id));
                
                results.updatedTweets++;
              }
            } else {
              // Insert new tweet
              await db.insert(giverepTweets)
                .values({
                  tweet_id: tweet.id,
                  user_id: twitterUser.id,
                  content: tweet.text,
                  views: tweet.viewCount || 0,
                  likes: tweet.likeCount || 0,
                  retweet_count: tweet.retweetCount || 0,
                  comment_count: tweet.replyCount || tweet.commentCount || 0,
                  date_posted: new Date(tweet.createdAt),
                  is_verification_tweet: false
                });
              
              results.newTweets++;
            }
            
            results.tweetsProcessed++;
          } catch (error) {
            console.error(`Error storing tweet ${tweet.id}:`, error);
            results.errors.push(`Failed to store tweet ${tweet.id}: ${error.message}`);
          }
        }
      } catch (error) {
        console.error(`Error processing tweets for ${authorHandle}:`, error);
        results.errors.push(`Failed to process tweets for ${authorHandle}: ${error.message}`);
      }
    }
    
    // Create a log entry
    await db.insert(giverepCollectionLogs)
      .values({
        source: 'admin-import',
        started_at: new Date(),
        completed_at: new Date(),
        tweets_collected: results.tweetsProcessed,
        status: 'completed',
        details: JSON.stringify({
          datasetId,
          twitterHandle: twitterHandle || 'all',
          results
        })
      });
    
    return res.status(200).json({
      success: true,
      ...results,
      message: `Successfully processed ${results.tweetsProcessed} tweets from dataset ${datasetId} (${results.newTweets} new, ${results.updatedTweets} updated)`
    });
  } catch (error) {
    console.error("Error importing tweets from dataset:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message || "An unknown error occurred"
    });
  }
});

/**
 * Admin endpoint to recalculate engagement scores for all verified users
 * Route: POST /api/giverep/admin/recalculate-engagement
 */
giverepRouter.post('/admin/recalculate-engagement', isAdmin, async (req: Request, res: Response) => {
  try {
    console.log('Starting manual engagement score recalculation...');
    
    // Run the engagement score update function
    const updatedCount = await updateAllEngagementScores();
    
    return res.status(200).json({
      success: true,
      message: `Successfully updated engagement scores for ${updatedCount} verified users`,
      updated_count: updatedCount
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error during engagement score recalculation:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to recalculate engagement scores',
      error: errorMessage
    });
  }
});

// Trading PnL update endpoints removed - not available in public version


giverepRouter.get("/test", async (req: Request, res: Response) => {
  try {
    console.log("[xWallet] Test endpoint called");

    // Import Redis cache utility
    const { getRedisValue, setRedisValue } = await import('../utils/redisCache');
    
    // Fetch the test value from Redis
    const testValue = await getRedisValue<number>('test', 60);
    
    // Set test value in Redis
    await setRedisValue('test', 1, 60);
    
    // Return a simple success response
    return res.json({
      success: true,
      message: `"[xWallet] Test value from Redis cache:" ${testValue}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error executing transaction:", error);
  }
});

/**
 * Account recovery endpoint to merge old Twitter handle with new handle
 * Route: POST /api/giverep/recover-account
 */
giverepRouter.post('/recover-account', async (req: Request, res: Response) => {
  try {
    const { oldHandle, newHandle, twitterId } = req.body;
    
    if (!oldHandle || !newHandle || !twitterId) {
      return res.status(400).json({ 
        error: 'Missing required fields: oldHandle, newHandle, and twitterId' 
      });
    }
    
    // CRITICAL SECURITY CHECK: Validate Twitter authentication
    // Use the existing verifyTwitterIdentity function
    const { verifyTwitterIdentity } = await import('../lib/verifyTwitterIdentity');
    const verification = await verifyTwitterIdentity(req, newHandle);
    
    if (!verification.success) {
      return res.status(401).json({ 
        error: verification.message || 'Not authenticated. Please login with Twitter first.' 
      });
    }
    
    // Extract the verified Twitter user ID from the API response
    const verifiedTwitterId = verification.twitterUser?.data?.id;
    
    if (!verifiedTwitterId || verifiedTwitterId !== twitterId) {
      return res.status(403).json({ 
        error: 'Twitter ID mismatch. You can only recover your own account.' 
      });
    }
    
    // Additional security: Verify the newHandle matches the authenticated user
    const verifiedHandle = verification.twitterUser?.data?.username;
    if (!verifiedHandle || verifiedHandle.toLowerCase() !== newHandle.toLowerCase()) {
      return res.status(403).json({ 
        error: 'New handle must match your current Twitter username.' 
      });
    }

    // Import required schemas
    const { repUsers, repPoints } = await import('@db/reputation_schema');
    const { tweets } = await import('@db/tweets_schema');
    const { loyaltyRewards } = await import('@db/loyalty_schema');
    const { mindshareTweets } = await import('@db/mindshare_schema');
    
    // Import recovery log schema - wrapped in try-catch as it's non-critical
    let accountRecoveryLog: any = null;
    try {
      const recoveryLogModule = await import('@db/recovery_log_schema');
      accountRecoveryLog = recoveryLogModule.accountRecoveryLog;
    } catch (importError) {
      console.error('Failed to import recovery log schema:', importError);
      // Continue without logging - recovery can still proceed
    }
    
    // Normalize handles to lowercase
    const normalizedOldHandle = oldHandle.toLowerCase();
    const normalizedNewHandle = newHandle.toLowerCase();
    
    // Check if the handles are the same (case-insensitive)
    if (normalizedOldHandle === normalizedNewHandle) {
      return res.status(400).json({ 
        error: 'The old and new handles are the same. No recovery needed.' 
      });
    }
    
    // Start a transaction
    const result = await db.transaction(async (tx) => {
      // 1. First check multiple sources to verify ownership of the old handle
      let isValidOldAccount = false;
      
      // Check rep_users table
      const oldUser = await tx
        .select()
        .from(repUsers)
        .where(
          and(
            eq(repUsers.twitterHandle, normalizedOldHandle),
            eq(repUsers.twitterId, BigInt(twitterId))
          )
        )
        .limit(1);
      
      if (oldUser.length > 0) {
        isValidOldAccount = true;
      }
      
      // If not found in rep_users, check tweets table
      if (!isValidOldAccount) {
        const oldTweets = await tx
          .select()
          .from(tweets)
          .where(
            and(
              eq(tweets.author_handle, normalizedOldHandle),
              eq(tweets.author_id, twitterId.toString())
            )
          )
          .limit(1);
        
        if (oldTweets.length > 0) {
          isValidOldAccount = true;
        }
      }
      
      
      if (!isValidOldAccount) {
        throw new Error('No account found with the provided old handle and Twitter ID in any of our records');
      }

      // Get or create the old user data in rep_users
      let oldUserData;
      if (oldUser.length > 0) {
        oldUserData = oldUser[0];
      } else {
        // Create a new rep_users entry for the old handle if it doesn't exist
        const [createdUser] = await tx
          .insert(repUsers)
          .values({
            twitterHandle: normalizedOldHandle,
            twitterId: BigInt(twitterId),
            totalReputation: 0
          })
          .returning();
        oldUserData = createdUser;
      }

      // 2. Check if there's already a user with the new handle (rep_users has unique constraint)
      const existingNewUser = await tx
        .select()
        .from(repUsers)
        .where(eq(repUsers.twitterHandle, normalizedNewHandle))
        .limit(1);

      let mergedReputation = oldUserData.totalReputation;

      if (existingNewUser.length > 0) {
        // Merge reputation points - this is the only field we need to merge
        mergedReputation = (oldUserData.totalReputation || 0) + (existingNewUser[0].totalReputation || 0);
        
        // Update the existing user with merged reputation
        await tx
          .update(repUsers)
          .set({
            totalReputation: mergedReputation,
            twitterId: BigInt(twitterId) // Ensure Twitter ID is set
          })
          .where(eq(repUsers.twitterHandle, normalizedNewHandle));
        
        // Delete the old user entry
        await tx
          .delete(repUsers)
          .where(
            and(
              eq(repUsers.twitterHandle, normalizedOldHandle),
              eq(repUsers.twitterId, BigInt(twitterId))
            )
          );
      } else {
        // Simply update the handle for the existing user
        await tx
          .update(repUsers)
          .set({ twitterHandle: normalizedNewHandle })
          .where(
            and(
              eq(repUsers.twitterHandle, normalizedOldHandle),
              eq(repUsers.twitterId, BigInt(twitterId))
            )
          );
      }

      // Track update counts
      let repPointsUpdated = 0;
      let tweetsUpdated = 0;
      let loyaltyRewardsUpdated = 0;

      // 3. Update rep_points table - no unique constraint on handle alone, just update
      const fromPointsResult = await tx
        .update(repPoints)
        .set({ fromHandle: normalizedNewHandle })
        .where(
          and(
            eq(repPoints.fromHandle, normalizedOldHandle),
            eq(repPoints.fromId, BigInt(twitterId))
          )
        );
      repPointsUpdated += fromPointsResult.rowCount || 0;

      const toPointsResult = await tx
        .update(repPoints)
        .set({ toHandle: normalizedNewHandle })
        .where(
          and(
            eq(repPoints.toHandle, normalizedOldHandle),
            eq(repPoints.toId, BigInt(twitterId))
          )
        );
      repPointsUpdated += toPointsResult.rowCount || 0;

      // 4. Update tweets table - no unique constraint on handle, just update
      const tweetsResult = await tx
        .update(tweets)
        .set({ author_handle: normalizedNewHandle })
        .where(
          and(
            eq(tweets.author_handle, normalizedOldHandle),
            eq(tweets.author_id, twitterId.toString())
          )
        );
      tweetsUpdated = tweetsResult.rowCount || 0;

      // 5. Update loyalty_rewards table - no unique constraint on handle, just update
      const loyaltyResult = await tx
        .update(loyaltyRewards)
        .set({ twitter_handle: normalizedNewHandle })
        .where(
          and(
            eq(loyaltyRewards.twitter_handle, normalizedOldHandle),
            eq(loyaltyRewards.twitter_id, Number(twitterId))
          )
        );
      loyaltyRewardsUpdated = loyaltyResult.rowCount || 0;

      // 6. Skip twitter_user_info table - it's just for tracking info, keep old records as-is

      // 7. Update mindshare_tweets table - no unique constraint on handle, just update
      await tx
        .update(mindshareTweets)
        .set({ user_handle: normalizedNewHandle })
        .where(eq(mindshareTweets.user_handle, normalizedOldHandle));

      // 8. Update loyalty_members table - handle potential duplicates
      // Import additional schemas if not already imported
      const { loyaltyMembers, loyaltyMetrics } = await import('@db/loyalty_schema');
      
      // For loyalty_members, we need to handle unique constraint on (project_id, twitter_handle)
      const oldLoyaltyMembers = await tx
        .select()
        .from(loyaltyMembers)
        .where(eq(loyaltyMembers.twitter_handle, normalizedOldHandle));

      for (const oldMember of oldLoyaltyMembers) {
        // Check if there's already a membership with the new handle for this project
        const existingNewMember = await tx
          .select()
          .from(loyaltyMembers)
          .where(
            and(
              eq(loyaltyMembers.project_id, oldMember.project_id),
              eq(loyaltyMembers.twitter_handle, normalizedNewHandle)
            )
          )
          .limit(1);

        if (existingNewMember.length > 0) {
          // If already exists, just delete the old one
          await tx
            .delete(loyaltyMembers)
            .where(eq(loyaltyMembers.id, oldMember.id));
        } else {
          // Otherwise, update the handle
          await tx
            .update(loyaltyMembers)
            .set({ twitter_handle: normalizedNewHandle })
            .where(eq(loyaltyMembers.id, oldMember.id));
        }
      }

      // 9. Update loyalty_metrics table - handle potential duplicates
      const oldLoyaltyMetrics = await tx
        .select()
        .from(loyaltyMetrics)
        .where(eq(loyaltyMetrics.twitter_handle, normalizedOldHandle));

      for (const oldMetric of oldLoyaltyMetrics) {
        // Check if there's already a metric with the new handle for this project
        const existingNewMetric = await tx
          .select()
          .from(loyaltyMetrics)
          .where(
            and(
              eq(loyaltyMetrics.project_id, oldMetric.project_id),
              eq(loyaltyMetrics.twitter_handle, normalizedNewHandle)
            )
          )
          .limit(1);

        if (existingNewMetric.length > 0) {
          // If already exists, merge the metrics
          const mergedMetric = existingNewMetric[0];
          await tx
            .update(loyaltyMetrics)
            .set({
              tweet_count: (mergedMetric.tweet_count || 0) + (oldMetric.tweet_count || 0),
              views: (mergedMetric.views || 0) + (oldMetric.views || 0),
              likes: (mergedMetric.likes || 0) + (oldMetric.likes || 0),
              retweets: (mergedMetric.retweets || 0) + (oldMetric.retweets || 0),
              replies: (mergedMetric.replies || 0) + (oldMetric.replies || 0),
              twitter_id: Number(twitterId), // Ensure Twitter ID is set
              last_updated: new Date()
            })
            .where(eq(loyaltyMetrics.id, mergedMetric.id));
          
          // Delete the old metric
          await tx
            .delete(loyaltyMetrics)
            .where(eq(loyaltyMetrics.id, oldMetric.id));
        } else {
          // Otherwise, update the handle
          await tx
            .update(loyaltyMetrics)
            .set({ 
              twitter_handle: normalizedNewHandle,
              twitter_id: Number(twitterId) // Ensure Twitter ID is set
            })
            .where(eq(loyaltyMetrics.id, oldMetric.id));
        }
      }

      // 10. Update rep_user_points table for fast leaderboard access
      // This is done outside the transaction to use the specialized function
      let pointsRecovered = false;
      try {
        // Import the recovery service
        const { recoverReputationPoints } = await import('../services/reputation-recovery');
        const recoveryResult = await recoverReputationPoints(
          normalizedOldHandle,
          normalizedNewHandle,
          twitterId
        );
        pointsRecovered = recoveryResult.success;
        if (!recoveryResult.success) {
          console.warn('Failed to recover rep_user_points:', recoveryResult.message);
        }
      } catch (pointsError) {
        console.error('Error recovering rep_user_points:', pointsError);
        // Continue - this is non-critical
      }

      // 11. Log the recovery (non-critical - wrapped in try-catch)
      try {
        if (accountRecoveryLog) {
          await tx
            .insert(accountRecoveryLog)
            .values({
              twitter_id: twitterId.toString(),
              old_handle: normalizedOldHandle,
              new_handle: normalizedNewHandle,
              recovery_type: 'manual',
              merged_reputation: mergedReputation || 0,
              rep_points_updated: repPointsUpdated,
              tweets_updated: tweetsUpdated,
              loyalty_rewards_updated: loyaltyRewardsUpdated,
              recovered_by: 'user',
              metadata: {
                source: 'web_app',
                user_agent: req.headers['user-agent'],
                ip: req.ip,
                found_in_tables: {
                  rep_users: oldUser.length > 0,
                  tweets: isValidOldAccount && oldUser.length === 0,
                  twitter_user_info: isValidOldAccount && oldUser.length === 0
                },
                rep_user_points_recovered: pointsRecovered
              }
            });
        }
      } catch (logError) {
        // Log error but don't fail the recovery
        console.error('Failed to log account recovery:', logError);
        // Continue with the recovery process
      }

      // Clear relevant caches
      await clearCacheByPrefix(`user:${normalizedOldHandle}`);
      await clearCacheByPrefix(`user:${normalizedNewHandle}`);
      await clearCacheByPrefix('leaderboard');

      return {
        success: true,
        oldHandle: normalizedOldHandle,
        newHandle: normalizedNewHandle,
        mergedReputation,
        message: 'Account successfully recovered and data merged'
      };
    });

    return res.json(result);
  } catch (error) {
    console.error('Error in account recovery:', error);
    return res.status(400).json({ 
      error: error instanceof Error ? error.message : 'Failed to recover account' 
    });
  }
});