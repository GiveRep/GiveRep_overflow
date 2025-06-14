import express, { Request, Response } from "express";
import { loyaltyService } from "../services/loyalty-service";
import { twitterMediaService } from "../services/twitter-media-service";
import {
  insertLoyaltyProjectSchema,
  insertProjectTagSchema,
  projectTags,
} from "../../db/loyalty_schema";
import { isAdmin } from "../middleware/auth";
import { db, pool } from "../../db";
import { sql, eq, desc, and, gte, lte, lt, or } from "drizzle-orm";
import { cacheMiddleware } from "../utils/cacheMiddleware";
import { withApiCache, getOrComputeData } from "../utils/apiCache";
import { clearCacheByPrefix, listCacheKeys } from "../utils/cache";
import { getOldCacheKeys, clearOldCache } from "../utils/redisCache";
import { getTwitterUserInfo } from "../services/twitter-user-info-service";
import { mindshareTweets, mindshareProjects } from "../../db/mindshare_schema";
import { giverepUsers as repUsers } from "../../db/giverep_schema";
import { verifyTwitterIdentity } from "../lib/verifyTwitterIdentity";

// Define express Session interface augmentation
declare module "express-session" {
  interface Session {
    twitterHandle?: string;
    adminPassword?: string;
  }
}

// Define cache interval in minutes for different routes
const CACHE_INTERVALS = {
  "GET /projects": 30, // Cache project list for 30 minutes
  "GET /projects/:id": 30, // Cache individual project details for 30 minutes
  "GET /projects/:id/leaderboard": 60, // Cache leaderboard data for 60 minutes (1 hour)
  "GET /projects/:id/metrics": 60, // Cache metrics for 60 minutes (1 hour)
  "GET /projects/:id/members": 10, // Cache members list for 10 minutes
  "GET /admin-dashboard": 30, // Cache admin dashboard data for 30 minutes
  "GET /twitter-user-info/:handle": 1440, // Cache Twitter user info for 1440 minutes (24 hours)
  "GET /projects/:id/stats": 5, // Cache project stats for 5 minutes
};

export const loyaltyRouter = express.Router();

// GET Twitter user info with 1-day TTL cache
loyaltyRouter.get("/twitter-user-info/:handle", async (req: Request, res: Response) => {
  try {
    const handle = req.params.handle;
    
    if (!handle || handle.trim() === '') {
      return res.status(400).json({ error: "Twitter handle is required" });
    }
    
    // Create a cache key that includes the handle (normalized to lowercase)
    const normalizedHandle = handle.toLowerCase();
    
    // Try to get from cache or compute (24 hour TTL defined in CACHE_INTERVALS)
    const cachedData = await getOrComputeData(
      req,
      async () => {
        console.log(`Cache miss for Twitter user info - fetching fresh data for ${normalizedHandle}...`);
        // Get Twitter user info, which internally handles caching with 1-day TTL
        const userInfo = await getTwitterUserInfo(normalizedHandle);
        
        if (!userInfo) {
          // Will be handled in the main try/catch
          throw new Error("Twitter user info not found");
        }
        
        return userInfo;
      },
      CACHE_INTERVALS["GET /twitter-user-info/:handle"]
    );
    
    if (!cachedData) {
      return res.status(404).json({ error: "Twitter user info not found" });
    }
    
    res.json(cachedData);
  } catch (error) {
    console.error(`Error fetching Twitter user info for handle ${req.params.handle}:`, error);
    
    // Special handling for "not found" error
    if (error instanceof Error && error.message === "Twitter user info not found") {
      return res.status(404).json({ error: "Twitter user info not found" });
    }
    
    res.status(500).json({ error: "Failed to fetch Twitter user info" });
  }
});

// GET all loyalty projects - No user-specific membership check (improved caching)
loyaltyRouter.get("/projects", async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.activeOnly !== "false"; // Default to true if not specified

    // Create a cache key that ONLY includes the activeOnly parameter
    // This allows better caching since we're not including user-specific data
    const cacheKey = `loyalty-projects:${activeOnly}`;

    // Try to get from cache first
    const cachedData = await getOrComputeData(
      req,
      async () => {
        console.log(`Cache miss for projects - computing fresh data...`);
        // Note: No twitter handle passed here - we don't check memberships
        return await loyaltyService.getAllProjects(activeOnly);
      },
      CACHE_INTERVALS["GET /projects"]
    );

    res.json(cachedData);
  } catch (error) {
    console.error("Error fetching loyalty projects:", error);
    res.status(500).json({ error: "Failed to fetch loyalty projects" });
  }
});

// Function to handle user memberships request (shared between GET and POST)
const handleUserMembershipsRequest = async (req: Request, res: Response) => {
  try {
    const twitterHandle = req.session?.twitterHandle;

    if (!twitterHandle) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Set no-cache headers to prevent caching by browsers and CDNs
    // This is crucial for ensuring real-time membership status updates
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    // Add specific Cloudflare cache headers
    res.setHeader('CDN-Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    
    // Add a cache-purge identifier with timestamp to force fresh content
    const timestamp = new Date().getTime();
    res.setHeader('X-Cache-Purge-ID', `user-memberships-${timestamp}`);
    
    // In development mode, explicitly log that we're bypassing cache
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode, bypassing cache and returning data directly');
    }
    
    // Get fresh data directly, bypassing Redis cache
    console.log(`Getting all project memberships for user ${twitterHandle}`);
    const startTime = Date.now();
    const memberships = await loyaltyService.getUserProjectMemberships(twitterHandle);
    console.log(`Found ${memberships.length} project memberships for ${twitterHandle} in ${(Date.now() - startTime).toFixed(2)}ms`);
    
    res.json(memberships);
  } catch (error) {
    console.error("Error fetching user memberships:", error);
    res.status(500).json({ error: "Failed to fetch user memberships" });
  }
};

