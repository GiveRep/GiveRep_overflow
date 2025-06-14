import { Router, Request, Response } from "express";
import { MindshareService } from "../services/mindshare-service";
import { 
  insertMindshareProjectSchema, 
  insertMindshareKeywordSchema 
} from "../../db/mindshare_schema";
import { db } from "../../db/index";
import { mindshareProjects, mindshareKeywords, mindshareTweets } from "../../db/mindshare_schema";
import { projectTags } from "../../db/loyalty_schema";
import { nfts } from "../../db/reputation_schema";
import { eq, and, desc, gte, lte, ilike, or, sql, isNotNull } from "drizzle-orm";
import { subDays } from "date-fns";
import { z } from "zod";
import { withApiCache, getOrComputeData } from "../utils/apiCache";
import { clearCacheByPrefix } from "../utils/cache";
import { fetchUserInfo } from "../fxtwitter-service";
import { isAdmin } from "../middleware/auth";
import { nftPFPMatcherService } from "../services/nft-pfp-matcher-service";
import { imageEmbeddingService } from "../services/image-embedding-service";
import { repUsers, pfpCollections } from "../../db/reputation_schema";
import { suiGraphQLService } from "../services/sui-graphql-service";
import { getRedisClient } from "../utils/redisCache";
import { tradeportService } from "../services/tradeport-service";
import { formatMistToSui } from "@/lib/formatters";

// Cache duration configuration (in minutes)
const CACHE_DURATION = {
  'GET /projects': 5,              // List all projects
  'GET /projects/:id': 5,          // Get project details
  'GET /projects/:id/tweets': 2,   // Get project tweets
  'GET /projects/:id/top-tweet': 5, // Get top tweet for a project
  'GET /keywords': 10              // Get all keywords
};

export const mindshareRouter = Router();
const mindshareService = new MindshareService();

