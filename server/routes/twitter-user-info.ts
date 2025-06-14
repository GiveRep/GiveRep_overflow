import { Router } from "express";
import { getTwitterUserInfo } from "../services/twitter-user-info-service";
import { db, getReadDatabase } from "../../db";
import { twitter_user_info, type TwitterUserInfo } from "../../db/twitter_user_info_schema";
import { projectCreatorScores } from "../../db/project_creator_scores_schema";
import { eq, sql, and } from "drizzle-orm";

const router = Router();

/**
 * Bulk fetch Twitter user info for multiple handles
 * GET /api/loyalty/twitter-user-info/batch?handles=handle1,handle2,handle3
 * Query param: handles - Comma-separated list of Twitter handles
 */
router.get("/batch", async (req, res) => {
  try {
    // Set cache headers (86400 seconds = 24 hours)
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    // Get handles from query parameter
    const handlesParam = req.query.handles as string;
    
    if (!handlesParam) {
      return res.status(400).json({ error: "handles query parameter is required" });
    }
    
    // Split the comma-separated list
    const handles = handlesParam.split(',');
    
    if (!handles || handles.length === 0) {
      return res.status(400).json({ error: "Valid handles list is required" });
    }
    
    // Limit the number of handles that can be requested at once
    if (handles.length > 100) {
      return res.status(400).json({ error: "Too many handles requested (max 100)" });
    }
    
    // Normalize all handles
    const normalizedHandles = handles.map(h => h.replace("@", "").toLowerCase());
    
    // Try to get existing info from database first - use read replica for better performance
    // Use the imported sql helper instead of db.sql
    const existingInfo = await getReadDatabase()
      .select()
      .from(twitter_user_info)
      .where(
        // Create a condition for: handle IN (handle1, handle2, ...)
        sql`${twitter_user_info.handle} IN (${sql.join(normalizedHandles.map(h => sql`${h}`), sql`, `)})`
      );
    
    // Create a map of handle -> info
    const infoMap = new Map(existingInfo.map(info => [info.handle, info]));
    
    // Fetch any missing info
    const missingHandles = normalizedHandles.filter(handle => !infoMap.has(handle));
    
    // If we have missing handles, fetch them one by one
    // This is not the most efficient approach but ensures we don't overload the Twitter API
    if (missingHandles.length > 0) {
      console.log(`[API] Fetching ${missingHandles.length} missing Twitter user info records`);
      
      // Fetch missing handles in parallel with rate limiting
      const fetchPromises = missingHandles.map(async (handle, index) => {
        // Add a small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, index * 100));
        const info = await getTwitterUserInfo(handle);
        if (info && typeof info === 'object' && 'handle' in info) {
          // Ensure we're working with a proper TwitterUserInfo object
          const userInfo = info as TwitterUserInfo;
          infoMap.set(handle, userInfo);
        }
        return info;
      });
      
      await Promise.all(fetchPromises);
    }
    
    // Return all the info we have
    const result = normalizedHandles
      .map(handle => infoMap.get(handle))
      .filter(Boolean); // Remove any null/undefined values
    
    return res.json(result);
  } catch (error) {
    console.error("[API] Error getting Twitter user info in batch:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Get Twitter user info for a specific handle
 * GET /api/loyalty/twitter-user-info/:handle
 * Query params:
 *   - projectId (optional): Include project-specific creator score
 */
router.get("/:handle", async (req, res) => {
  try {
    // Set cache headers (86400 seconds = 24 hours)
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    const { handle } = req.params;
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : null;
    
    if (!handle) {
      return res.status(400).json({ error: "Handle is required" });
    }
    
    const normalizedHandle = handle.replace("@", "").toLowerCase();
    
    // Get Twitter user info from our service
    const twitterInfo = await getTwitterUserInfo(normalizedHandle);
    
    if (!twitterInfo) {
      return res.status(404).json({ error: "Twitter user not found" });
    }
    
    // If projectId is provided, get project-specific scores
    if (projectId && !isNaN(projectId)) {
      const [projectScore] = await getReadDatabase()
        .select({ 
          creator_score: projectCreatorScores.creator_score,
          relevance_score: projectCreatorScores.relevance_score,
          categories: projectCreatorScores.categories
        })
        .from(projectCreatorScores)
        .where(
          and(
            eq(projectCreatorScores.project_id, projectId),
            eq(projectCreatorScores.twitter_handle, normalizedHandle)
          )
        );
      
      // Add project-specific scores if they exist
      if (projectScore) {
        // Add relevance score (project-specific)
        (twitterInfo as any).relevance_score = projectScore.relevance_score;
        // Add categories
        (twitterInfo as any).categories = projectScore.categories || [];
        // Note: creator_score remains the global score from twitter_user_info
      }
    }
    
    return res.json(twitterInfo);
  } catch (error) {
    console.error("[API] Error getting Twitter user info:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Legacy endpoint for backward compatibility
 * GET /api/giverep/twitter-user-legacy/:handle
 */
router.get("/legacy/:handle", async (req, res) => {
  try {
    const { handle } = req.params;
    
    if (!handle) {
      return res.status(400).json({ error: "Handle is required" });
    }
    
    const normalizedHandle = handle.replace("@", "").toLowerCase();
    
    // Get Twitter user info from our service
    const twitterInfo = await getTwitterUserInfo(normalizedHandle);
    
    if (!twitterInfo) {
      return res.status(404).json({ error: "Twitter user not found" });
    }
    
    // Convert to legacy format
    const legacyFormat = {
      screen_name: twitterInfo.username || normalizedHandle,
      name: twitterInfo.display_name || normalizedHandle,
      profile_image_url_https: twitterInfo.profile_image_url,
      profile_banner_url: twitterInfo.banner_url,
      followers_count: twitterInfo.follower_count,
      following_count: twitterInfo.following_count,
      statuses_count: twitterInfo.tweet_count,
      created_at: twitterInfo.created_at,
      description: twitterInfo.description,
      location: twitterInfo.location,
      verified: twitterInfo.is_verified,
      is_blue_verified: twitterInfo.is_blue_verified
    };
    
    return res.json(legacyFormat);
  } catch (error) {
    console.error("[API] Error getting legacy Twitter user info:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;