// GET user's membership status for all loyalty projects (legacy support)
// no auth required
loyaltyRouter.get(
  "/user-memberships",
  handleUserMembershipsRequest
);

// POST endpoint for user memberships (not cached by CDNs/proxies since it's POST)
// no auth required
loyaltyRouter.post(
  "/user-memberships",
  handleUserMembershipsRequest
);

// GET a single loyalty project by ID
loyaltyRouter.get("/projects/:id", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id);

    if (isNaN(projectId)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    // Get the twitter handle from session for member status
    const twitterHandle = req.session?.twitterHandle;

    // Cache with the project ID and potentially the user's twitter handle
    const cachedData = await getOrComputeData(
      req,
      async () => {
        console.log(
          `Cache miss for project ${projectId} - fetching fresh data...`
        );
        const project = await loyaltyService.getProjectById(projectId);

        if (!project) {
          // Will be handled in the main try/catch
          throw new Error("Project not found");
        }

        return project;
      },
      CACHE_INTERVALS["GET /projects/:id"]
    );

    if (!cachedData) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json(cachedData);
  } catch (error) {
    console.error(`Error fetching loyalty project ${req.params.id}:`, error);

    // Special handling for "Project not found" error
    if (error instanceof Error && error.message === "Project not found") {
      return res.status(404).json({ error: "Project not found" });
    }

    res.status(500).json({ error: "Failed to fetch loyalty project" });
  }
});

// GET user position within a project leaderboard
loyaltyRouter.get(
  "/projects/:id/user-position",
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      // Get the twitter handle from query or session
      const twitterHandle = (req.query.twitterHandle as string) || req.session?.twitterHandle;

      if (!twitterHandle) {
        return res.status(400).json({ error: "Twitter handle is required" });
      }

      // Parse date range parameters if provided
      const startDate = (req.query.startDate || req.query.start_date) as string | undefined;
      const endDate = (req.query.endDate || req.query.end_date) as string | undefined;

      let startDateTime: Date | undefined;
      let endDateTime: Date | undefined;

      if (startDate) {
        startDateTime = new Date(startDate);
        startDateTime.setHours(0, 0, 0, 0);
        
        if (isNaN(startDateTime.getTime())) {
          return res.status(400).json({ error: "Invalid startDate format. Use YYYY-MM-DD." });
        }
      }

      if (endDate) {
        endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        
        if (isNaN(endDateTime.getTime())) {
          return res.status(400).json({ error: "Invalid endDate format. Use YYYY-MM-DD." });
        }
      }

      // Get the full leaderboard data
      const leaderboardData = await loyaltyService.getProjectLeaderboard(
        projectId,
        startDateTime,
        endDateTime,
        false
      );

      // Find the user's position in the leaderboard
      const userIndex = leaderboardData.findIndex(
        entry => entry.twitter_handle.toLowerCase() === twitterHandle.toLowerCase()
      );

      if (userIndex === -1) {
        // User not found in leaderboard
        return res.status(404).json({ error: "User not found in leaderboard" });
      }

      // Return the user's entry with their rank
      const userEntry = {
        ...leaderboardData[userIndex],
        rank: userIndex + 1
      };

      res.json(userEntry);
    } catch (error) {
      console.error(`Error fetching user position for project ${req.params.id}:`, error);
      res.status(500).json({ error: "Failed to fetch user position" });
    }
  }
);

// GET raw leaderboard data directly from loyalty_leaderboard table
loyaltyRouter.get(
  "/projects/:id/leaderboard-raw",
  async (req: Request, res: Response) => {
    try {
      // Check for admin password
      const { password } = req.query;
      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
      
      if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized. Admin password required." });
      }
      
      const projectId = parseInt(req.params.id);
      
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }
      
      // Start timer for API performance tracking
      const startTime = performance.now();
      
      // Log request details
      console.log(`[Loyalty] Fetching raw leaderboard data for project ${projectId}`);
      
      // Import the schema
      const { loyaltyLeaderboard } = await import("../../db/loyalty_schema");
      
      // Get the latest leaderboard entry directly from the database
      const [leaderboardEntry] = await db
        .select()
        .from(loyaltyLeaderboard)
        .where(eq(loyaltyLeaderboard.project_id, projectId))
        .orderBy(desc(loyaltyLeaderboard.last_calculated))
        .limit(1);
      
      if (!leaderboardEntry) {
        return res.status(404).json({ 
          error: "No leaderboard data found for this project",
          message: "This project either has no leaderboard data cached or is new."
        });
      }
      
      // End timer and log performance
      const endTime = performance.now();
      const duration = (endTime - startTime).toFixed(2);
      console.log(`[Loyalty] Raw leaderboard retrieved in ${duration}ms`);
      
      // Return the raw leaderboard entry with all its data
      res.json(leaderboardEntry);
    } catch (error) {
      console.error("Error fetching raw leaderboard data:", error);
      res.status(500).json({ error: "Failed to fetch raw leaderboard data" });
    }
  }
);