// GET all projects with their metrics
mindshareRouter.get("/projects", async (req: Request, res: Response) => {
  try {
    // For development or when days parameter changes, we want fresh data
    const skipCache = process.env.NODE_ENV === 'development' || req.query.days !== undefined;
    
    if (skipCache) {
      // Calculate metrics fresh without caching for date range changes
      console.log(`Computing fresh mindshare data for days=${req.query.days || 'default'}`);
      
      let timeframe: 'day' | 'week' | 'month' = 'week';
      
      if (req.query.days) {
        // If days is provided, convert it to a number and determine the timeframe
        const days = parseInt(req.query.days as string);
        
        if (!isNaN(days)) {
          if (days <= 1) {
            timeframe = 'day';
          } else if (days <= 7) {
            timeframe = 'week';
          } else if (days <= 14) {
            // For 14 days, we'll still use 'week' but we'll modify the start date in the service
            timeframe = 'week';
            // We'll add a special handling for 14 days in the service
          } else {
            timeframe = 'month';
          }
        }
        
        // Pass the actual day count and tag IDs to the service
        const projects = await mindshareService.getAllProjectsWithMetrics(timeframe, days);
        return res.json(projects);
      } else {
        // If days is not provided, use the timeframe parameter as before
        timeframe = req.query.timeframe as 'day' | 'week' | 'month' || 'week';
        const projects = await mindshareService.getAllProjectsWithMetrics(timeframe);
        return res.json(projects);
      }
    } else {
      // Use cache for production without date range parameter
      const projects = await getOrComputeData(
        req,
        async () => {
          console.log("Cache miss for mindshare projects - computing fresh data...");
          const timeframe = req.query.timeframe as 'day' | 'week' | 'month' || 'week';
          return await mindshareService.getAllProjectsWithMetrics(timeframe);
        },
        CACHE_DURATION['GET /projects']
      );
      
      return res.json(projects);
    }
  } catch (error) {
    console.error("Error fetching mindshare projects:", error);
    res.status(500).json({ 
      error: "Failed to fetch projects", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET specific project with time series data
mindshareRouter.get("/projects/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    
    // Use cache duration from config
    const projectData = await getOrComputeData(
      req,
      async () => {
        console.log(`Cache miss for project details (id: ${id}) - computing fresh data...`);
        
        // Get project details
        // Use the MindshareService to get project with keywords and tags
        const project = await mindshareService.getProjectWithKeywordsAndTags(id);
        
        if (!project) {
          // This will cause an error to be thrown, bypassing the cache
          throw new Error("Project not found");
        }
        
        // Get time series data
        const timeSeries = await mindshareService.getProjectTimeSeries(id);
        
        return {
          project,
          timeSeries
        };
      },
      CACHE_DURATION['GET /projects/:id'] // Use cache duration from config
    );
    
    res.json(projectData);
  } catch (error) {
    console.error("Error fetching project details:", error);
    
    // Handle the specific "Project not found" error with a 404
    if (error instanceof Error && error.message === "Project not found") {
      return res.status(404).json({ error: "Project not found" });
    }
    
    res.status(500).json({ 
      error: "Failed to fetch project details", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET: Get tweets for a specific project
mindshareRouter.get("/projects/:id/tweets", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    
    // Use cache with duration from config
    const tweetsData = await getOrComputeData(
      req,
      async () => {
        console.log(`Cache miss for project tweets (id: ${id}) - computing fresh data...`);
        
        // Get project details to confirm it exists
        const project = await db.query.mindshareProjects.findFirst({
          where: eq(mindshareProjects.id, id)
        });
        
        if (!project) {
          throw new Error("Project not found");
        }
        
        // Check if we need all tweets (no date filtering)
        const all = req.query.all === 'true';
        
        let tweets;
        
        if (all) {
          // Get ALL tweets for this project with no date filtering 
          const limit = parseInt(req.query.limit as string || "999999"); // No artificial limit for analysis
          
          // Fetch all tweets associated with this project
          tweets = await db.query.mindshareTweets.findMany({
            where: eq(mindshareTweets.project_id, id),
            orderBy: [desc(mindshareTweets.created_at)],
            limit: limit
          });
        } else {
          // Default to last 2 days to be consistent with our fxtwitter update period
          const days = parseInt(req.query.days as string || "2");
          const limit = parseInt(req.query.limit as string || "50");
          
          const endDate = new Date();
          const startDate = subDays(endDate, days);
          
          // Get sort parameter (default to views)
          const sortBy = req.query.sortBy || 'views';
          
          // Fetch tweets associated with this project with date filtering
          tweets = await db.query.mindshareTweets.findMany({
            where: and(
              eq(mindshareTweets.project_id, id),
              gte(mindshareTweets.created_at, startDate),
              lte(mindshareTweets.created_at, endDate)
            ),
            orderBy: sortBy === 'views' 
              ? [desc(mindshareTweets.views)] 
              : [desc(mindshareTweets.created_at)],
            limit: limit
          });
        }
        
        return {
          project_id: id,
          project_name: project.name,
          tweet_count: tweets.length,
          tweets: tweets
        };
      },
      CACHE_DURATION['GET /projects/:id/tweets'] // Use cache duration from config
    );
    res.json(tweetsData);
  } catch (error) {
    console.error("Error fetching project tweets:", error);
    
    // Handle the specific "Project not found" error with a 404
    if (error instanceof Error && error.message === "Project not found") {
      return res.status(404).json({ error: "Project not found" });
    }
    
    res.status(500).json({ 
      error: "Failed to fetch project tweets", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET: Get the most liked tweet for a specific project
mindshareRouter.get("/projects/:id/top-tweet", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    
    // Use cache with a 2-minute duration
    const topTweetData = await getOrComputeData(
      req,
      async () => {
        console.log(`Cache miss for top project tweet (id: ${id}) - computing fresh data...`);
        
        // Get project details to confirm it exists
        const project = await db.query.mindshareProjects.findFirst({
          where: eq(mindshareProjects.id, id)
        });
        
        if (!project) {
          throw new Error("Project not found");
        }
        
        // Default to last 2 days to be consistent with our fxtwitter update period
        const days = parseInt(req.query.days as string || "2");
        
        // Set up properly normalized dates
        let endDate = new Date();
        endDate.setHours(23, 59, 59, 999); // End of the current day
        
        let startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0); // Beginning of the day
        
        // Fetch the most liked tweet for this project in the time period
        const topTweet = await db.query.mindshareTweets.findFirst({
          where: and(
            eq(mindshareTweets.project_id, id),
            gte(mindshareTweets.created_at, startDate),
            lte(mindshareTweets.created_at, endDate)
          ),
          orderBy: [
            desc(mindshareTweets.likes), // First sort by likes
            desc(mindshareTweets.retweets), // Then by retweets for tweets with the same like count
            desc(mindshareTweets.views) // Then by views
          ],
          limit: 1
        });
        
        if (!topTweet) {
          throw new Error("No tweets found for this project in the selected time period");
        }
        
        return {
          project_id: id,
          project_name: project.name,
          tweet: topTweet
        };
      },
      CACHE_DURATION['GET /projects/:id/top-tweet'] // Use cache duration from config
    );
    
    res.json(topTweetData);
  } catch (error) {
    console.error("Error fetching top project tweet:", error);
    
    // Handle specific errors
    if (error instanceof Error) {
      if (error.message === "Project not found") {
        return res.status(404).json({ error: "Project not found" });
      } else if (error.message === "No tweets found for this project in the selected time period") {
        return res.status(404).json({ 
          error: "No tweets found for this project in the selected time period" 
        });
      }
    }
    
    res.status(500).json({ 
      error: "Failed to fetch top project tweet", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// ADMIN ROUTES

// GET: Refresh Twitter media for all mindshare projects
mindshareRouter.get("/refresh-twitter-media", isAdmin, async (req: Request, res: Response) => {
  try {
    console.log("Starting to refresh Twitter media for all mindshare projects...");
    
    // Get all active projects
    const projects = await db.query.mindshareProjects.findMany({
      where: eq(mindshareProjects.is_active, true)
    });
    
    const results = [];
    
    // Process each project to update Twitter media
    for (const project of projects) {
      if (project.twitter_handle) {
        try {
          console.log(`Refreshing Twitter media for project ${project.name} (handle: ${project.twitter_handle})`);
          
          // Fetch Twitter profile info using FXTwitter service
          const userInfo = await fetchUserInfo(project.twitter_handle);
          
          if (userInfo) {
            // Prepare update fields
            const updateFields: { logo_url?: string, banner_url?: string } = {};
            let updated = false;
            
            // Update logo_url if available
            if (userInfo.profilePicture) {
              updateFields.logo_url = userInfo.profilePicture;
              updated = true;
            }
            
            // Update banner_url if available
            if (userInfo.coverPicture) {
              updateFields.banner_url = userInfo.coverPicture;
              updated = true;
            }
            
            // Only update if we have fields to update
            if (updated) {
              await db
                .update(mindshareProjects)
                .set(updateFields)
                .where(eq(mindshareProjects.id, project.id));
              
              results.push({
                project_id: project.id,
                project_name: project.name,
                handle: project.twitter_handle,
                updated: true,
                fields: Object.keys(updateFields),
                logo_url: updateFields.logo_url,
                banner_url: updateFields.banner_url
              });
              
              console.log(`Updated project ${project.name} with Twitter media`);
            } else {
              results.push({
                project_id: project.id,
                project_name: project.name,
                handle: project.twitter_handle,
                updated: false,
                reason: "No new media data available"
              });
            }
          } else {
            results.push({
              project_id: project.id,
              project_name: project.name,
              handle: project.twitter_handle,
              updated: false,
              reason: "Could not fetch user info from Twitter"
            });
          }
        } catch (error) {
          console.error(`Error refreshing Twitter media for ${project.name}:`, error);
          results.push({
            project_id: project.id,
            project_name: project.name,
            handle: project.twitter_handle,
            updated: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      } else {
        results.push({
          project_id: project.id,
          project_name: project.name,
          updated: false,
          reason: "No Twitter handle provided"
        });
      }
    }
    
    // Clear cache for projects list
    await clearCacheByPrefix('GET /mindshare/projects');
    
    return res.json({
      success: true,
      message: `Refreshed Twitter media for ${results.filter(r => r.updated).length} out of ${projects.length} projects`,
      results
    });
  } catch (error) {
    console.error("Error refreshing Twitter media:", error);
    res.status(500).json({ 
      error: "Failed to refresh Twitter media", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// POST: Create new project
mindshareRouter.post("/projects", isAdmin, async (req: Request, res: Response) => {
  try {
    // Ensure tag_ids is an array in the project data
    if (req.body.project && !req.body.project.tag_ids) {
      req.body.project.tag_ids = [];
    }
    
    const projectData = insertMindshareProjectSchema.parse(req.body.project);
    const project = await mindshareService.createProject(projectData);
    
    // Clear cache for projects list to show the new project immediately
    await clearCacheByPrefix('GET /mindshare/projects');
    
    res.status(201).json(project);
  } catch (error) {
    console.error("Error creating project:", error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Invalid project data", 
        details: error.errors 
      });
    }
    
    res.status(500).json({ 
      error: "Failed to create project", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// PUT: Update project
mindshareRouter.put("/projects/:id", isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    
    // Ensure tag_ids is always an array if present
    if (req.body.project && req.body.project.tag_ids !== undefined && !Array.isArray(req.body.project.tag_ids)) {
      req.body.project.tag_ids = [];
    }
    
    const projectData = req.body.project;
    const project = await mindshareService.updateProject(id, projectData);
    
    // Clear all caches related to this project
    await clearCacheByPrefix('GET /mindshare/projects');
    await clearCacheByPrefix(`GET /mindshare/projects/${id}`);
    
    res.json(project);
  } catch (error) {
    console.error("Error updating project:", error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Invalid project data", 
        details: error.errors 
      });
    }
    
    res.status(500).json({ 
      error: "Failed to update project", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// DELETE: Delete project and all related data
mindshareRouter.delete("/projects/:id", isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    
    // Check if project exists
    const project = await db.query.mindshareProjects.findFirst({
      where: eq(mindshareProjects.id, id)
    });
    
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    
    // Delete the project and all associated data
    await mindshareService.deleteProject(id);
    
    // Clear cache for all projects list and specific project data
    await clearCacheByPrefix('GET /mindshare/projects');
    
    res.json({
      success: true,
      message: `Successfully deleted project '${project.name}' and all associated data`,
      deletedProject: project
    });
  } catch (error) {
    console.error("Error deleting project:", error);
    
    res.status(500).json({ 
      error: "Failed to delete project", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET: Get keywords for a specific project
mindshareRouter.get("/projects/:id/keywords", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    
    // Use cache with a 5-minute duration
    const keywordsData = await getOrComputeData(
      req,
      async () => {
        console.log(`Cache miss for project keywords (id: ${id}) - computing fresh data...`);
        
        // Check if project exists
        const project = await db.query.mindshareProjects.findFirst({
          where: eq(mindshareProjects.id, id)
        });
        
        if (!project) {
          throw new Error("Project not found");
        }
        
        // Get keywords for this project
        const keywords = await db.query.mindshareKeywords.findMany({
          where: eq(mindshareKeywords.project_id, id),
          orderBy: [desc(mindshareKeywords.created_at)]
        });
        
        return {
          project_id: id,
          project_name: project.name,
          keywords: keywords
        };
      },
      CACHE_DURATION['GET /keywords'] // Use cache duration from config
    );
    
    res.json(keywordsData);
  } catch (error) {
    console.error("Error fetching project keywords:", error);
    
    // Handle the specific "Project not found" error with a 404
    if (error instanceof Error && error.message === "Project not found") {
      return res.status(404).json({ error: "Project not found" });
    }
    
    res.status(500).json({ 
      error: "Failed to fetch project keywords", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// POST: Add keyword to project
mindshareRouter.post("/keywords", isAdmin, async (req: Request, res: Response) => {
  try {
    const keywordData = insertMindshareKeywordSchema.parse(req.body.keyword);
    
    // Check if project exists
    const project = await db.query.mindshareProjects.findFirst({
      where: eq(mindshareProjects.id, keywordData.project_id)
    });
    
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    
    // Check if keyword already exists for this project
    const existingKeyword = await db.query.mindshareKeywords.findFirst({
      where: and(
        eq(mindshareKeywords.project_id, keywordData.project_id),
        eq(mindshareKeywords.keyword, keywordData.keyword)
      )
    });
    
    if (existingKeyword) {
      return res.status(409).json({ 
        error: "Keyword already exists for this project",
        keyword: existingKeyword
      });
    }
    
    const keyword = await mindshareService.addKeyword(keywordData);
    
    // Invalidate cache for keywords list for this project
    await clearCacheByPrefix(`GET /mindshare/projects/${keywordData.project_id}/keywords`);
    
    res.status(201).json(keyword);
  } catch (error) {
    console.error("Error adding keyword:", error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Invalid keyword data", 
        details: error.errors 
      });
    }
    
    res.status(500).json({ 
      error: "Failed to add keyword", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// PUT: Update keyword
mindshareRouter.put("/keywords/:id", isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid keyword ID" });
    }
    
    // Get the original keyword to know which project it belongs to
    const originalKeyword = await db.query.mindshareKeywords.findFirst({
      where: eq(mindshareKeywords.id, id)
    });
    
    if (!originalKeyword) {
      return res.status(404).json({ error: "Keyword not found" });
    }
    
    const keywordData = req.body.keyword;
    const keyword = await mindshareService.updateKeyword(id, keywordData);
    
    // Clear keyword cache for this project
    await clearCacheByPrefix(`GET /mindshare/projects/${originalKeyword.project_id}/keywords`);
    
    res.json(keyword);
  } catch (error) {
    console.error("Error updating keyword:", error);
    
    res.status(500).json({ 
      error: "Failed to update keyword", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// DELETE: Delete a keyword
mindshareRouter.delete("/keywords/:id", isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid keyword ID" });
    }
    
    // Check if keyword exists
    const keyword = await db.query.mindshareKeywords.findFirst({
      where: eq(mindshareKeywords.id, id)
    });
    
    if (!keyword) {
      return res.status(404).json({ error: "Keyword not found" });
    }
    
    // Delete the keyword
    await db.delete(mindshareKeywords)
      .where(eq(mindshareKeywords.id, id));
    
    // Clear cache for keywords list for this project
    await clearCacheByPrefix(`GET /mindshare/projects/${keyword.project_id}/keywords`);
    
    res.json({
      success: true,
      message: `Successfully deleted keyword '${keyword.keyword}'`,
      deletedKeyword: keyword
    });
  } catch (error) {
    console.error("Error deleting keyword:", error);
    
    res.status(500).json({ 
      error: "Failed to delete keyword", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// POST: Collect tweets for all projects
mindshareRouter.post("/collect-tweets", isAdmin, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.body.days || "7");
    
    if (isNaN(days) || days < 1 || days > 30) {
      return res.status(400).json({ 
        error: "Invalid days parameter. Must be between 1 and 30." 
      });
    }
    
    // First, collect new tweets using TwitterAPI.io 
    // (which will now stop pagination when it finds any duplicate tweets)
    const result = await mindshareService.collectAllProjectTweets(days);
    
    // Now, separately update all recent tweets (≤2 days) using FXTwitter API
    // This will run for ALL tweets in the database that are recent
    const recentUpdates = await mindshareService.updateRecentTweetMetrics();
    
    // Calculate metrics after collecting tweets and updating recent ones
    await mindshareService.calculateMindshareMetrics();
    
    // Since we've collected new tweets and updated metrics for all projects, 
    // invalidate all project-related caches
    await clearCacheByPrefix('GET /mindshare/projects');
    
    res.json({
      success: true,
      message: `Collected ${result.tweetsCollected} tweets (${result.newTweets} new) for ${result.projectsUpdated} projects. Updated ${recentUpdates.tweetsUpdated} recent tweets with FXTwitter API.`,
      ...result,
      recentTweetsChecked: recentUpdates.tweetsChecked,
      recentTweetsUpdated: recentUpdates.tweetsUpdated
    });
  } catch (error) {
    console.error("Error collecting tweets:", error);
    
    res.status(500).json({ 
      error: "Failed to collect tweets", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// POST: Collect tweets for a specific project
mindshareRouter.post("/projects/:id/collect-tweets", isAdmin, async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    
    const days = parseInt(req.body.days || "7");
    
    if (isNaN(days) || days < 1 || days > 30) {
      return res.status(400).json({ 
        error: "Invalid days parameter. Must be between 1 and 30." 
      });
    }
    
    // Check if project exists
    const project = await db.query.mindshareProjects.findFirst({
      where: eq(mindshareProjects.id, projectId),
      with: {
        keywords: {
          where: eq(mindshareKeywords.is_active, true)
        }
      }
    });
    
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    
    // First, collect new tweets for this specific project using TwitterAPI.io
    // (which will now stop pagination when it finds duplicate tweets)
    const result = await mindshareService.collectProjectTweets(project, days);
    
    // Now, find and update recent tweets for this specific project using FXTwitter API
    // Calculate the date cutoff (2 days ago)
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    // Find all recent tweets for this specific project
    const recentTweets = await db.query.mindshareTweets.findMany({
      where: and(
        eq(mindshareTweets.project_id, projectId),
        gte(mindshareTweets.created_at, twoDaysAgo)
      )
    });
    
    console.log(`Found ${recentTweets.length} recent tweets (≤2 days old) for project ${project.name}`);
    
    // Update metrics for these specific recent tweets
    let updatedTweets = 0;
    
    for (const tweet of recentTweets) {
      try {
        // Use same FXTwitter API method to update metrics
        const fxMetrics = await mindshareService.fetchTweetMetrics(tweet.tweet_id);
        
        if (fxMetrics) {
          // Only update if we got valid data and the new metrics are higher
          const updateData: Record<string, any> = {};
          
          if (fxMetrics.views > tweet.views) {
            updateData.views = fxMetrics.views;
          }
          
          if (fxMetrics.likes > tweet.likes) {
            updateData.likes = fxMetrics.likes;
          }
          
          if (fxMetrics.retweets > tweet.retweets) {
            updateData.retweets = fxMetrics.retweets;
          }
          
          if (fxMetrics.replies > tweet.replies) {
            updateData.replies = fxMetrics.replies;
          }
          
          // Only update if any metrics actually changed
          if (Object.keys(updateData).length > 0) {
            await db.update(mindshareTweets)
              .set(updateData)
              .where(eq(mindshareTweets.id, tweet.id));
            
            updatedTweets++;
          }
        }
      } catch (error) {
        console.error(`Error updating metrics for tweet ${tweet.tweet_id}:`, error);
      }
    }
    
    // Calculate metrics for this project after collecting tweets
    // Set up properly normalized dates for metrics calculation
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999); // End of the current day
    
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7); // One week ago
    startDate.setHours(0, 0, 0, 0); // Beginning of the day
    
    await mindshareService.calculateMindshareMetrics(startDate, endDate);
    
    // Clear caches for this specific project
    await clearCacheByPrefix(`GET /mindshare/projects/${projectId}`);
    
    res.json({
      success: true,
      message: `Collected ${result.tweetsCollected} tweets (${result.newTweets} new) for project "${project.name}". Updated ${updatedTweets} recent tweets with FXTwitter API.`,
      project: project.name,
      project_id: projectId,
      tweetsCollected: result.tweetsCollected,
      newTweets: result.newTweets,
      recentTweetsChecked: recentTweets.length,
      recentTweetsUpdated: updatedTweets
    });
  } catch (error) {
    console.error("Error collecting tweets for project:", error);
    
    res.status(500).json({ 
      error: "Failed to collect tweets for project", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET: Export tweets for a project to CSV
mindshareRouter.get("/projects/:id/export-csv", isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    
    // Get project details to confirm it exists
    const project = await db.query.mindshareProjects.findFirst({
      where: eq(mindshareProjects.id, id)
    });
    
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    
    // Fetch ALL tweets associated with this project
    // Use a higher limit to get all tweets
    const tweets = await db.query.mindshareTweets.findMany({
      where: eq(mindshareTweets.project_id, id),
      orderBy: [desc(mindshareTweets.created_at)]
    });
    
    if (tweets.length === 0) {
      return res.status(404).json({ error: "No tweets found for this project" });
    }
    
    // Format as CSV - Completely streamlined as requested
    // Remove Tweet ID and Keyword ID columns as requested
    let csv = "Author,Tweet URL,Tweet Content,Likes,Retweets,Replies,Views,Created At,Twitter Handle,Twitter ID\n";
    
    // Add each tweet as a row
    tweets.forEach(tweet => {
      const tweetUrl = `https://x.com/${tweet.user_handle}/status/${tweet.tweet_id}`;
      const authorName = tweet.user_name?.replace(/,/g, "") || tweet.user_handle || "Unknown";
      
      // Properly escape fields that might contain commas or quotes
      const escapeCsvField = (field: string | null) => {
        if (field === null || field === undefined) return ""; 
        // Replace double quotes with two double quotes (CSV escaping)
        const escaped = String(field).replace(/"/g, '""');
        // Wrap in quotes if the field contains commas, quotes, or newlines
        if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
          return `"${escaped}"`;
        }
        return escaped;
      };
      
      // Use optional chaining to safely access user_id
      csv += [
        escapeCsvField(authorName),
        tweetUrl,
        escapeCsvField(tweet.content),
        tweet.likes,
        tweet.retweets,
        tweet.replies,
        tweet.views,
        tweet.created_at.toISOString(),
        tweet.user_handle,
        // @ts-ignore - We've added this column to the database but TypeScript doesn't know yet
        tweet.user_id || '' // Add the Twitter ID (user_id) field
      ].join(",") + "\n";
    });
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, '_')}_tweets.csv"`);
    
    res.send(csv);
  } catch (error) {
    console.error("Error exporting project tweets to CSV:", error);
    res.status(500).json({ 
      error: "Failed to export tweets to CSV", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET user tweets for a specific project
mindshareRouter.get("/user-tweets/:twitterHandle", async (req: Request, res: Response) => {
  try {
    const { twitterHandle } = req.params;
    const { projectId } = req.query;
    
    if (!projectId) {
      return res.status(400).json({ error: "Project ID is required" });
    }
    
    const projectIdNum = parseInt(projectId as string);
    
    if (isNaN(projectIdNum)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    
    // Import necessary tables
    const { tweets } = await import("../../db/tweets_schema");
    const { loyaltyProjects } = await import("../../db/loyalty_schema");
    
    // Get the loyalty project's twitter handle
    const loyaltyProject = await db.query.loyaltyProjects.findFirst({
      where: eq(loyaltyProjects.id, projectIdNum)
    });
    
    if (!loyaltyProject) {
      return res.status(404).json({ error: "Loyalty project not found" });
    }
    
    if (!loyaltyProject.twitter_handle) {
      return res.status(400).json({ error: "Project does not have a Twitter handle configured" });
    }
    
    // Fetch ALL tweets from the user that mention this loyalty project, ordered by views
    // Note: eligible_loyalty_mentions are stored in lowercase, so we need to search with lowercase
    const userTweets = await db.query.tweets.findMany({
      where: and(
        eq(tweets.author_handle, twitterHandle),
        sql`${tweets.eligible_loyalty_mentions} @> ARRAY[${loyaltyProject.twitter_handle.toLowerCase()}]`
      ),
      orderBy: [desc(tweets.views)]
    });
    
    // Format tweets with engagement data
    const formattedTweets = userTweets.map(tweet => ({
      id: tweet.tweet_id,
      text: tweet.content,
      created_at: tweet.created_at,
      like_count: tweet.likes,
      retweet_count: tweet.retweets,
      reply_count: tweet.replies,
      view_count: tweet.views,
      tweet_url: tweet.tweet_link || `https://x.com/${tweet.author_handle}/status/${tweet.tweet_id}`,
      user_handle: tweet.author_handle,
      user_name: tweet.author_name
    }));
    
    res.json(formattedTweets);
  } catch (error) {
    console.error("Error fetching user tweets:", error);
    res.status(500).json({ 
      error: "Failed to fetch user tweets", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// POST: Calculate mindshare metrics (alias that doesn't require admin auth - for backward compatibility)
mindshareRouter.post("/calculate", async (req: Request, res: Response) => {
  try {
    const timeframe = req.body.timeframe || "week";

    // Create a new date object for the end date and set it to the end of the day (23:59:59.999)
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    
    // Create a new date object for the start date and set it to the beginning of the day (00:00:00.000)
    let startDate = new Date(endDate);
    
    if (timeframe === "day") {
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (timeframe === "week") {
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (timeframe === "month") {
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    } else {
      return res.status(400).json({ 
        error: "Invalid timeframe. Must be 'day', 'week', or 'month'." 
      });
    }
    
    await clearCacheByPrefix('GET /mindshare/projects');
    
    // Just clear the cache and return success, don't actually calculate metrics
    // This endpoint is used by client-side code and doesn't need to wait for calculation
    return res.json({
      success: true,
      message: `Triggered cache refresh for ${timeframe} metrics`,
      calculation_started: false
    });
  } catch (error) {
    console.error("Error in calculate endpoint:", error);
    
    res.status(500).json({ 
      error: "Failed to process calculation request", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET: Check if a Twitter handle's profile picture matches any NFT
mindshareRouter.get("/nft-check/:handle", async (req: Request, res: Response) => {
  try {
    const handle = req.params.handle;
    
    if (!handle) {
      return res.status(400).json({ error: "Twitter handle is required" });
    }

    // Normalize handle
    const normalizedHandle = handle.replace('@', '').toLowerCase();
    
    // Check NFT match using the service
    const result = await nftPFPMatcherService.checkUserNFTMatch(normalizedHandle, false);
    
    if (!result.success) {
      return res.status(500).json({ 
        error: "Failed to check NFT match", 
        message: result.error 
      });
    }

    // Format response
    const response = {
      handle: normalizedHandle,
      profileImageUrl: result.profileImageUrl,
      hasNFTMatch: !!result.matchedCollection,
      matchedCollection: result.matchedCollection ? {
        id: result.matchedCollection.id,
        name: result.matchedCollection.name,
        type: result.matchedCollection.type,
        similarity: result.matchedCollection.similarity,
        similarityPercentage: (result.matchedCollection.similarity * 100).toFixed(1) + '%'
      } : null,
      topMatches: result.topMatches.map(match => ({
        ...match,
        similarityPercentage: (match.similarity * 100).toFixed(1) + '%'
      })),
      threshold: 80,
      message: result.matchedCollection 
        ? `Profile picture matches NFT collection "${result.matchedCollection.name}" with ${(result.matchedCollection.similarity * 100).toFixed(1)}% similarity`
        : result.profileImageUrl 
          ? `No NFT match found above 80% threshold. Best match: ${result.topMatches[0]?.similarity ? (result.topMatches[0].similarity * 100).toFixed(1) + '%' : 'N/A'}`
          : "No profile image found for this user"
    };

    res.json(response);
  } catch (error) {
    console.error("Error checking NFT match:", error);
    res.status(500).json({ 
      error: "Failed to check NFT match", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET: Search NFTs by name, object_id, object_type, or owner
mindshareRouter.get("/nfts/search", async (req: Request, res: Response) => {
  try {
    const { query, page = "1", limit = "20" } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: "Search query is required" });
    }
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({ error: "Invalid page number" });
    }
    
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({ error: "Invalid limit. Must be between 1 and 100" });
    }
    
    const offset = (pageNum - 1) * limitNum;
    const searchQuery = `%${query}%`;
    
    // Build search conditions based on query length and type
    const conditions = [];
    
    // Always search by name with partial match
    conditions.push(ilike(nfts.name, searchQuery));
    
    // For object_id, use exact match if query is long enough
    if (query.length >= 55) {
      // Likely a full object_id, use exact match
      conditions.push(eq(nfts.objectId, query));
    }
    
    // For object_type, always use exact match
    conditions.push(eq(nfts.objectType, query));
    
    // For owner, use exact match (addresses should be exact)
    conditions.push(eq(nfts.owner, query));
    
    // Combine all conditions with OR
    const whereCondition = or(...conditions);
    
    const [nftResults, countResult] = await Promise.all([
      db.select().from(nfts)
        .where(whereCondition)
        .limit(limitNum)
        .offset(offset)
        .orderBy(desc(nfts.createdAt)),
      // Get total count for pagination
      db.select({ count: sql<number>`count(*)` })
        .from(nfts)
        .where(whereCondition)
    ]);
    
    const totalCount = Number(countResult[0]?.count || 0);
    
    const totalPages = Math.ceil(totalCount / limitNum);
    
    res.json({
      nfts: nftResults,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error("Error searching NFTs:", error);
    res.status(500).json({ 
      error: "Failed to search NFTs", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// POST: Search NFTs by image URL similarity
mindshareRouter.post("/nfts/search-by-image", async (req: Request, res: Response) => {
  try {
    const { imageUrl, limit = 20 } = req.body;
    
    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: "Image URL is required" });
    }
    
    // Validate URL format
    try {
      new URL(imageUrl);
    } catch {
      return res.status(400).json({ error: "Invalid image URL format" });
    }
    
    const limitNum = Math.min(Math.max(parseInt(limit), 1), 100);
    
    console.log(`[Image Search] Processing image URL: ${imageUrl}`);
    
    // Generate embedding for the provided image URL
    const embeddingResult = await imageEmbeddingService.generateEmbeddingFromUrl(imageUrl);
    
    if (!embeddingResult.success || !embeddingResult.embedding) {
      console.error(`[Image Search] Failed to generate embedding for: ${imageUrl}`, embeddingResult.error);
      return res.status(500).json({ 
        error: "Failed to generate image embedding",
        message: embeddingResult.error || "Unknown error"
      });
    }
    
    const embedding = embeddingResult.embedding;
    console.log(`[Image Search] Generated embedding with ${embedding.length} dimensions`);
    
    // Convert embedding array to pgvector format string
    const vectorString = `[${embedding.join(',')}]`;
    
    // Search for similar NFTs using cosine similarity
    // Always return results regardless of similarity score
    // Using <=> operator for cosine distance (0 = identical, 2 = opposite)
    const similarNfts = await db.execute(sql`
      SELECT 
        id,
        object_id as "objectId",
        type,
        object_type as "objectType",
        name,
        description,
        owner,
        image_url as "imageURL",
        holder,
        created_at as "createdAt",
        updated_at as "updatedAt",
        1 - (image_vector <=> ${vectorString}::vector) as similarity,
        (image_vector <=> ${vectorString}::vector) as cosine_distance
      FROM nfts
      WHERE image_vector IS NOT NULL
      ORDER BY image_vector <=> ${vectorString}::vector
      LIMIT ${limitNum}
    `);
    
    console.log(`[Image Search] Found ${similarNfts.rows.length} similar NFTs`);
    if (similarNfts.rows.length > 0) {
      const firstResult = similarNfts.rows[0] as any;
      console.log(`[Image Search] Top result: ${firstResult.name} (${firstResult.objectId}) - Cosine Distance: ${firstResult.cosine_distance}, Similarity: ${firstResult.similarity}`);
    }
    
    // Format results with similarity scores
    // Ensure similarity is between 0 and 1 by clamping negative values
    const results = similarNfts.rows.map((nft: any) => {
      // Cosine similarity should be between -1 and 1, but we want 0 to 1
      // If vectors are normalized, cosine distance is between 0 and 2
      let similarity = parseFloat(nft.similarity);
      
      // Clamp similarity to 0-1 range
      similarity = Math.max(0, Math.min(1, similarity));
      
      return {
        ...nft,
        similarity: similarity,
        similarityPercentage: (similarity * 100).toFixed(1) + '%'
      };
    });
    
    // If no results, check if any NFTs have vectors
    if (results.length === 0) {
      const vectorCount = await db.execute(sql`
        SELECT COUNT(*) as count FROM nfts WHERE image_vector IS NOT NULL
      `);
      const totalVectorCount = parseInt(vectorCount.rows[0]?.count || '0');
      console.log(`[Image Search] Total NFTs with vectors: ${totalVectorCount}`);
      
      if (totalVectorCount === 0) {
        return res.status(503).json({ 
          error: "No NFTs have been indexed with image vectors yet. Please try again later.",
          message: "The image similarity search feature requires NFTs to be processed with image embeddings."
        });
      } else {
        // This shouldn't happen if we have vectors but no results
        console.warn(`[Image Search] Have ${totalVectorCount} NFTs with vectors but no results returned`);
      }
    }
    
    res.json({
      searchType: 'image',
      imageUrl,
      results,
      total: results.length
    });
  } catch (error) {
    console.error("Error searching NFTs by image:", error);
    res.status(500).json({ 
      error: "Failed to search NFTs by image", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// POST: Calculate mindshare metrics (admin-only endpoint)
mindshareRouter.post("/calculate-metrics", isAdmin, async (req: Request, res: Response) => {
  try {
    const timeframe = req.body.timeframe || "week";

    // Create a new date object for the end date and set it to the end of the day (23:59:59.999)
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    
    // Create a new date object for the start date and set it to the beginning of the day (00:00:00.000)
    let startDate = new Date(endDate);
    
    if (timeframe === "day") {
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (timeframe === "week") {
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (timeframe === "month") {
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    } else {
      return res.status(400).json({ 
        error: "Invalid timeframe. Must be 'day', 'week', or 'month'." 
      });
    }
    
    const metrics = await mindshareService.calculateMindshareMetrics(startDate, endDate);
    
    // Clear caches for all projects since metrics were updated
    await clearCacheByPrefix('GET /mindshare/projects');
    
    res.json({
      success: true,
      message: `Calculated mindshare metrics for ${metrics.length} projects over ${timeframe}`,
      projects_updated: metrics.length
    });
  } catch (error) {
    console.error("Error calculating metrics:", error);
    
    res.status(500).json({ 
      error: "Failed to calculate metrics", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET: NFT mindshare statistics
mindshareRouter.get("/nft-collections", async (req: Request, res: Response) => {
  try {
    // Get or compute data with caching
    const nftData = await getOrComputeData(
      req,
      async () => {
        console.log("Cache miss for NFT mindshare data - computing fresh data...");
        
        // Parse timeframe parameter
        const days = parseInt(req.query.days as string || "30");
        const validDays = [7, 14, 30];
        const selectedDays = validDays.includes(days) ? days : 30;
        
        // Calculate date range for active users
        const endDate = new Date();
        const startDate = subDays(endDate, selectedDays);
        
        // Get all active NFT collections
        const collections = await db
          .select({
            id: pfpCollections.id,
            nftName: pfpCollections.nftName,
            nftType: pfpCollections.nftType,
            twitterHandle: pfpCollections.twitterHandle,
            totalSupply: pfpCollections.totalSupply,
            price: pfpCollections.price
          })
          .from(pfpCollections)
          .where(eq(pfpCollections.active, true))
          .orderBy(desc(pfpCollections.ranking));
        
        // Get users with NFT profile pictures who were updated in the selected timeframe
        // Using lastUpdated field which tracks when the user was last updated
        const activeUsersWithNFTs = await db
          .select({
            pfpCollectionId: repUsers.pfpCollectionId,
            count: sql<number>`count(*)::int`
          })
          .from(repUsers)
          .where(
            and(
              isNotNull(repUsers.pfpCollectionId),
              gte(repUsers.lastUpdated, startDate),
              lte(repUsers.lastUpdated, endDate)
            )
          )
          .groupBy(repUsers.pfpCollectionId);
        
        // Get total active users in timeframe
        const totalActiveUsers = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(repUsers)
          .where(
            and(
              gte(repUsers.lastUpdated, startDate),
              lte(repUsers.lastUpdated, endDate)
            )
          );
        
        const totalUsers = totalActiveUsers[0]?.count || 0;
        
        // Create a map of collection counts
        const collectionCounts = new Map(
          activeUsersWithNFTs.map(row => [row.pfpCollectionId, row.count])
        );
        
        // Calculate total users with NFT profile pictures
        const totalUsersWithNFTs = activeUsersWithNFTs.reduce((sum, row) => sum + row.count, 0);
        
        // Calculate mindshare for each collection
        const collectionsWithMindshare = collections.map(collection => {
          const userCount = collectionCounts.get(collection.id) || 0;

          // Calculate percentage based on users with NFT profile pictures only
          const mindsharePercentage = totalUsersWithNFTs > 0 ? (userCount / totalUsersWithNFTs) * 100 : 0;
          
          return {
            id: collection.id,
            nftName: collection.nftName,
            nftType: collection.nftType,
            twitterHandle: collection.twitterHandle,
            totalSupply: collection.totalSupply,
            price: collection.price,
            userCount,
            mindsharePercentage: parseFloat(mindsharePercentage.toFixed(2)),
            totalActiveUsers: totalUsers,
            totalUsersWithNFTs
          };
        });
        
        // Sort by mindshare percentage (highest first)
        collectionsWithMindshare.sort((a, b) => b.mindsharePercentage - a.mindsharePercentage);
        
        // Fetch NFT images for collections with nftType
        const nftTypesToFetch = collectionsWithMindshare
          .filter(c => c.nftType)
          .map(c => c.nftType as string);
        
        const nftImageMap = await suiGraphQLService.fetchMultipleNFTImageUrls(nftTypesToFetch);
        
        // Add image URLs to collections
        const collectionsWithImages = collectionsWithMindshare.map(collection => ({
          ...collection,
          imageUrl: collection.nftType ? nftImageMap.get(collection.nftType) || null : null
        }));
        
        return {
          timeframe: {
            days: selectedDays,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          },
          totalActiveUsers: totalUsers,
          totalUsersWithNFTs,
          totalCollections: collections.length,
          collections: collectionsWithImages
        };
      },
      5 // 5 minute cache
    );
    
    res.json(nftData);
  } catch (error) {
    console.error("Error fetching NFT mindshare data:", error);
    res.status(500).json({ 
      error: "Failed to fetch NFT mindshare data", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET: Users representing a specific NFT collection
mindshareRouter.get("/nft-collections/:id/users", async (req: Request, res: Response) => {
  try {
    const collectionId = parseInt(req.params.id);
    
    if (isNaN(collectionId)) {
      return res.status(400).json({ error: "Invalid collection ID" });
    }
    
    // Use caching for this endpoint too
    const usersData = await getOrComputeData(
      req,
      async () => {
        console.log(`Cache miss for NFT collection users (id: ${collectionId}) - computing fresh data...`);
        
        // First check if collection exists
        const collection = await db
          .select()
          .from(pfpCollections)
          .where(eq(pfpCollections.id, collectionId))
          .limit(1);
        
        if (collection.length === 0) {
          throw new Error("Collection not found");
        }
        
        // Get pagination params
        const page = parseInt(req.query.page as string || "1");
        const limit = parseInt(req.query.limit as string || "50");
        const offset = (page - 1) * limit;
        
        // Get users with this NFT collection
        // Fetch more users than needed to account for filtering
        const usersRaw = await db
          .select({
            id: repUsers.id,
            twitterHandle: repUsers.twitterHandle,
            profileImageUrl: repUsers.profileImageUrl,
            pfpLastCheck: repUsers.pfpLastCheck,
            reputation: repUsers.totalReputation,
            lastActiveAt: repUsers.lastUpdated
          })
          .from(repUsers)
          .where(eq(repUsers.pfpCollectionId, collectionId))
          .orderBy(desc(repUsers.totalReputation))
          .limit(limit * 2) // Fetch double to account for filtering
          .offset(offset);
        
        // Filter users with valid profile images using parallel requests
        const imageCheckPromises = usersRaw.map(async (user) => {
          if (!user.profileImageUrl) return { user, valid: false };
          
          try {
            // Use HEAD request to check if image is accessible
            const response = await fetch(user.profileImageUrl, {
              method: 'HEAD'
            });
            
            return { user, valid: response.ok };
          } catch (error) {
            // Image check failed
            console.log(`Profile image check failed for ${user.twitterHandle}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { user, valid: false };
          }
        });
        
        // Wait for all checks to complete
        const imageCheckResults = await Promise.all(imageCheckPromises);
        
        // Filter and limit to required number
        const users = imageCheckResults
          .filter(result => result.valid)
          .map(result => result.user)
          .slice(0, limit);
        
        // Get total count (approximate - includes all users regardless of image validity)
        // Note: Checking all images would be too expensive
        const totalCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(repUsers)
          .where(eq(repUsers.pfpCollectionId, collectionId));
        
        const total = totalCount[0]?.count || 0;
        
        return {
          collection: collection[0],
          users,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page < Math.ceil(total / limit),
            hasPrevPage: page > 1
          }
        };
      },
      5 // 5 minute cache
    );
    
    res.json(usersData);
  } catch (error) {
    console.error("Error fetching collection users:", error);
    
    if (error instanceof Error && error.message === "Collection not found") {
      return res.status(404).json({ error: "Collection not found" });
    }
    
    res.status(500).json({ 
      error: "Failed to fetch collection users", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// GET: Fetch Tradeport collection details by slugs
mindshareRouter.get("/nft-collections/tradeport-details", async (req: Request, res: Response) => {
  try {
    const { slugs } = req.query;
    
    if (!slugs || typeof slugs !== 'string') {
      return res.status(400).json({ error: 'Slugs parameter is required' });
    }
    
    // Parse slugs from comma-separated string
    const slugArray = slugs.split(',').filter(s => s.trim().length > 0);
    
    if (slugArray.length === 0) {
      return res.status(400).json({ error: 'At least one slug is required' });
    }
    
    if (slugArray.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 slugs allowed per request' });
    }
    
    // Use cache for this endpoint
    const tradeportData = await getOrComputeData(
      req,
      async () => {
        console.log(`Cache miss for Tradeport collection details - fetching fresh data for ${slugArray.length} slugs...`);
        
        try {
          // Fetch collection details from Tradeport
          const collectionsMap = await tradeportService.getCollectionsBySlugs(slugArray);
          
          // Convert map to array for response
          const collections = Array.from(collectionsMap.entries()).map(([slug, collection]) => ({
            slug,
            ...collection,
            formattedFloor: collection.floor ? `${formatMistToSui(collection.floor)} SUI` : null,
            formattedVolume: collection.volume ? formatMistToSui(collection.volume) : null
          }));
          
          return {
            collections,
            total: collections.length,
            requested: slugArray.length,
            missing: slugArray.filter(slug => !collectionsMap.has(slug))
          };
        } catch (error) {
          console.error('Error fetching Tradeport data:', error);
          // Return empty data if Tradeport API fails
          return {
            collections: [],
            total: 0,
            requested: slugArray.length,
            missing: slugArray,
            error: error instanceof Error ? error.message : 'Failed to fetch Tradeport data'
          };
        }
      },
      60 // 60 minute cache for Tradeport data
    );
    
    res.json(tradeportData);
  } catch (error) {
    console.error("Error fetching Tradeport collection details:", error);
    res.status(500).json({ 
      error: "Failed to fetch Tradeport collection details", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});