// GET project leaderboard - optimized with direct SQL for speed and caching
// @deprecated - Use /api/v1/loyalty/leaderboard/:projectId instead for accurate eligible tweet metrics
loyaltyRouter.get(
  "/projects/:id/leaderboard",
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      // Debug log the query parameters to check what the frontend is sending
      console.log(`[DEBUG] Leaderboard request query params:`, req.query);

      // Check for both camelCase and snake_case variants
      // Parse date range parameters if provided
      const startDate = (req.query.startDate || req.query.start_date) as
        | string
        | undefined;
      const endDate = (req.query.endDate || req.query.end_date) as
        | string
        | undefined;
      const forceRefresh =
        req.query.forceRefresh === "true" || req.query.force_refresh === "true";
      
      // Parse limit parameter for pagination (default to 50 if not provided)
      const limitParam = req.query.limit || "50";
      const limit = parseInt(limitParam as string, 10);
      
      // Parse includeAll parameter to return all data without date filtering
      const includeAll = req.query.includeAll === "true";
      
      // Parse Twitter handle for user position in leaderboard (if provided)
      const userTwitterHandle = req.query.twitterHandle as string | undefined;

      console.log(
        `[DEBUG] Using startDate=${startDate}, endDate=${endDate}, forceRefresh=${forceRefresh}, limit=${limit}, includeAll=${includeAll}, userTwitterHandle=${userTwitterHandle}`
      );

      let startDateTime: Date | undefined;
      let endDateTime: Date | undefined;

      if (startDate) {
        // Parse the start date
        startDateTime = new Date(startDate);

        // Start at beginning of day (00:00:00.000)
        startDateTime.setHours(0, 0, 0, 0);

        // Log for debugging
        console.log(
          "[loyalty] Processing startDate:",
          startDate,
          "-> using date:",
          startDateTime.toISOString()
        );

        if (isNaN(startDateTime.getTime())) {
          return res
            .status(400)
            .json({ error: "Invalid startDate format. Use YYYY-MM-DD." });
        }
      }

      if (endDate) {
        // Parse the end date
        endDateTime = new Date(endDate);

        // Set time to end of day to include all tweets from this day
        endDateTime.setHours(23, 59, 59, 999);

        // Log for debugging
        console.log(
          "[loyalty] Processing endDate:",
          endDate,
          "-> using date:",
          endDateTime.toISOString()
        );

        if (isNaN(endDateTime.getTime())) {
          return res
            .status(400)
            .json({ error: "Invalid endDate format. Use YYYY-MM-DD." });
        }
      }

      // If forceRefresh is true, skip cache and fetch fresh data (for admin or development use)
      // If includeAll parameter is true, override date range to get all data
      if (includeAll) {
        console.log(`Including ALL data for project ${projectId} with no date filtering (includeAll=true)`);
        // Clear date filters to get complete dataset
        startDateTime = undefined;
        endDateTime = undefined;
        
        // Can't modify forceRefresh directly as it's a const, but we'll handle that case separately
      }
      
      // Use a modified version of forceRefresh that includes the includeAll case
      const shouldForceRefresh = forceRefresh || includeAll;

      if (shouldForceRefresh) {
        console.log(
          `Forcing refresh of leaderboard data for project ${projectId}`
        );
        const leaderboard = await loyaltyService.getProjectLeaderboard(
          projectId,
          startDateTime,
          endDateTime,
          true // Force calculation
        );
        return res.json(leaderboard);
      }

      // Try to get from cache or compute
      const cachedData = await getOrComputeData(
        req,
        async () => {
          console.log(
            `Cache miss for leaderboard of project ${projectId} - computing fresh data...`
          );
          return await loyaltyService.getProjectLeaderboard(
            projectId,
            startDateTime,
            endDateTime,
            false // Use cached if available
          );
        },
        CACHE_INTERVALS["GET /projects/:id/leaderboard"]
      );

      // Log information about the results
      if (cachedData.length > 0) {
        console.log(
          `Returning ${cachedData.length} members in leaderboard for project ${projectId}`
        );

        // Special debug for the willnigri issue
        const willnigri = cachedData.find(
          (e) => e.twitter_handle.toLowerCase() === "willnigri"
        );

        if (willnigri) {
          console.log(
            `willnigri found at position ${
              cachedData.indexOf(willnigri) + 1
            } with ${willnigri.views} views and ${willnigri.tweet_count} tweets`
          );
        }
      } else {
        console.log(`No members found for project ${projectId} leaderboard`);
      }

      // If a specific Twitter handle is provided, add isCurrentUser flag
      if (userTwitterHandle) {
        // Find the user's entry in the complete leaderboard
        const userEntry = cachedData.find(
          entry => entry.twitter_handle.toLowerCase() === userTwitterHandle.toLowerCase()
        );
        
        if (userEntry) {
          // Mark the user's entry with isCurrentUser=true 
          // Use type casting to assure TypeScript these properties are allowed
          (userEntry as any).isCurrentUser = true;
          // Add the rank to the user's entry
          (userEntry as any).rank = cachedData.indexOf(userEntry) + 1;
          
          console.log(`Found user ${userTwitterHandle} at position ${(userEntry as any).rank} in leaderboard`);
        }
      }
      
      // Get search handle parameter for direct position lookup
      const searchHandle = req.query.search as string | undefined;
      
      // Search for a specific handle if provided
      if (searchHandle && searchHandle.trim() !== '') {
        const normalizedSearchHandle = searchHandle.toLowerCase().trim();
        console.log(`Searching for user with handle: ${normalizedSearchHandle}`);
        
        // Find the user's position in the full leaderboard
        const userPosition = cachedData.findIndex(
          entry => entry.twitter_handle.toLowerCase() === normalizedSearchHandle
        );
        
        if (userPosition !== -1) {
          // Calculate which page this user would be on
          const pageSize = limit || 20; // Default to 20 if no limit specified
          const userPage = Math.floor(userPosition / pageSize) + 1;
          const offset = (userPage - 1) * pageSize;
          
          console.log(`Found user ${normalizedSearchHandle} at position ${userPosition + 1}, page ${userPage}`);
          
          // Return the entries for that page, along with total count and user's position
          return res.json({
            entries: cachedData.slice(offset, offset + pageSize),
            total: cachedData.length,
            userPosition: userPosition + 1,
            currentPage: userPage
          });
        } else {
          console.log(`User ${normalizedSearchHandle} not found in leaderboard`);
          // User not found, return first page with empty user position
          return res.json({
            entries: cachedData.slice(0, limit || 20),
            total: cachedData.length,
            userPosition: null,
            currentPage: 1
          });
        }
      }
      
      // If offset and limit are provided, apply pagination
      const offset = parseInt(req.query.offset as string) || 0;
      
      // Apply pagination with offset and limit
      if (!isNaN(offset) && offset >= 0 && !isNaN(limit) && limit > 0) {
        console.log(`Applying pagination with offset ${offset} and limit ${limit} to leaderboard`);
        
        return res.json({
          entries: cachedData.slice(offset, offset + limit),
          total: cachedData.length,
          currentPage: Math.floor(offset / limit) + 1
        });
      }
      
      // If only limit is provided (backward compatibility)
      if (!isNaN(limit) && limit > 0) {
        console.log(`Applying pagination limit of ${limit} entries to leaderboard`);
        
        return res.json({
          entries: cachedData.slice(0, limit),
          total: cachedData.length,
          currentPage: 1
        });
      }

      // Return all entries if no pagination parameters
      return res.json({
        entries: cachedData,
        total: cachedData.length,
        currentPage: 1
      });
    } catch (error) {
      console.error(
        `Error fetching leaderboard for project ${req.params.id}:`,
        error
      );
      res.status(500).json({ error: "Failed to fetch project leaderboard" });
    }
  }
);

// POST create a new loyalty project (admin only)
loyaltyRouter.post(
  "/projects",
  isAdmin,
  async (req: Request, res: Response) => {
    try {
      // Transform data before validation
      const transformedBody = {
        ...req.body,
        // Convert date strings to Date objects
        start_time: req.body.start_time ? new Date(req.body.start_time) : undefined,
        end_time: req.body.end_time ? new Date(req.body.end_time) : undefined,
        // Convert price_per_view to string if it's a number (numeric fields in PostgreSQL are strings)
        price_per_view: req.body.price_per_view !== undefined ? String(req.body.price_per_view) : undefined
      };
      
      const parseResult = insertLoyaltyProjectSchema.safeParse(transformedBody);

      if (!parseResult.success) {
        console.error(`[loyalty] POST /projects validation failed:`, {
          errors: parseResult.error.errors,
          receivedData: req.body,
          path: req.path,
          method: req.method
        });
        return res.status(400).json({
          error: "Invalid project data",
          details: parseResult.error.errors,
        });
      }

      const project = await loyaltyService.createProject(parseResult.data);

      // Clear the projects list cache since a new project was added
      try {
        await clearCacheByPrefix("/loyalty/projects:");
        console.log("Cleared projects list cache after creating new project");
      } catch (cacheError) {
        console.error(
          "Error clearing cache after creating new project:",
          cacheError
        );
        // Continue with the response even if cache clearing fails
      }

      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating loyalty project:", error);
      res.status(500).json({ error: "Failed to create loyalty project" });
    }
  }
);

// PUT update an existing loyalty project (admin only)
loyaltyRouter.put(
  "/projects/:id",
  isAdmin,
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      // Transform date strings to Date objects and numeric fields to strings before validation
      const transformedBody = {
        ...req.body,
        start_time: req.body.start_time ? new Date(req.body.start_time) : undefined,
        end_time: req.body.end_time ? new Date(req.body.end_time) : undefined,
        // Convert price_per_view to string if it's a number (numeric fields in PostgreSQL are strings)
        price_per_view: req.body.price_per_view !== undefined ? String(req.body.price_per_view) : undefined
      };

      const parseResult = insertLoyaltyProjectSchema
        .partial()
        .safeParse(transformedBody);

      if (!parseResult.success) {
        console.error(`[loyalty] PUT /projects/${projectId} validation failed:`, {
          errors: parseResult.error.errors.map(err => ({
            path: err.path,
            message: err.message,
            code: err.code,
            expected: err.expected,
            received: err.received
          })),
          receivedData: req.body,
          transformedData: transformedBody,
          receivedDataTypes: Object.entries(req.body).reduce((acc, [key, val]) => {
            acc[key] = typeof val;
            return acc;
          }, {} as Record<string, string>),
          transformedDataTypes: Object.entries(transformedBody).reduce((acc, [key, val]) => {
            acc[key] = typeof val;
            return acc;
          }, {} as Record<string, string>),
          path: req.path,
          method: req.method
        });
        
        return res.status(400).json({
          error: "Invalid project data",
          details: parseResult.error.errors,
        });
      }

      const updatedProject = await loyaltyService.updateProject(
        projectId,
        parseResult.data
      );

      if (!updatedProject) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Clear all project-related caches
      try {
        // Clear project details cache
        await clearCacheByPrefix(`/loyalty/projects/${projectId}`);

        // Clear projects list cache since this project was updated
        await clearCacheByPrefix("/loyalty/projects:");

        console.log(`Cleared cache for updated project ${projectId}`);
      } catch (cacheError) {
        console.error(
          `Error clearing cache for project ${projectId}:`,
          cacheError
        );
        // Continue with the response even if cache clearing fails
      }

      res.json(updatedProject);
    } catch (error) {
      console.error(`Error updating loyalty project ${req.params.id}:`, error);
      res.status(500).json({ error: "Failed to update loyalty project" });
    }
  }
);

// POST join a loyalty project
// Twitter OAuth verification required
loyaltyRouter.post(
  "/projects/:id/join",
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      // Get Twitter handle from request body
      const { twitterHandle } = req.body;

      if (!twitterHandle) {
        return res.status(400).json({ error: "Twitter handle is required" });
      }

      // Verify Twitter identity using OAuth tokens
      const verificationResult = await verifyTwitterIdentity(req, twitterHandle);
      
      if (!verificationResult.success) {
        console.log(`[Loyalty] Twitter verification failed for @${twitterHandle}: ${verificationResult.message}`);
        return res.status(401).json({ 
          error: verificationResult.message || 'Twitter authentication failed. Please reconnect your Twitter account.'
        });
      }

      console.log(`[Loyalty] Verified Twitter user @${twitterHandle} joining project ${projectId}`);

      const member = await loyaltyService.joinProject(projectId, twitterHandle);

      // Clear the cache for project members and details
      try {
        // Clear project members cache
        await clearCacheByPrefix(`/loyalty/projects/${projectId}/members`);

        // Clear project details cache to update member count
        await clearCacheByPrefix(`/loyalty/projects/${projectId}:`);

        // Clear user memberships cache since a new membership was added
        await clearCacheByPrefix(`loyalty-user-memberships:${twitterHandle}`);

        console.log(
          `Cleared cache for project ${projectId} after new member joined`
        );
      } catch (cacheError) {
        console.error(
          `Error clearing cache after joining project ${projectId}:`,
          cacheError
        );
        // Continue with the response even if cache clearing fails
      }

      // Set no-cache headers to prevent caching by browsers and CDNs
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');

      res.json({
        success: true,
        message: "Successfully joined the loyalty program",
        member,
      });
    } catch (error) {
      console.error(`Error joining loyalty project ${req.params.id}:`, error);

      // Check if this is a follower count error
      if (
        error instanceof Error &&
        error.message.includes("follower count requirement not met")
      ) {
        // Send a 403 Forbidden status with the specific error message
        return res.status(403).json({
          error: error.message,
          type: "follower_requirement",
        });
      }

      // Generic error response for other errors
      res.status(500).json({ error: "Failed to join loyalty project" });
    }
  }
);

// POST leave a loyalty project
// Twitter OAuth verification required
loyaltyRouter.post(
  "/projects/:id/leave",
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      // Get Twitter handle from request body
      const { twitterHandle } = req.body;

      if (!twitterHandle) {
        return res.status(400).json({ error: "Twitter handle is required" });
      }

      // Verify Twitter identity using OAuth tokens
      const verificationResult = await verifyTwitterIdentity(req, twitterHandle);
      
      if (!verificationResult.success) {
        console.log(`[Loyalty] Twitter verification failed for @${twitterHandle}: ${verificationResult.message}`);
        return res.status(401).json({ 
          error: verificationResult.message || 'Twitter authentication failed. Please reconnect your Twitter account.'
        });
      }

      console.log(`[Loyalty] Verified Twitter user @${twitterHandle} leaving project ${projectId}`);

      await loyaltyService.leaveProject(projectId, twitterHandle);

      // Clear the cache for project members and details
      try {
        // Clear project members cache
        await clearCacheByPrefix(`/loyalty/projects/${projectId}/members`);

        // Clear project details cache to update member count
        await clearCacheByPrefix(`/loyalty/projects/${projectId}:`);

        // Also clear the leaderboard cache for this project
        await clearCacheByPrefix(`/loyalty/projects/${projectId}/leaderboard`);

        // Clear user memberships cache
        await clearCacheByPrefix(`loyalty-user-memberships:${twitterHandle}`);

        console.log(`Cleared cache for project ${projectId} after member left`);
      } catch (cacheError) {
        console.error(
          `Error clearing cache after leaving project ${projectId}:`,
          cacheError
        );
        // Continue with the response even if cache clearing fails
      }

      // Set no-cache headers to prevent caching by browsers and CDNs
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');

      res.json({
        success: true,
        message: "Successfully left the loyalty program",
      });
    } catch (error) {
      console.error(`Error leaving loyalty project ${req.params.id}:`, error);
      res.status(500).json({ error: "Failed to leave loyalty project" });
    }
  }
);

// POST join all loyalty projects
// Twitter OAuth verification required
loyaltyRouter.post(
  "/join-all",
  async (req: Request, res: Response) => {
    try {
      // Get Twitter handle from request body
      const { twitterHandle } = req.body;

      if (!twitterHandle) {
        return res.status(400).json({ error: "Twitter handle is required" });
      }

      // Verify Twitter identity using OAuth tokens
      const verificationResult = await verifyTwitterIdentity(req, twitterHandle);
      
      if (!verificationResult.success) {
        console.log(`[Loyalty] Twitter verification failed for @${twitterHandle}: ${verificationResult.message}`);
        return res.status(401).json({ 
          error: verificationResult.message || 'Twitter authentication failed. Please reconnect your Twitter account.'
        });
      }

      console.log(`[Loyalty] Verified Twitter user @${twitterHandle} joining all projects`);

      const joinedCount = await loyaltyService.joinAllProjects(twitterHandle);

      // Since multiple projects could have been joined, clear the projects list cache
      try {
        // Clear projects list cache after bulk join operation
        await clearCacheByPrefix("/loyalty/projects:");
        
        // Also clear the user memberships cache
        await clearCacheByPrefix(`loyalty-user-memberships:${twitterHandle}`);
        
        console.log(
          `Cleared projects list cache after joining ${joinedCount} projects`
        );
      } catch (cacheError) {
        console.error(
          "Error clearing cache after joining multiple projects:",
          cacheError
        );
        // Continue with the response even if cache clearing fails
      }

      // Set no-cache headers to prevent caching by browsers and CDNs
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');

      res.json({
        success: true,
        message: `Successfully joined ${joinedCount} loyalty programs`,
        joinedCount,
      });
    } catch (error) {
      console.error("Error joining all loyalty projects:", error);

      // Set no-cache headers to prevent caching by browsers and CDNs
      // Important even for partial failure responses
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');

      // Even if some projects failed due to follower count, we still return success
      // This is handled in the client showing how many projects were joined
      res.status(200).json({
        success: true,
        message: `Joined some loyalty programs. Some may require more followers.`,
        joinedCount: 0,
        partialSuccess: true,
      });
    }
  }
);

// GET project tweets - fetch tweets from loyalty members
// @deprecated - Use /api/v1/loyalty/projects/:projectId/tweets instead for tweets with eligibility status
loyaltyRouter.get(
  "/projects/:id/tweets",
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }
      
      // Parse query parameters
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;
      const sortBy = (req.query.sortBy as string) || 'engagement';
      const days = parseInt(req.query.days as string) || 7;
      const authorHandle = req.query.authorHandle as string | undefined;
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // Cache key based on all parameters
      const cacheKey = `loyalty-tweets:${projectId}:${days}:${sortBy}:${limit}:${offset}`;
      
      const cachedData = await getOrComputeData(
        req,
        async () => {
          console.log(`Cache miss for tweets of loyalty project ${projectId} - fetching fresh data...`);
          
          // Get project info
          const project = await loyaltyService.getProjectById(projectId);
          
          if (!project) {
            return {
              project_id: projectId,
              tweet_count: 0,
              tweets: []
            };
          }
          
          // Find the corresponding mindshare project
          const [mindshareProject] = await db.select()
            .from(mindshareProjects)
            .where(sql`LOWER(${mindshareProjects.twitter_handle}) = LOWER(${project.twitter_handle})`)
            .limit(1);
            
          if (!mindshareProject) {
            return {
              project_id: projectId,
              project_name: project.name,
              tweet_count: 0,
              tweets: []
            };
          }
          
          // First get all active members of the project
          const members = await loyaltyService.getProjectMembers(projectId);
          const memberHandles = members.map(m => m.twitter_handle.toLowerCase());
          
          if (memberHandles.length === 0) {
            return {
              project_id: projectId,
              project_name: project.name,
              tweet_count: 0,
              tweets: []
            };
          }
          
          // If authorHandle is provided, filter to only that author
          const filteredHandles = authorHandle 
            ? memberHandles.filter(h => h === authorHandle.toLowerCase())
            : memberHandles;
          
          if (filteredHandles.length === 0) {
            return {
              project_id: projectId,
              project_name: project.name,
              tweet_count: 0,
              tweets: []
            };
          }
          
          // Build the query to get tweets from these members
          let query = db
            .select({
              id: mindshareTweets.id,
              tweet_id: mindshareTweets.tweet_id,
              author_handle: mindshareTweets.user_handle,
              content: mindshareTweets.content,
              posted_at: mindshareTweets.created_at,
              views: mindshareTweets.views,
              likes: mindshareTweets.likes,
              retweets: mindshareTweets.retweets,
              replies: mindshareTweets.replies,
              tweet_link: sql<string>`'https://twitter.com/' || ${mindshareTweets.user_handle} || '/status/' || ${mindshareTweets.tweet_id}`,
              eligible_for_loyalty: sql<boolean>`true`,
              collected_by_keywords: sql<string[]>`ARRAY[${mindshareTweets.keyword_id}::text]`,
            })
            .from(mindshareTweets)
            .where(
              and(
                eq(mindshareTweets.project_id, mindshareProject.id),
                sql`LOWER(${mindshareTweets.user_handle}) = ANY(ARRAY[${sql.join(filteredHandles.map(h => sql`${h}`), sql`, `)}]::text[])`,
                gte(mindshareTweets.created_at, startDate),
                lte(mindshareTweets.created_at, endDate)
              )
            );
          
          // Apply sorting
          if (sortBy === 'views') {
            query = query.orderBy(desc(mindshareTweets.views));
          } else if (sortBy === 'date') {
            query = query.orderBy(desc(mindshareTweets.created_at));
          } else {
            // Default to engagement (likes + retweets + replies)
            query = query.orderBy(
              desc(sql`COALESCE(${mindshareTweets.likes}, 0) + COALESCE(${mindshareTweets.retweets}, 0) + COALESCE(${mindshareTweets.replies}, 0)`)
            );
          }
          
          // Apply pagination
          query = query.limit(limit).offset(offset);
          
          const tweets = await query;
          
          return {
            project_id: projectId,
            project_name: project.name,
            tweet_count: tweets.length,
            tweets: tweets.map(tweet => ({
              id: tweet.id,
              tweet_id: tweet.tweet_id,
              author_handle: tweet.author_handle,
              content: tweet.content,
              posted_at: tweet.posted_at?.toISOString(),
              views: tweet.views || 0,
              likes: tweet.likes || 0,
              retweets: tweet.retweets || 0,
              replies: tweet.replies || 0,
              engagement: (tweet.likes || 0) + (tweet.retweets || 0) + (tweet.replies || 0),
              tweet_link: tweet.tweet_link,
              eligible_for_loyalty: tweet.eligible_for_loyalty,
              collected_by_keywords: tweet.collected_by_keywords
            }))
          };
        },
        5 // Cache for 5 minutes
      );
      
      res.json(cachedData);
    } catch (error) {
      console.error(`Error fetching tweets for loyalty project ${req.params.id}:`, error);
      res.status(500).json({ error: "Failed to fetch project tweets" });
    }
  }
);

// GET project members - requires admin auth if password is provided
loyaltyRouter.get(
  "/projects/:id/members",
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      // If password is provided, validate admin access
      const providedPassword = req.query.password as string;
      const forceRefresh =
        req.query.forceRefresh === "true" || req.query.force_refresh === "true";
      let isAdminRequest = false;

      if (providedPassword) {
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminPassword || providedPassword !== adminPassword) {
          return res.status(403).json({
            error: "Admin authentication required",
            message: "Invalid admin password provided",
          });
        }

        isAdminRequest = true;
      }

      // For admin requests or when forcing refresh, skip cache
      if (isAdminRequest && forceRefresh) {
        console.log(
          `Admin requested fresh data for members of project ${projectId}`
        );
        const members = await loyaltyService.getProjectMembers(projectId);
        return res.json(members);
      }

      // Get cached or compute fresh data
      const cachedData = await getOrComputeData(
        req,
        async () => {
          console.log(
            `Cache miss for members of project ${projectId} - fetching fresh data...`
          );
          return await loyaltyService.getProjectMembers(projectId);
        },
        CACHE_INTERVALS["GET /projects/:id/members"]
      );

      res.json(cachedData);
    } catch (error) {
      console.error(
        `Error fetching members for project ${req.params.id}:`,
        error
      );
      res.status(500).json({ error: "Failed to fetch project members" });
    }
  }
);

// POST calculate metrics for a project (admin only)
loyaltyRouter.post(
  "/projects/:id/calculate-metrics",
  isAdmin,
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      // Clear any cached data for this project's leaderboard
      try {
        await clearCacheByPrefix(`/loyalty/projects/${projectId}/leaderboard`);
        console.log(
          `Cleared leaderboard cache for project ${projectId} before recalculating metrics`
        );
      } catch (clearError) {
        console.error(
          `Error clearing cache before metrics calculation for project ${projectId}:`,
          clearError
        );
        // Continue with metrics calculation even if cache clearing fails
      }

      const result = await loyaltyService.calculateProjectMetrics(projectId);

      // After calculating metrics, generate and cache the leaderboard
      try {
        // This will calculate and cache the leaderboard - use forceCalculation=true for admin operations
        const leaderboard = await loyaltyService.getProjectLeaderboard(
          projectId,
          undefined,
          undefined,
          true
        );

        // Also clear the project details cache since metrics affect the project display
        await clearCacheByPrefix(`/loyalty/projects/${projectId}:`);

        res.json({
          success: true,
          message: `Calculated metrics for ${result.updatedMembers} members (${result.totalTweets} tweets). Leaderboard cached with ${leaderboard.length} entries.`,
          ...result,
          leaderboardSize: leaderboard.length,
          leaderboardCached: leaderboard.length > 0,
        });
      } catch (cacheError) {
        console.error(
          `Error caching leaderboard for project ${projectId}:`,
          cacheError
        );

        // Still return success for metrics calculation
        res.json({
          success: true,
          message: `Calculated metrics for ${result.updatedMembers} members (${result.totalTweets} tweets). Leaderboard caching failed.`,
          ...result,
          leaderboardCached: false,
        });
      }
    } catch (error) {
      console.error(
        `Error calculating metrics for project ${req.params.id}:`,
        error
      );
      res.status(500).json({ error: "Failed to calculate project metrics" });
    }
  }
);

// GET project stats for a specified date range (for the popup)
// @deprecated - Use /api/v1/loyalty/leaderboard/:projectId instead for accurate eligible tweet stats
loyaltyRouter.get(
  "/projects/:id/stats",
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      // Parse date parameters
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ error: "Valid startDate and endDate are required" });
      }

      // Create endDate with time set to end of day
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setHours(23, 59, 59, 999);

      // Get the project
      const project = await loyaltyService.getProjectById(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Find the corresponding mindshare project
      const [mindshareProject] = await db.select()
        .from(mindshareProjects)
        .where(sql`LOWER(${mindshareProjects.twitter_handle}) = LOWER(${project.twitter_handle})`)
        .limit(1);

      if (!mindshareProject) {
        return res.status(404).json({ error: "Corresponding mindshare project not found" });
      }

      // Get the aggregate stats for the specified date range using raw SQL
      // for better compatibility and to avoid query construction issues
      const statsQuery = `
        SELECT 
          COUNT(*) as tweet_count,
          COALESCE(SUM(views), 0) as views,
          COALESCE(SUM(likes), 0) as likes,
          COALESCE(SUM(retweets), 0) as retweets,
          COALESCE(SUM(replies), 0) as replies
        FROM 
          mindshare_tweets
        WHERE 
          project_id = $1
          AND created_at >= $2
          AND created_at <= $3
      `;

      const { rows } = await pool.query(statsQuery, [
        mindshareProject.id,
        startDate.toISOString(),
        adjustedEndDate.toISOString()
      ]);

      // Return the stats
      res.json({
        success: true,
        project_id: projectId,
        project_name: project.name,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        stats: {
          tweets: Number(rows[0]?.tweet_count || 0),
          views: Number(rows[0]?.views || 0),
          likes: Number(rows[0]?.likes || 0),
          retweets: Number(rows[0]?.retweets || 0),
          replies: Number(rows[0]?.replies || 0)
        }
      });
    } catch (error) {
      console.error(`Error fetching stats for project ${req.params.id}:`, error);
      res.status(500).json({ error: "Failed to fetch project stats" });
    }
  }
);

// POST calculate metrics for all projects (admin only)
loyaltyRouter.post(
  "/calculate-all-metrics",
  isAdmin,
  async (req: Request, res: Response) => {
    try {
      // Clear relevant caches before recalculating metrics for all projects
      try {
        // Clear all leaderboard caches
        await clearCacheByPrefix("/loyalty/projects");
        console.log(
          "Cleared all project-related caches before recalculating all metrics"
        );
      } catch (clearError) {
        console.error(
          "Error clearing caches before calculating all metrics:",
          clearError
        );
        // Continue with metrics calculation even if cache clearing fails
      }

      const result = await loyaltyService.calculateAllProjectMetrics();

      // Include information about leaderboard caching in the response
      // Format tweet counts with commas to make it more readable
      const formattedTweets = result.totalTweets.toLocaleString();

      res.json({
        success: true,
        message: `Calculated metrics for ${result.projectsUpdated} projects, ${result.membersUpdated} members (${formattedTweets} tweets). Cached ${result.leaderboardsCached} leaderboards.`,
        ...result,
      });
    } catch (error) {
      console.error("Error calculating metrics for all projects:", error);
      res.status(500).json({ error: "Failed to calculate metrics" });
    }
  }
);

// POST recalculate spending for all projects based on existing metrics (admin only)
loyaltyRouter.post(
  "/recalculate-spending",
  isAdmin,
  async (req: Request, res: Response) => {
    try {
      console.log("[DEBUG] Starting recalculation of incentive spending...");

      // Clear project caches before recalculating since spending affects project display
      try {
        // Primarily clear project details caches since spending affects those most directly
        await clearCacheByPrefix("/loyalty/projects");
        console.log("Cleared project caches before recalculating spending");
      } catch (clearError) {
        console.error(
          "Error clearing caches before recalculating spending:",
          clearError
        );
        // Continue with spending recalculation even if cache clearing fails
      }

      const result = await loyaltyService.recalculateAllProjectSpending();

      // Format the totalSpent as a dollar amount with 2 decimal places
      const formattedSpent = result.totalSpent.toFixed(2);

      console.log(
        `[DEBUG] Recalculation complete: ${result.updatedProjects} projects, ${result.totalViews} views, $${formattedSpent} spent`
      );

      return res.json({
        success: true,
        message: `Recalculated spending for ${result.updatedProjects} projects: ${result.totalViews} views = $${formattedSpent} spent`,
        updatedProjects: result.updatedProjects,
        totalViews: result.totalViews,
        totalSpent: parseFloat(formattedSpent), // Ensure we return a properly formatted number
      });
    } catch (error) {
      console.error("Error recalculating spending for projects:", error);
      return res.status(500).json({ error: "Failed to recalculate spending" });
    }
  }
);

// GET Twitter profile and banner images for a handle
loyaltyRouter.get(
  "/twitter-media/:handle",
  async (req: Request, res: Response) => {
    try {
      const handle = req.params.handle;

      if (!handle) {
        return res.status(400).json({ error: "Twitter handle is required" });
      }

      // Cache Twitter media for 24 hours (1440 minutes) since profile images rarely change
      const TWITTER_MEDIA_CACHE_MINUTES = 1440;

      // For Twitter media requests, we keep a longer cache time since profile images don't change often
      const cachedData = await getOrComputeData(
        req,
        async () => {
          console.log(
            `Cache miss for Twitter media for handle ${handle} - fetching fresh data...`
          );
          return await twitterMediaService.fetchProfileImages(handle);
        },
        TWITTER_MEDIA_CACHE_MINUTES
      );

      res.json(cachedData);
    } catch (error) {
      console.error(
        `Error fetching Twitter media for ${req.params.handle}:`,
        error
      );
      res.status(500).json({ error: "Failed to fetch Twitter media" });
    }
  }
);

// DELETE a loyalty project (admin only)
loyaltyRouter.delete(
  "/projects/:id",
  isAdmin,
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      const success = await loyaltyService.deleteProject(projectId);

      if (!success) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Clear all caches related to this project and the projects list
      try {
        // Clear all caches for this project
        await clearCacheByPrefix(`/loyalty/projects/${projectId}`);

        // Clear the projects list cache since a project was deleted
        await clearCacheByPrefix("/loyalty/projects:");

        console.log(`Cleared all caches for deleted project ${projectId}`);
      } catch (cacheError) {
        console.error(
          `Error clearing cache for deleted project ${projectId}:`,
          cacheError
        );
        // Continue with the response even if cache clearing fails
      }

      res.json({
        success: true,
        message: "Project deleted successfully",
      });
    } catch (error) {
      console.error(`Error deleting loyalty project ${req.params.id}:`, error);
      res.status(500).json({ error: "Failed to delete loyalty project" });
    }
  }
);

// Tags API Endpoints have been moved to a standalone endpoint at /api/giverep/tags
// See server/routes/tags.ts for implementation

// Cache management endpoints have been moved to the admin router
// See server/routes/admin.ts for the implementation
