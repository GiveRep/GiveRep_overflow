import {
  db,
  getReadDatabase,
  getWriteDatabase,
  pool,
  readDb,
} from "../../db/index";
import { calculateMetricDifference } from "../utils/tweetValidation";
import {
  InsertLoyaltyProject,
  loyaltyDailyTweets,
  loyaltyLeaderboard,
  LoyaltyMember,
  loyaltyMembers,
  loyaltyMetrics,
  LoyaltyMetrics,
  LoyaltyProject,
  loyaltyProjects,
} from "../../db/loyalty_schema";

import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { giverepUsers } from "../../db/giverep_schema";
import {
  mindshareProjects,
  MindshareTweet,
  mindshareTweets,
} from "../../db/mindshare_schema";
import { repUsers } from "../../db/reputation_schema";
import { twitterMediaService } from "../services/twitter-media-service";
import { fetchUserInfo } from "../twitter-service";
import { getCachedValue, setCachedValue } from "../utils/cache";
import { repPointsService } from "./rep-points-service";
import { getTwitterUserInfo } from "./twitter-user-info-service";

function log(message: string, source: string = "loyalty") {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${source}] ${message}`);
}

// Extended types for UI display
export interface ExtendedLoyaltyProject extends LoyaltyProject {
  memberCount?: number;
  isUserMember?: boolean;
}

export interface ExtendedLoyaltyMember extends LoyaltyMember {
  username?: string;
  profilePicture?: string;
  profileUrl?: string;
  metrics?: LoyaltyMetrics;
}

export interface LeaderboardEntry {
  twitter_handle: string;
  twitter_id?: string;
  username?: string;
  profilePicture?: string;
  profileUrl?: string;
  tweet_count: number;
  views: number;
  likes: number;
  retweets: number;
  replies: number;
  joined_at: Date;
  twitterUrl?: string;
  estimated_pay?: number; // Estimated pay in dollars (if project is incentivized)
}

// Twitter profile info interface
interface TwitterProfileInfo {
  id?: number;
  name?: string;
  username?: string;
  profile_image_url?: string;
  description?: string;
  followers_count?: number;
  verified?: boolean;
}

export class LoyaltyService {
  /**
   * Get Twitter profile information for a given handle
   * @param handle Twitter handle (without @ symbol)
   * @returns Twitter profile information or null if not found
   */
  async getTwitterProfileInfo(
    handle: string
  ): Promise<TwitterProfileInfo | null> {
    try {
      const normalizedHandle = handle.replace("@", "").toLowerCase();

      // Fetch profile info from the Twitter user info API
      // Construct a proper absolute URL with the protocol and host
      const baseUrl = process.env.BASE_URL || "http://localhost:5001";
      const apiUrl = new URL(
        `/api/twitter-user-info/${normalizedHandle}`,
        baseUrl
      );
      const response = await fetch(apiUrl.toString());

      if (!response.ok) {
        console.log(
          `Could not fetch Twitter profile for ${handle}: ${response.status}`
        );
        return null;
      }

      const userInfo = await response.json();
      return userInfo;
    } catch (error) {
      console.error(`Error fetching Twitter profile for ${handle}:`, error);
      return null;
    }
  }
  /**
   * Get total metrics for a project
   */
  async getProjectTotalMetrics(projectId: number) {
    try {
      const result = await readDb
        .select({
          total_views: sql`SUM(${loyaltyMetrics.views})`,
          total_likes: sql`SUM(${loyaltyMetrics.likes})`,
          total_retweets: sql`SUM(${loyaltyMetrics.retweets})`,
          total_replies: sql`SUM(${loyaltyMetrics.replies})`,
          total_tweets: sql`SUM(${loyaltyMetrics.tweet_count})`,
          member_count: sql`COUNT(DISTINCT ${loyaltyMetrics.twitter_handle})`,
        })
        .from(loyaltyMetrics)
        .where(eq(loyaltyMetrics.project_id, projectId));

      return result[0];
    } catch (error) {
      console.error(
        `Error getting project total metrics for project ${projectId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get leaderboard for a project
   */
  async getLeaderboard(projectId: number) {
    try {
      // Check if we have a cached leaderboard (using read replica for better performance)
      const [leaderboardEntry] = await readDb
        .select()
        .from(loyaltyLeaderboard)
        .where(eq(loyaltyLeaderboard.project_id, projectId));

      if (leaderboardEntry) {
        return leaderboardEntry.leaderboard_data;
      }

      // If no cached leaderboard, calculate it (this shouldn't happen in production)
      return this.calculateLeaderboard(projectId);
    } catch (error) {
      console.error(
        `Error getting leaderboard for project ${projectId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Calculate and store leaderboard data
   */
  async calculateLeaderboard(projectId: number, forceRecalculation = false) {
    try {
      log(
        `Calculating leaderboard for project ${projectId}, force: ${forceRecalculation}`
      );

      // Get all members with metrics
      const members = await this.getMembersWithMetrics(projectId);

      // Create leaderboard entries
      const leaderboardEntries: LeaderboardEntry[] = [];
      let totalViews = 0;
      let totalLikes = 0;
      let totalRetweets = 0;
      let totalReplies = 0;
      let totalTweets = 0;

      // Get project info for incentive calculations
      const project = await this.getProjectById(projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      for (const member of members) {
        if (!member.metrics) continue;

        // Add to totals
        totalViews += member.metrics.views || 0;
        totalLikes += member.metrics.likes || 0;
        totalRetweets += member.metrics.retweets || 0;
        totalReplies += member.metrics.replies || 0;
        totalTweets += member.metrics.tweet_count || 0;

        // Calculate estimated pay if project is incentivized
        let estimatedPay: number | undefined = undefined;
        if (project.is_incentivized && project.price_per_view && Number(project.price_per_view) > 0) {
          // Incentive is calculated per-view
          estimatedPay = member.metrics.views * Number(project.price_per_view);
        }

        // Create leaderboard entry
        const entry: LeaderboardEntry = {
          twitter_handle: member.twitter_handle,
          username: member.username || member.twitter_handle,
          profilePicture: member.profilePicture,
          profileUrl: member.profileUrl,
          tweet_count: member.metrics.tweet_count || 0,
          views: member.metrics.views || 0,
          likes: member.metrics.likes || 0,
          retweets: member.metrics.retweets || 0,
          replies: member.metrics.replies || 0,
          joined_at: member.joined_at,
          twitterUrl: `https://twitter.com/${member.twitter_handle}`,
          estimated_pay: estimatedPay,
        };

        leaderboardEntries.push(entry);
      }

      // Sort by views (descending)
      leaderboardEntries.sort((a, b) => b.views - a.views);

      // Store in database
      const [existingLeaderboard] = await db
        .select()
        .from(loyaltyLeaderboard)
        .where(eq(loyaltyLeaderboard.project_id, projectId));

      if (existingLeaderboard) {
        await db
          .update(loyaltyLeaderboard)
          .set({
            leaderboard_data: leaderboardEntries,
            total_views: totalViews,
            total_likes: totalLikes,
            total_retweets: totalRetweets,
            total_replies: totalReplies,
            total_tweets: totalTweets,
          })
          .where(eq(loyaltyLeaderboard.project_id, projectId));
      } else {
        await db.insert(loyaltyLeaderboard).values({
          project_id: projectId,
          leaderboard_data: leaderboardEntries,
          total_views: totalViews,
          total_likes: totalLikes,
          total_retweets: totalRetweets,
          total_replies: totalReplies,
          total_tweets: totalTweets,
        });
      }

      return leaderboardEntries;
    } catch (error) {
      console.error(
        `Error calculating leaderboard for project ${projectId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get members with metrics for a project
   */
  async getMembersWithMetrics(projectId: number) {
    try {
      // Get all active members for this project
      const members = await db
        .select()
        .from(loyaltyMembers)
        .where(
          and(
            eq(loyaltyMembers.project_id, projectId),
            eq(loyaltyMembers.is_active, true)
          )
        );

      // Get metrics for all members
      const metrics = await db
        .select()
        .from(loyaltyMetrics)
        .where(eq(loyaltyMetrics.project_id, projectId));

      // Get Twitter user info for all members
      const twitterHandles = members.map((m) => m.twitter_handle);
      const twitterUsers = await getTwitterUserInfo(twitterHandles);

      // Combine data
      const result: ExtendedLoyaltyMember[] = members.map((member) => {
        const memberMetrics = metrics.find(
          (m) => m.twitter_handle === member.twitter_handle
        );
        const twitterUser = twitterUsers ? (twitterUsers as any)[member.twitter_handle] : null;

        return {
          ...member,
          username:
            twitterUser?.username || twitterUser?.name || member.twitter_handle,
          profilePicture: twitterUser?.profile_image_url || null,
          profileUrl: twitterUser?.profile_image_url || null,
          metrics: memberMetrics || undefined,
        };
      });

      return result;
    } catch (error) {
      console.error(
        `Error getting members with metrics for project ${projectId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get all loyalty projects
   * Optionally filtered by active status
   */
  async getAllProjects(
    activeOnly: boolean = true,
    twitterHandle?: string
  ): Promise<ExtendedLoyaltyProject[]> {
    try {
      console.log(
        `🔍 [TIMING] getAllProjects started - activeOnly: ${activeOnly}, twitterHandle: ${
          twitterHandle || "none"
        }`
      );
      const startTime = process.hrtime();

      // Timing function to measure duration of operations
      const getElapsedTime = (label: string) => {
        const elapsed = process.hrtime(startTime);
        const timeInMs = elapsed[0] * 1000 + elapsed[1] / 1000000;
        console.log(
          `⏱️ [TIMING] getAllProjects - ${label}: ${timeInMs.toFixed(2)}ms`
        );
        return timeInMs;
      };

      // STEP 1: Query base projects using raw SQL to avoid column issues
      const queryStartTime = process.hrtime();

      // SQL injection prevention: Use Drizzle query builder instead of sql.raw
      // This is safer and maintains the same functionality
      let query;
      
      if (activeOnly) {
        // Include projects that are active AND haven't passed their end_time
        query = readDb
          .select()
          .from(loyaltyProjects)
          .where(
            and(
              eq(loyaltyProjects.is_active, true),
              or(
                isNull(loyaltyProjects.end_time),
                gt(loyaltyProjects.end_time, new Date())
              )
            )
          )
          .orderBy(loyaltyProjects.name);
      } else {
        query = readDb
          .select()
          .from(loyaltyProjects)
          .orderBy(loyaltyProjects.name);
      }

      // Using read replica for better performance
      const projects = await query as ExtendedLoyaltyProject[];

      getElapsedTime(`1. Initial projects query (${projects.length} projects)`);

      // STEP 2: Get member counts for all projects in a single query (WITH CACHING)
      console.log(
        `🔄 [TIMING] Getting member counts for all ${projects.length} projects in bulk`
      );
      const memberCountStartTime = process.hrtime();

      // Define the cache key for member counts
      const MEMBER_COUNT_CACHE_KEY = "loyalty:member_counts";
      const CACHE_TTL = 30; // Cache for 30 minutes

      // Try to get member counts from cache first
      let memberCountMap = new Map<number, number>();
      const cachedMemberCounts = await getCachedValue<
        { projectId: number; count: number }[]
      >(MEMBER_COUNT_CACHE_KEY, CACHE_TTL);

      if (cachedMemberCounts) {
        // Convert cached array back to Map
        cachedMemberCounts.forEach((item) => {
          memberCountMap.set(item.projectId, item.count);
        });

        console.log(
          `🔄 [TIMING] Using cached member counts for ${cachedMemberCounts.length} projects`
        );
      } else {
        console.log(
          `🔄 [TIMING] No cached member counts found, querying database`
        );

        // Create a query that counts members for all projects in one go
        // Use read replica for read operations
        const memberCounts = await getReadDatabase()
          .select({
            project_id: loyaltyMembers.project_id,
            count: sql<number>`count(*)`,
          })
          .from(loyaltyMembers)
          .where(eq(loyaltyMembers.is_active, true))
          .groupBy(loyaltyMembers.project_id);

        // Convert to a map for easy lookup
        memberCounts.forEach((row) => {
          memberCountMap.set(row.project_id, row.count);
        });

        // Cache the results for future requests
        // Convert Map to array for caching
        const cacheData = Array.from(memberCountMap.entries()).map(
          ([projectId, count]) => ({
            projectId,
            count,
          })
        );

        await setCachedValue(MEMBER_COUNT_CACHE_KEY, cacheData, CACHE_TTL);
        console.log(
          `🔄 [TIMING] Cached member counts for ${memberCounts.length} projects for ${CACHE_TTL} minutes`
        );
      }

      const memberCountTime = process.hrtime(memberCountStartTime);
      const memberCountMs =
        memberCountTime[0] * 1000 + memberCountTime[1] / 1000000;
      console.log(
        `⏱️ [TIMING] Bulk member count processing took ${memberCountMs.toFixed(
          2
        )}ms for ${memberCountMap.size} projects`
      );

      // STEP 3: If a Twitter handle is provided, get all memberships in a single query
      let userMemberships = new Set<number>();
      if (twitterHandle) {
        console.log(
          `🔄 [TIMING] Checking memberships for user ${twitterHandle}`
        );
        const membershipStartTime = process.hrtime();

        // Use read replica for read operations
        const memberships = await getReadDatabase()
          .select({
            project_id: loyaltyMembers.project_id,
          })
          .from(loyaltyMembers)
          .where(
            and(
              sql`LOWER(${loyaltyMembers.twitter_handle}) = LOWER(${twitterHandle})`,
              eq(loyaltyMembers.is_active, true)
            )
          );

        // Convert to a set for O(1) lookups
        memberships.forEach((membership) => {
          userMemberships.add(membership.project_id);
        });

        const membershipTime = process.hrtime(membershipStartTime);
        const membershipMs =
          membershipTime[0] * 1000 + membershipTime[1] / 1000000;
        console.log(
          `⏱️ [TIMING] Bulk membership query took ${membershipMs.toFixed(
            2
          )}ms, found ${memberships.length} memberships`
        );
      }

      // STEP 4: Process each project (now with cached data)
      const projectsWithMemberCount: ExtendedLoyaltyProject[] = [];
      console.log(
        `🔄 [TIMING] Processing ${projects.length} projects with cached data`
      );

      // OPTIMIZATION: Batch Twitter media fetching for projects missing images
      const projectsNeedingMedia = projects.filter(
        (p) => p.twitter_handle && (!p.logo_url || !p.banner_url)
      );

      console.log(
        `🔄 [TIMING] ${projectsNeedingMedia.length} projects need Twitter media fetching`
      );

      // Process all projects in batches to avoid too many concurrent API calls
      const BATCH_SIZE = 5;
      const mediaCache = new Map<
        string,
        { profileImage: string | null; bannerImage: string | null }
      >();

      if (projectsNeedingMedia.length > 0) {
        console.log(
          `🔄 [TIMING] Fetching Twitter media in batches of ${BATCH_SIZE}`
        );

        // Process in batches to avoid hitting rate limits
        for (let i = 0; i < projectsNeedingMedia.length; i += BATCH_SIZE) {
          const batch = projectsNeedingMedia.slice(i, i + BATCH_SIZE);

          console.log(
            `🔄 [TIMING] Processing media batch ${
              i / BATCH_SIZE + 1
            }/${Math.ceil(projectsNeedingMedia.length / BATCH_SIZE)}`
          );

          // Fetch media for this batch in parallel
          await Promise.all(
            batch.map(async (project) => {
              if (!project.twitter_handle) return;

              try {
                const media = await twitterMediaService.fetchProfileImages(
                  project.twitter_handle
                );
                // Store in cache for later use
                mediaCache.set(project.twitter_handle, media);
              } catch (error) {
                // Log but continue
                log(
                  `Failed batch Twitter media fetch for ${
                    project.twitter_handle
                  }: ${error instanceof Error ? error.message : String(error)}`
                );
              }
            })
          );
        }

        console.log(
          `✅ [TIMING] Completed fetching Twitter media for ${projectsNeedingMedia.length} projects`
        );
      }

      // Now process all projects with our pre-fetched data
      for (let i = 0; i < projects.length; i++) {
        const project = projects[i];
        const projectStartTime = process.hrtime();

        // Use the pre-fetched member count from our map
        const memberCount = memberCountMap.get(project.id) || 0;

        // Check if user is a member using our pre-fetched set
        const isUserMember = userMemberships.has(project.id);

        // Apply cached Twitter media if available
        let projectWithMedia = { ...project };

        if (
          project.twitter_handle &&
          (!project.logo_url || !project.banner_url)
        ) {
          const cachedMedia = mediaCache.get(project.twitter_handle);

          if (cachedMedia) {
            // Only update if the field is empty
            if (!project.logo_url && cachedMedia.profileImage) {
              projectWithMedia.logo_url = cachedMedia.profileImage;
            }

            if (!project.banner_url && cachedMedia.bannerImage) {
              projectWithMedia.banner_url = cachedMedia.bannerImage;
            }

            // Update the database if we have new media info
            if (
              (cachedMedia.profileImage && !project.logo_url) ||
              (cachedMedia.bannerImage && !project.banner_url)
            ) {
              await db
                .update(loyaltyProjects)
                .set({
                  logo_url: projectWithMedia.logo_url,
                  banner_url: projectWithMedia.banner_url,
                  updated_at: new Date(),
                })
                .where(eq(loyaltyProjects.id, project.id));
            }
          }
        }

        // Add project to our result collection
        projectsWithMemberCount.push({
          ...projectWithMedia,
          memberCount, // Using the direct number from the map lookup
          isUserMember,
        });

        // Log progress every 10 projects
        if (i % 10 === 0 || i === projects.length - 1) {
          console.log(
            `🔄 [TIMING] Processed ${i + 1}/${
              projects.length
            } projects in ${getElapsedTime(`Progress update`)}ms`
          );
        }
      }

      // Log total time
      const totalTime = getElapsedTime(
        `TOTAL: Processed all ${projects.length} projects`
      );
      console.log(
        `⏱️ [TIMING] getAllProjects completed in ${totalTime.toFixed(
          2
        )}ms with ${projects.length} projects`
      );

      return projectsWithMemberCount;
    } catch (error) {
      log(
        `Error getting loyalty projects: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Get a single project by ID
   */
  async getProjectById(
    projectId: number
  ): Promise<ExtendedLoyaltyProject | null> {
    try {
      // Using read replica for better performance
      const [project] = await readDb
        .select()
        .from(loyaltyProjects)
        .where(eq(loyaltyProjects.id, projectId));

      if (!project) {
        return null;
      }

      // Get member count (using read replica for better performance)
      const memberCount = await readDb
        .select({
          count: sql<number>`count(*)`,
        })
        .from(loyaltyMembers)
        .where(
          and(
            eq(loyaltyMembers.project_id, project.id),
            eq(loyaltyMembers.is_active, true)
          )
        );

      // If project has twitter_handle but no logo_url or banner_url, try to fetch them
      let projectWithMedia = { ...project };

      if (
        project.twitter_handle &&
        (!project.logo_url || !project.banner_url)
      ) {
        try {
          const media = await twitterMediaService.fetchProfileImages(
            project.twitter_handle
          );

          // Only update if the field is empty
          if (!project.logo_url && media.profileImage) {
            projectWithMedia.logo_url = media.profileImage;
          }

          if (!project.banner_url && media.bannerImage) {
            projectWithMedia.banner_url = media.bannerImage;
          }

          // If we got new media info, update the project in the database
          if (
            (media.profileImage && !project.logo_url) ||
            (media.bannerImage && !project.banner_url)
          ) {
            await db
              .update(loyaltyProjects)
              .set({
                logo_url: projectWithMedia.logo_url,
                banner_url: projectWithMedia.banner_url,
                updated_at: new Date(),
              })
              .where(eq(loyaltyProjects.id, project.id));
          }
        } catch (error) {
          // Log but don't fail if Twitter media fetch fails
          log(
            `Failed to fetch Twitter media for ${project.twitter_handle}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      return {
        ...projectWithMedia,
        memberCount: memberCount[0]?.count || 0,
      };
    } catch (error) {
      log(
        `Error getting project by ID ${projectId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Create a new loyalty project
   * Now utilizes the twitter-user-info service to store Twitter profile data separately
   */
  async createProject(project: InsertLoyaltyProject): Promise<LoyaltyProject> {
    try {
      // If project has a Twitter handle, fetch and store Twitter profile data
      if (project.twitter_handle) {
        log(
          `Fetching Twitter user info for new project with handle: ${project.twitter_handle}`
        );

        // Store Twitter profile in our cached system
        await getTwitterUserInfo(project.twitter_handle);

        // No need to wait for this to return as we just want to make sure it's cached
        // The logo_url and banner_url can be populated by media service if needed
      }

      const [newProject] = await db
        .insert(loyaltyProjects)
        .values(project)
        .returning();

      return newProject;
    } catch (error) {
      log(
        `Error creating loyalty project: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Update an existing loyalty project
   * Now utilizes the twitter-user-info service to keep Twitter profile data up-to-date
   */
  async updateProject(
    projectId: number,
    project: Partial<InsertLoyaltyProject>
  ): Promise<LoyaltyProject | null> {
    try {
      // If Twitter handle is provided in the update, update the cached Twitter user info
      if (project.twitter_handle) {
        log(
          `Updating Twitter user info for project ${projectId} with new handle: ${project.twitter_handle}`
        );

        // Store Twitter profile data in our cached system
        await getTwitterUserInfo(project.twitter_handle);

        // The logo_url and banner_url will be updated by the media service if needed
      }

      // Check if is_active is being changed to false
      const projectToUpdate = { ...project };
      if (project.is_active === false) {
        // Get the current project to check if is_active was previously true
        const currentProject = await db.query.loyaltyProjects.findFirst({
          where: eq(loyaltyProjects.id, projectId),
        });

        // If the project was active and is now being deactivated, set end_time
        if (currentProject && currentProject.is_active === true) {
          projectToUpdate.end_time = new Date();
          log(
            `Setting end_time for project ${projectId} as it is being deactivated`
          );
        }
      }

      const [updatedProject] = await db
        .update(loyaltyProjects)
        .set({
          ...projectToUpdate,
          updated_at: new Date(),
        })
        .where(eq(loyaltyProjects.id, projectId))
        .returning();

      return updatedProject || null;
    } catch (error) {
      log(
        `Error updating loyalty project ${projectId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Deactivate projects that have passed their end_time
   * This should be called periodically (e.g., by a cron job)
   */
  async deactivateExpiredProjects(): Promise<number> {
    try {
      log("Checking for expired loyalty projects to deactivate");

      // Update projects where is_active is true but end_time has passed
      const result = await db
        .update(loyaltyProjects)
        .set({
          is_active: false,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(loyaltyProjects.is_active, true),
            lte(loyaltyProjects.end_time, new Date())
          )
        )
        .returning({ id: loyaltyProjects.id, name: loyaltyProjects.name });

      if (result.length > 0) {
        log(
          `Deactivated ${result.length} expired projects: ${result
            .map((p) => p.name)
            .join(", ")}`
        );
      }

      return result.length;
    } catch (error) {
      log(
        `Error deactivating expired projects: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Join a loyalty project
   */
  async joinProject(
    projectId: number,
    twitterHandle: string
  ): Promise<LoyaltyMember | null> {
    const startTime = performance.now();
    try {
      // Check if project exists (this needs to be done first before other operations)
      const project = await this.getProjectById(projectId);
      if (!project) {
        throw new Error(`Project with ID ${projectId} not found`);
      }

      // Check if user is already a member (active or inactive) - can run in parallel with follower count check
      // Use read replica for read operations
      const memberCheckPromise = getReadDatabase()
        .select()
        .from(loyaltyMembers)
        .where(
          and(
            eq(loyaltyMembers.project_id, projectId),
            sql`LOWER(${loyaltyMembers.twitter_handle}) = LOWER(${twitterHandle})`
          )
        )
        .limit(1);

      // Check minimum follower count requirement
      const minFollowerCount = project.min_follower_count || 0;
      let followerCount = 0;

      if (minFollowerCount > 0) {
        // Get follower count (start this in parallel with member check)
        const followerCountPromise = (async () => {
          // Try to get the latest follower count from our cached Twitter user info service
          try {
            log(
              `Fetching latest follower count for ${twitterHandle} using Twitter user info service...`
            );
            const userInfo = await getTwitterUserInfo(twitterHandle);

            if (userInfo && userInfo.follower_count !== undefined) {
              followerCount = userInfo.follower_count;
              log(
                `Successfully retrieved follower count from Twitter user info service: ${followerCount}`
              );

              // No need to update the user's follower count in giverep_users as it's now stored in twitter_user_info table

              return followerCount;
            } else {
              log(
                `Twitter user info service returned no follower count data for ${twitterHandle}, trying fetchUserInfo...`
              );

              // Fallback to legacy fetchUserInfo method
              const legacyUserInfo = await fetchUserInfo(twitterHandle);

              if (legacyUserInfo && legacyUserInfo.followers !== undefined) {
                followerCount = legacyUserInfo.followers;
                log(
                  `Successfully retrieved follower count from legacy Twitter API: ${followerCount}`
                );
                return followerCount;
              } else {
                log(
                  `Legacy Twitter API also returned no follower count data, falling back to database values`
                );
              }
            }
          } catch (apiError) {
            log(
              `Error fetching follower count from Twitter API: ${
                apiError instanceof Error ? apiError.message : String(apiError)
              }`
            );
            log(`Falling back to database values for follower count`);
          }

          // If we couldn't get follower count from API, fall back to database values in parallel
          const [giverepProfilePromise, repProfilePromise] = await Promise.all([
            // Use read replica for read operations
            getReadDatabase()
              .select({
                follower_count: giverepUsers.follower_count,
              })
              .from(giverepUsers)
              .where(
                sql`LOWER(${giverepUsers.twitter_handle}) = LOWER(${twitterHandle})`
              )
              .limit(1),

            // Use read replica for read operations
            getReadDatabase()
              .select({
                follower_count: repUsers.followerCount,
              })
              .from(repUsers)
              .where(
                sql`LOWER(${repUsers.twitterHandle}) = LOWER(${twitterHandle})`
              )
              .limit(1),
          ]);

          // Use giverep follower count first, fallback to rep_users, or default to 0
          const giverepProfile = giverepProfilePromise[0];
          const repProfile = repProfilePromise[0];
          followerCount =
            giverepProfile?.follower_count || repProfile?.follower_count || 0;
          log(`Using database follower count: ${followerCount}`);

          return followerCount;
        })();

        // Wait for both operations to complete in parallel
        const [existingMember, retrievedFollowerCount] = await Promise.all([
          memberCheckPromise,
          followerCountPromise,
        ]);

        // We now have follower count and member status
        followerCount = retrievedFollowerCount;

        log(
          `User ${twitterHandle} has ${followerCount} followers (minimum required: ${minFollowerCount})`
        );

        // Check if user meets minimum follower count requirement
        if (followerCount < minFollowerCount) {
          log(
            `User ${twitterHandle} does not meet minimum follower count requirement (${followerCount} < ${minFollowerCount})`
          );
          throw new Error(
            `Minimum follower count requirement not met: ${followerCount}/${minFollowerCount} followers required`
          );
        }

        // Handle existing member case after follower check passes
        if (existingMember.length > 0) {
          // If member exists but is inactive, reactivate them
          if (!existingMember[0].is_active) {
            const [updatedMember] = await db
              .update(loyaltyMembers)
              .set({
                is_active: true,
                joined_at: new Date(), // Reset join date to now
              })
              .where(
                and(
                  eq(loyaltyMembers.project_id, projectId),
                  sql`LOWER(${loyaltyMembers.twitter_handle}) = LOWER(${twitterHandle})`
                )
              )
              .returning();

            const endTime = performance.now();
            log(
              `Reactivated existing membership in ${(
                endTime - startTime
              ).toFixed(2)}ms`
            );
            return updatedMember;
          }

          // Member is already active
          const endTime = performance.now();
          log(
            `Found existing active membership in ${(
              endTime - startTime
            ).toFixed(2)}ms`
          );
          return existingMember[0];
        }
      } else {
        // No minimum follower count, just check member status
        const existingMember = await memberCheckPromise;
        if (existingMember.length > 0) {
          // If member exists but is inactive, reactivate them
          if (!existingMember[0].is_active) {
            const [updatedMember] = await db
              .update(loyaltyMembers)
              .set({
                is_active: true,
                joined_at: new Date(), // Reset join date to now
              })
              .where(
                and(
                  eq(loyaltyMembers.project_id, projectId),
                  sql`LOWER(${loyaltyMembers.twitter_handle}) = LOWER(${twitterHandle})`
                )
              )
              .returning();

            const endTime = performance.now();
            log(
              `Reactivated existing membership in ${(
                endTime - startTime
              ).toFixed(2)}ms`
            );
            return updatedMember;
          }

          // Member is already active
          const endTime = performance.now();
          log(
            `Found existing active membership in ${(
              endTime - startTime
            ).toFixed(2)}ms`
          );
          return existingMember[0];
        }
      }

      // Create new membership
      const [newMember] = await db
        .insert(loyaltyMembers)
        .values({
          project_id: projectId,
          twitter_handle: twitterHandle,
          is_active: true,
          // joined_at will be set to now by default
        })
        .returning();

      const endTime = performance.now();
      log(`Created new membership in ${(endTime - startTime).toFixed(2)}ms`);
      return newMember;
    } catch (error) {
      const endTime = performance.now();
      log(
        `Error joining loyalty project ${projectId} for user ${twitterHandle} in ${(
          endTime - startTime
        ).toFixed(2)}ms: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Leave a loyalty project
   */
  async leaveProject(
    projectId: number,
    twitterHandle: string
  ): Promise<boolean> {
    try {
      // Set is_active to false instead of deleting the record
      const result = await db
        .update(loyaltyMembers)
        .set({
          is_active: false,
        })
        .where(
          and(
            eq(loyaltyMembers.project_id, projectId),
            sql`LOWER(${loyaltyMembers.twitter_handle}) = LOWER(${twitterHandle})`
          )
        );

      return true;
    } catch (error) {
      log(
        `Error leaving loyalty project ${projectId} for user ${twitterHandle}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Get all project memberships for a user
   * @param twitterHandle The user's Twitter handle
   * @returns Array of project IDs the user is a member of
   */
  async getUserProjectMemberships(
    twitterHandle: string
  ): Promise<{ projectId: number }[]> {
    try {
      console.log(`Getting all project memberships for user ${twitterHandle}`);
      const startTime = process.hrtime();

      // Query all active memberships for this user - use write DB to ensure we have the most up-to-date data
      // This is important when checking memberships immediately after a join/leave action
      const memberships = await getWriteDatabase()
        .select({
          projectId: loyaltyMembers.project_id,
        })
        .from(loyaltyMembers)
        .where(
          and(
            sql`LOWER(${loyaltyMembers.twitter_handle}) = LOWER(${twitterHandle})`,
            eq(loyaltyMembers.is_active, true)
          )
        );

      const elapsed = process.hrtime(startTime);
      const timeInMs = elapsed[0] * 1000 + elapsed[1] / 1000000;
      console.log(
        `Found ${
          memberships.length
        } project memberships for ${twitterHandle} in ${timeInMs.toFixed(2)}ms`
      );

      return memberships;
    } catch (error) {
      log(
        `Error getting project memberships for user ${twitterHandle}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Join all active loyalty projects (optimized with Promise.all)
   */
  async joinAllProjects(twitterHandle: string): Promise<number> {
    const startTime = performance.now();
    try {
      log(
        `Starting to join all active loyalty projects for user ${twitterHandle}`
      );

      // Get all active projects that haven't ended (using read replica for better performance)
      const activeProjects = await getReadDatabase()
        .select()
        .from(loyaltyProjects)
        .where(
          and(
            eq(loyaltyProjects.is_active, true),
            or(
              isNull(loyaltyProjects.end_time),
              gt(loyaltyProjects.end_time, new Date())
            )
          )
        );

      log(`Found ${activeProjects.length} active projects to join`);

      // Create an array of promises that attempt to join each project
      const joinResults = await Promise.allSettled(
        activeProjects.map((project) =>
          this.joinProject(project.id, twitterHandle)
            .then(() => ({
              success: true,
              projectId: project.id,
              projectName: project.name,
            }))
            .catch((error) => ({
              success: false,
              projectId: project.id,
              projectName: project.name,
              error: error instanceof Error ? error.message : String(error),
            }))
        )
      );

      // Count successful joins and log errors
      const successfulJoins = joinResults.filter(
        (result) => result.status === "fulfilled" && result.value.success
      );

      // Log errors for failed joins
      joinResults
        .filter(
          (result) =>
            result.status === "rejected" ||
            (result.status === "fulfilled" && !result.value.success)
        )
        .forEach((result) => {
          if (result.status === "rejected") {
            log(
              `Error joining project for user ${twitterHandle}: Unknown error`
            );
          } else {
            const value = result.value;
            log(
              `Error joining project ${value.projectId} (${value.projectName}) for user ${twitterHandle}: ${(value as any).error || 'Unknown error'}`
            );
          }
        });

      const joinedCount = successfulJoins.length;
      const endTime = performance.now();
      log(
        `Completed joining ${joinedCount}/${
          activeProjects.length
        } projects for user ${twitterHandle} in ${(endTime - startTime).toFixed(
          2
        )}ms`
      );

      return joinedCount;
    } catch (error) {
      const endTime = performance.now();
      log(
        `Error joining all loyalty projects for user ${twitterHandle} in ${(
          endTime - startTime
        ).toFixed(2)}ms: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Get loyalty project members (optimized for large member counts)
   */
  async getProjectMembers(projectId: number): Promise<ExtendedLoyaltyMember[]> {
    const startTime = performance.now();
    try {
      log(`Fetching members for project ${projectId}`);

      // For large projects, directly use a single optimized SQL query with joins using raw pg pool
      // instead of doing individual queries for each member
      const { rows: results } = await pool.query(
        `
        SELECT 
          lm.id, 
          lm.project_id, 
          lm.twitter_handle, 
          lm.joined_at, 
          lm.is_active,
          lmet.tweet_count, 
          lmet.views, 
          lmet.likes, 
          lmet.retweets, 
          lmet.replies,
          gu.display_name, 
          gu.profile_picture, 
          gu.profile_url
        FROM loyalty_members lm
        LEFT JOIN loyalty_metrics lmet ON 
          lmet.project_id = lm.project_id AND 
          LOWER(lmet.twitter_handle) = LOWER(lm.twitter_handle)
        LEFT JOIN giverep_users gu ON 
          LOWER(gu.twitter_handle) = LOWER(lm.twitter_handle)
        WHERE 
          lm.project_id = $1 AND 
          lm.is_active = true
        ORDER BY lm.joined_at DESC
      `,
        [projectId]
      );

      log(`Found ${results.length} members for project ${projectId}`);

      if (results.length === 0) {
        return [];
      }

      // Map raw query results to ExtendedLoyaltyMember objects
      const extendedMembers: ExtendedLoyaltyMember[] = results.map((row) => {
        // Create the metrics object if any metrics data exists
        const metrics =
          row.tweet_count !== null || row.views !== null
            ? {
                id: 0, // Not used in the frontend
                project_id: projectId,
                twitter_handle: row.twitter_handle,
                twitter_id: null, // Added missing field
                tweet_count: row.tweet_count || 0,
                views: row.views || 0,
                likes: row.likes || 0,
                retweets: row.retweets || 0,
                replies: row.replies || 0,
                last_updated: new Date(), // Not used in the frontend
              }
            : undefined;

        // Return the extended member object
        return {
          id: row.id,
          project_id: row.project_id,
          twitter_handle: row.twitter_handle,
          joined_at: row.joined_at,
          is_admin: false, // Default value since column doesn't exist
          is_active: row.is_active,
          username: row.display_name || undefined,
          profilePicture: row.profile_picture || undefined,
          profileUrl: row.profile_url || undefined,
          metrics,
        };
      });

      const endTime = performance.now();
      log(
        `Processed ${results.length} members with extended data in ${(
          endTime - startTime
        ).toFixed(2)}ms`
      );

      return extendedMembers;
    } catch (error) {
      const endTime = performance.now();
      log(
        `Error getting members for project ${projectId} in ${(
          endTime - startTime
        ).toFixed(2)}ms: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Get cached leaderboard data if available
   */
  /**
   * Helper function to format dates to consistent strings
   * Uses ISO date without time components for better comparisons
   */
  private formatDateForQuery(date?: Date): string | null {
    if (!date) return null;
    return date.toISOString().split("T")[0]; // Get only the date part, e.g. "2025-04-25"
  }

  private async getCachedLeaderboard(
    projectId: number,
    startDate?: Date,
    endDate?: Date
  ): Promise<LeaderboardEntry[] | null> {
    try {
      // Use direct SQL query for better performance
      const startDateStr = this.formatDateForQuery(startDate);
      const endDateStr = this.formatDateForQuery(endDate);

      // Log parameters for debugging
      log(
        `[DEBUG] getCachedLeaderboard called for project ${projectId} with date range: ${
          startDateStr || "NULL"
        } to ${endDateStr || "NULL"}`
      );

      let query;
      let params;

      // If no dates provided, just get the latest cache for this project
      if (!startDate && !endDate) {
        query = `
          SELECT 
            leaderboard_data, 
            last_calculated
          FROM 
            loyalty_leaderboard
          WHERE 
            project_id = $1
          ORDER BY 
            last_calculated DESC
          LIMIT 1
        `;
        params = [projectId];
      } else {
        // Try to find a cache with matching date range
        query = `
          SELECT 
            leaderboard_data, 
            last_calculated
          FROM 
            loyalty_leaderboard
          WHERE 
            project_id = $1
            AND (
              ($2::DATE IS NULL AND start_date IS NULL) 
              OR 
              ($2::DATE IS NOT NULL AND start_date::DATE = $2::DATE)
            )
            AND (
              ($3::DATE IS NULL AND end_date IS NULL) 
              OR 
              ($3::DATE IS NOT NULL AND end_date::DATE = $3::DATE)
            )
          ORDER BY 
            last_calculated DESC
          LIMIT 1
        `;
        params = [projectId, startDateStr, endDateStr];
      }

      // Execute the query
      let { rows } = await pool.query(query, params);

      // If no exact date match found AND dates were provided, try fallback to any cache
      if (rows.length === 0 && (startDate || endDate)) {
        log(
          `No exact date match found for project ${projectId}. Trying fallback to any cache.`
        );

        const fallbackQuery = `
          SELECT 
            leaderboard_data, 
            last_calculated
          FROM 
            loyalty_leaderboard
          WHERE 
            project_id = $1
          ORDER BY 
            last_calculated DESC
          LIMIT 1
        `;

        const fallbackResult = await pool.query(fallbackQuery, [projectId]);
        rows = fallbackResult.rows;
      }

      if (rows.length === 0) {
        log(`No cached leaderboard found for project ${projectId}`);
        return null;
      }

      // Return the most recent cached data
      log(
        `Using latest cached leaderboard for project ${projectId} from ${new Date(
          rows[0].last_calculated
        ).toISOString()}`
      );
      return rows[0].leaderboard_data as LeaderboardEntry[];
    } catch (error) {
      log(
        `Error retrieving cached leaderboard for project ${projectId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null; // Return null on error, will calculate the leaderboard instead
    }
  }

  /**
   * Cache leaderboard data for future use
   */
  /**
   * Helper method to cap large integer values before storing in database
   * Handles very large integers by scaling them down to fit within PostgreSQL integer limit
   */
  private capValuesBeforeStorage(value: number): number {
    // Cap values to avoid PostgreSQL integer overflow
    const MAX_SAFE_INTEGER = 1000000000; // 1 billion - well within PostgreSQL integer limits

    if (value <= MAX_SAFE_INTEGER) {
      return value; // Return as-is if within safe range
    }

    // If value exceeds 1 billion, divide it by a power of 10 to reduce its magnitude
    // We'll scale values down to keep relative proportions while avoiding overflow
    let factor = 10;
    let scaledValue = value;

    // Continue scaling down until we're under the safe limit
    while (scaledValue > MAX_SAFE_INTEGER) {
      scaledValue = Math.floor(value / factor);
      factor *= 10;
    }

    // Add a log if we had to scale values
    if (factor > 10) {
      log(
        `Large value detected (${value}), scaled down to ${scaledValue} for database storage`
      );
    }

    return scaledValue;
  }

  private async cacheLeaderboard(
    projectId: number,
    leaderboard: LeaderboardEntry[],
    startDate?: Date,
    endDate?: Date
  ): Promise<void> {
    try {
      if (!leaderboard || leaderboard.length === 0) {
        log(`Skipping caching empty leaderboard for project ${projectId}`);
        return;
      }

      // Calculate totals - ensure we don't exceed integer limits
      let totalViews = 0;
      let totalLikes = 0;
      let totalTweets = 0;
      let totalRetweets = 0;
      let totalReplies = 0;

      // Calculate raw totals
      for (const entry of leaderboard) {
        totalViews += entry.views || 0;
        totalLikes += entry.likes || 0;
        totalTweets += entry.tweet_count || 0;
        totalRetweets += entry.retweets || 0;
        totalReplies += entry.replies || 0;
      }

      // Delete any existing cached data for this project/date range combination
      await db
        .delete(loyaltyLeaderboard)
        .where(
          and(
            eq(loyaltyLeaderboard.project_id, projectId),
            startDate
              ? eq(loyaltyLeaderboard.start_date, startDate)
              : sql`${loyaltyLeaderboard.start_date} IS NULL`,
            endDate
              ? eq(loyaltyLeaderboard.end_date, endDate)
              : sql`${loyaltyLeaderboard.end_date} IS NULL`
          )
        );

      // Make a clean copy of the leaderboard for storage
      const sanitizedLeaderboard = leaderboard.map((entry) => ({
        twitter_handle: entry.twitter_handle,
        joined_at: entry.joined_at,
        tweet_count: entry.tweet_count || 0,
        views: entry.views || 0,
        likes: entry.likes || 0,
        retweets: entry.retweets || 0,
        replies: entry.replies || 0,
        username: entry.username,
        profilePicture: entry.profilePicture,
        profileUrl: entry.profileUrl,
        twitterUrl: entry.twitterUrl,
        estimated_pay: entry.estimated_pay,
      }));

      // Insert the new cached data - handle string/null type issues
      // We need to cast null to undefined for TypeScript compatibility
      const cacheData: any = {
        project_id: projectId,
        leaderboard_data: sanitizedLeaderboard as any, // JSONB type
        total_views: this.capValuesBeforeStorage(totalViews),
        total_likes: this.capValuesBeforeStorage(totalLikes),
        total_tweets: this.capValuesBeforeStorage(totalTweets),
        total_retweets: this.capValuesBeforeStorage(totalRetweets),
        total_replies: this.capValuesBeforeStorage(totalReplies),
        last_calculated: new Date(),
      };

      // Only add date fields if they exist
      if (startDate) {
        cacheData.start_date = startDate;
      }

      if (endDate) {
        cacheData.end_date = endDate;
      }

      await db.insert(loyaltyLeaderboard).values(cacheData);

      log(
        `Successfully cached leaderboard for project ${projectId} with ${leaderboard.length} entries`
      );
    } catch (error) {
      log(
        `Error caching leaderboard for project ${projectId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Continue execution even if caching fails
    }
  }

  /**
   * Calculate metrics for a specific project and its members
   * This uses data from mindshareTweets but only counts tweets after users joined
   * Optimized with set-based operations to eliminate O(members × tweets) loops
   */
  async calculateProjectMetrics(projectId: number): Promise<{
    updatedMembers: number;
    totalTweets: number;
  }> {
    try {
      // Get the loyalty project information
      const loyaltyProject = await this.getProjectById(projectId);
      if (!loyaltyProject) {
        throw new Error(`Loyalty project with ID ${projectId} not found`);
      }

      // Find the corresponding mindshare project with the same twitter_handle (case insensitive)
      const [mindshareProject] = await db
        .select()
        .from(mindshareProjects)
        .where(
          sql`LOWER(${mindshareProjects.twitter_handle}) = LOWER(${loyaltyProject.twitter_handle})`
        )
        .limit(1);

      if (!mindshareProject) {
        log(
          `No mindshare project found with twitter handle ${
            loyaltyProject.twitter_handle || "null"
          }`
        );
        return { updatedMembers: 0, totalTweets: 0 };
      }

      // Get all active members of this loyalty project
      const members = await db
        .select()
        .from(loyaltyMembers)
        .where(
          and(
            eq(loyaltyMembers.project_id, projectId),
            eq(loyaltyMembers.is_active, true)
          )
        );

      if (members.length === 0) {
        log(`No active members found for loyalty project ${projectId}`);
        return { updatedMembers: 0, totalTweets: 0 };
      }

      const minFollowerCount = loyaltyProject.min_follower_count || 0;
      let updatedMembers = 0;
      let totalTweets = 0;

      // Step 1: Get followers counts for all members in a single query
      // Build an array of member twitter handles
      const memberHandles = members.map((member) => member.twitter_handle);

      // Create a mapping of member handles to joined dates for later use
      const memberJoinedDates = new Map<string, Date>();
      members.forEach((member) => {
        memberJoinedDates.set(
          member.twitter_handle.toLowerCase(),
          member.joined_at
        );
      });

      // Get follower counts for all members in a single query
      const memberFollowers = new Map<string, number>();

      // Get follower counts from giverep_users table
      // Use a safer approach for IN queries with a list of values
      const lowerMemberHandles = memberHandles.map((h) => h.toLowerCase());

      let giverepProfiles = [];
      if (lowerMemberHandles.length > 0) {
        // Create a SQL query with proper string formatting
        const placeholders = lowerMemberHandles
          .map((_, i) => `$${i + 1}`)
          .join(", ");
        const queryText = `SELECT twitter_handle, follower_count 
                         FROM giverep_users 
                         WHERE LOWER(twitter_handle) IN (${placeholders})`;

        const { rows } = await pool.query(queryText, lowerMemberHandles);
        giverepProfiles = rows;
      }

      // Get follower counts from rep_users table as backup
      let repProfiles = [];
      if (lowerMemberHandles.length > 0) {
        // Create a SQL query with proper string formatting
        const placeholders = lowerMemberHandles
          .map((_, i) => `$${i + 1}`)
          .join(", ");
        const queryText = `SELECT twitter_handle, follower_count 
                         FROM rep_users 
                         WHERE LOWER(twitter_handle) IN (${placeholders})`;

        const { rows } = await pool.query(queryText, lowerMemberHandles);
        repProfiles = rows;
      }

      // Populate the follower count map, prioritizing giverep_users data
      giverepProfiles.forEach((profile) => {
        if (profile.twitter_handle && profile.follower_count !== null) {
          memberFollowers.set(
            profile.twitter_handle.toLowerCase(),
            profile.follower_count
          );
        }
      });

      // Add rep_users data if not already in the map
      repProfiles.forEach((profile) => {
        if (profile.twitter_handle && profile.follower_count !== null) {
          const lowercaseHandle = profile.twitter_handle.toLowerCase();
          if (!memberFollowers.has(lowercaseHandle)) {
            memberFollowers.set(lowercaseHandle, profile.follower_count);
          }
        }
      });

      // Step 2: Get all qualifying tweets in a single query
      // Use raw SQL for the most complex part to ensure proper handling of case sensitivity and filtering
      const rawQuery = `
        WITH qualified_members AS (
          SELECT 
            lm.twitter_handle,
            lm.joined_at
          FROM loyalty_members lm
          WHERE lm.project_id = $1 AND lm.is_active = true
        ),
        member_tweets AS (
          SELECT 
            mt.id,
            mt.user_handle,
            mt.views,
            mt.likes,
            mt.retweets,
            mt.replies,
            mt.created_at,
            qm.joined_at
          FROM mindshare_tweets mt
          JOIN qualified_members qm ON LOWER(mt.user_handle) = LOWER(qm.twitter_handle)
          WHERE mt.project_id = $2
            AND mt.created_at >= qm.joined_at
        )
        SELECT * FROM member_tweets
      `;

      // Execute the raw query to get all qualifying tweets
      const { rows: qualifyingTweets } = await pool.query(rawQuery, [
        projectId,
        mindshareProject.id,
      ]);

      log(
        `Found ${qualifyingTweets.length} qualifying tweets for ${members.length} members in project ${projectId}`
      );

      // Step 3: Filter tweets by project mentions limit
      // We'll do this in batches since filterTweetsByProjectMentions is already implemented
      const tweetsBatch: MindshareTweet[] = [];
      for (const tweetRow of qualifyingTweets) {
        tweetsBatch.push(tweetRow as MindshareTweet);
      }

      const qualifiedTweets = await this.filterTweetsByProjectMentions(
        tweetsBatch
      );
      log(
        `After filtering for project mentions, ${qualifiedTweets.length} tweets qualify out of ${tweetsBatch.length}`
      );

      // Step 4: Group tweets by user and calculate metrics
      const userMetrics = new Map<
        string,
        {
          tweet_count: number;
          views: number;
          likes: number;
          retweets: number;
          replies: number;
        }
      >();

      for (const tweet of qualifiedTweets) {
        if (!tweet.user_handle) continue;

        const lowerHandle = tweet.user_handle.toLowerCase();

        // Skip if user doesn't meet follower count requirement
        const followerCount = memberFollowers.get(lowerHandle) || 0;
        if (minFollowerCount > 0 && followerCount < minFollowerCount) {
          continue;
        }

        // Calculate metrics for this user
        if (!userMetrics.has(lowerHandle)) {
          userMetrics.set(lowerHandle, {
            tweet_count: 0,
            views: 0,
            likes: 0,
            retweets: 0,
            replies: 0,
          });
        }

        const metrics = userMetrics.get(lowerHandle)!;
        metrics.tweet_count += 1;
        metrics.views += tweet.views || 0;
        metrics.likes += tweet.likes || 0;
        metrics.retweets += tweet.retweets || 0;
        metrics.replies += tweet.replies || 0;

        totalTweets += 1;
      }

      // Step 5: Bulk update metrics for all users in one operation
      // Prepare the bulk update array with metrics for all members
      const metricsUpdates = members.map((member) => {
        const lowerHandle = member.twitter_handle.toLowerCase();
        const metrics = userMetrics.get(lowerHandle) || {
          tweet_count: 0,
          views: 0,
          likes: 0,
          retweets: 0,
          replies: 0,
        };

        return {
          twitter_handle: member.twitter_handle,
          ...metrics,
        };
      });

      // Perform the bulk update operation
      if (metricsUpdates.length > 0) {
        updatedMembers = await this.bulkUpdateMemberMetrics(
          projectId,
          metricsUpdates
        );
        log(
          `Bulk updated metrics for ${updatedMembers} members in project ${projectId}`
        );
      }

      return { updatedMembers, totalTweets };
    } catch (error) {
      log(
        `Error calculating metrics for project ${projectId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Update metrics for a specific member
   * Allows for both individual and batch updates via transaction
   */
  private async updateMemberMetrics(
    projectId: number,
    twitterHandle: string,
    metrics: {
      tweet_count: number;
      views: number;
      likes: number;
      retweets: number;
      replies: number;
      twitter_id?: number;
    }
  ): Promise<LoyaltyMetrics> {
    try {
      // Check if metrics already exist for this user/project
      const existingMetrics = await db
        .select()
        .from(loyaltyMetrics)
        .where(
          and(
            eq(loyaltyMetrics.project_id, projectId),
            sql`LOWER(${loyaltyMetrics.twitter_handle}) = LOWER(${twitterHandle})`
          )
        )
        .limit(1);

      let updatedMetrics: LoyaltyMetrics;

      if (existingMetrics.length > 0) {
        // Get previous view count for spending calculation
        const prevViews = existingMetrics[0].views || 0;
        const newViews = metrics.views || 0;

        // Update existing metrics
        const updateData: any = {
          tweet_count: metrics.tweet_count,
          views: metrics.views,
          likes: metrics.likes,
          retweets: metrics.retweets,
          replies: metrics.replies,
          last_updated: new Date(),
        };
        
        // Only update twitter_id if provided
        if (metrics.twitter_id !== undefined) {
          updateData.twitter_id = metrics.twitter_id;
        }
        
        [updatedMetrics] = await db
          .update(loyaltyMetrics)
          .set(updateData)
          .where(
            and(
              eq(loyaltyMetrics.project_id, projectId),
              sql`LOWER(${loyaltyMetrics.twitter_handle}) = LOWER(${twitterHandle})`
            )
          )
          .returning();

        // Update project spending based on view count change if views increased
        if (newViews > prevViews) {
          // Calculate only the incremental views with safety checks
          const viewDifference = calculateMetricDifference(
            newViews,
            prevViews,
            'views',
            10_000_000 // Max 10 million view increase at once
          );

          if (viewDifference > 0) {
            // Update project incentive spending
            await this.updateIncentiveSpending(projectId, viewDifference);
            log(
              `Updated view count for ${twitterHandle} in project ${projectId}: ${prevViews} -> ${newViews} (+${viewDifference})`
            );

            // Award reputation points for tweet views (1 point per 100 views)
            await this.awardReputationForViews(
              twitterHandle,
              viewDifference,
              projectId
            );
          }
        }
      } else {
        // Create new metrics
        const insertData: any = {
          project_id: projectId,
          twitter_handle: twitterHandle,
          tweet_count: metrics.tweet_count,
          views: metrics.views,
          likes: metrics.likes,
          retweets: metrics.retweets,
          replies: metrics.replies,
        };
        
        // Only include twitter_id if provided
        if (metrics.twitter_id !== undefined) {
          insertData.twitter_id = metrics.twitter_id;
        }
        
        [updatedMetrics] = await db
          .insert(loyaltyMetrics)
          .values(insertData)
          .returning();

        // For new metrics, update spending with total views
        if (metrics.views > 0) {
          // Update incentive spending
          await this.updateIncentiveSpending(projectId, metrics.views);
          log(
            `New metrics for ${twitterHandle} in project ${projectId} with ${metrics.views} views`
          );

          // Award reputation points for tweet views (1 point per 100 views)
          // For new members, award points for all views
          await this.awardReputationForViews(
            twitterHandle,
            metrics.views,
            projectId
          );
        }
      }

      // Clear leaderboard cache after significant updates
      // This is important for the Ika project or other projects with many members
      try {
        // Check if update is significant enough to warrant cache clearing
        const hasSignificantChange =
          existingMetrics.length === 0 || // New entry
          Math.abs(updatedMetrics.views - (existingMetrics[0]?.views || 0)) >
            10 || // View change > 10
          Math.abs(
            updatedMetrics.tweet_count - (existingMetrics[0]?.tweet_count || 0)
          ) > 2; // Tweet count change > 2

        if (hasSignificantChange) {
          const { clearCacheByPrefix } = require("../utils/cache");
          await clearCacheByPrefix(
            `/loyalty/projects/${projectId}/leaderboard`
          );
          log(
            `Cleared leaderboard cache for project ${projectId} after updating ${twitterHandle}'s metrics`
          );
        }
      } catch (cacheError) {
        // Don't fail the metrics update if cache clearing fails
        log(
          `Error clearing cache for project ${projectId} after metrics update: ${
            cacheError instanceof Error
              ? cacheError.message
              : String(cacheError)
          }`
        );
      }

      return updatedMetrics;
    } catch (error) {
      log(
        `Error updating metrics for member ${twitterHandle} in project ${projectId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Bulk update metrics for multiple members
   * Uses PostgreSQL's conflict resolution for efficient upserts
   */
  private async bulkUpdateMemberMetrics(
    projectId: number,
    metricsUpdates: Array<{
      twitter_handle: string;
      tweet_count: number;
      views: number;
      likes: number;
      retweets: number;
      replies: number;
    }>
  ): Promise<number> {
    if (metricsUpdates.length === 0) {
      return 0;
    }

    try {
      // Use a SQL transaction to ensure atomicity
      const now = new Date();

      // First, get existing metrics to calculate view differences for spending
      const handles = metricsUpdates.map((m) => m.twitter_handle);

      const existingMetricsQuery = `
        SELECT 
          project_id, 
          twitter_handle, 
          views
        FROM 
          loyalty_metrics
        WHERE 
          project_id = $1 AND 
          twitter_handle = ANY($2::text[])
      `;

      const { rows: existingMetrics } = await pool.query(existingMetricsQuery, [
        projectId,
        handles,
      ]);

      // Create a map of existing view counts
      const existingViewsMap = new Map<string, number>();
      existingMetrics.forEach((row) => {
        existingViewsMap.set(row.twitter_handle, row.views || 0);
      });

      // Calculate total view difference for incentive spending
      let totalViewDifference = 0;

      // Prepare values for upsert
      const values = metricsUpdates
        .map((metrics) => {
          const prevViews = existingViewsMap.get(metrics.twitter_handle) || 0;
          const newViews = metrics.views || 0;

          // Only count positive differences
          if (newViews > prevViews) {
            totalViewDifference += newViews - prevViews;
          }

          return `(${projectId}, '${metrics.twitter_handle}', ${
            metrics.tweet_count
          }, ${metrics.views}, ${metrics.likes}, ${metrics.retweets}, ${
            metrics.replies
          }, '${now.toISOString()}')`;
        })
        .join(", ");

      // Build and execute the upsert query
      const upsertQuery = `
        INSERT INTO loyalty_metrics 
          (project_id, twitter_handle, tweet_count, views, likes, retweets, replies, last_updated)
        VALUES 
          ${values}
        ON CONFLICT (project_id, twitter_handle) DO UPDATE SET
          tweet_count = EXCLUDED.tweet_count,
          views = EXCLUDED.views,
          likes = EXCLUDED.likes,
          retweets = EXCLUDED.retweets,
          replies = EXCLUDED.replies,
          last_updated = EXCLUDED.last_updated
      `;

      await pool.query(upsertQuery);

      // Update incentive spending if needed
      if (totalViewDifference > 0) {
        // Update incentive spending
        await this.updateIncentiveSpending(projectId, totalViewDifference);
        log(
          `Updated total view count for project ${projectId} by +${totalViewDifference} views`
        );

        // Award reputation points for tweet views for each member with view increases
        for (const metrics of metricsUpdates) {
          const prevViews = existingViewsMap.get(metrics.twitter_handle) || 0;
          const newViews = metrics.views || 0;
          
          // Calculate view difference with safety checks
          const viewDiff = calculateMetricDifference(
            newViews,
            prevViews,
            'views',
            10_000_000 // Max 10 million view increase at once
          );

          if (viewDiff > 0) {
            // Award reputation points (1 point per 100 views)
            await this.awardReputationForViews(
              metrics.twitter_handle,
              viewDiff,
              projectId
            );
          }
        }
      }

      // Important: Clear project leaderboard cache after updating metrics
      // This is especially critical for projects with many members like Ika
      try {
        const { clearCacheByPrefix } = require("../utils/cache");
        await clearCacheByPrefix(`/loyalty/projects/${projectId}/leaderboard`);
        log(
          `Cleared leaderboard cache for project ${projectId} after updating ${metricsUpdates.length} member metrics`
        );
      } catch (cacheError) {
        // Don't fail the metrics update if cache clearing fails
        log(
          `Error clearing cache for project ${projectId} after metrics update: ${
            cacheError instanceof Error
              ? cacheError.message
              : String(cacheError)
          }`
        );
      }

      return metricsUpdates.length;
    } catch (error) {
      log(
        `Error bulk updating metrics for project ${projectId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  async getProjectLeaderboardV1WithCount(
    projectId: number | string,
    startDateStr?: string,
    endDateStr?: string,
    limit?: number,
    offset?: number
  ): Promise<{ entries: LeaderboardEntry[]; total: number }> {
    // Validate project ID
    const parsedProjectId = Number(projectId);
    if (isNaN(parsedProjectId)) {
      throw new Error("Invalid project ID");
    }

    const project = await this.getProjectById(parsedProjectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Parse dates
    let parsedStartDate: Date | undefined;
    let parsedEndDate: Date | undefined;

    if (startDateStr && typeof startDateStr === "string") {
      const dateStr = startDateStr.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        parsedStartDate = new Date(dateStr);
      }
    }

    if (endDateStr && typeof endDateStr === "string") {
      const dateStr = endDateStr.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        parsedEndDate = new Date(dateStr);
      }
    }

    if (!project.twitter_handle) {
      throw new Error("Project has no Twitter handle");
    }

    const projectHandle = project.twitter_handle.replace("@", "").toLowerCase();

    // Define date filter conditions for SQL query
    const startDateFilter = parsedStartDate
      ? sql`AND t.created_at >= ${parsedStartDate}`
      : sql``;

    const endDateFilter = parsedEndDate
      ? sql`AND t.created_at <= ${parsedEndDate}`
      : sql``;

    // Define hashtag filter if project has hashtags specified
    const hashtagFilter = project.hashtags && project.hashtags.length > 0
      ? sql`AND t.hash_tags && ARRAY[${sql.join(project.hashtags.map(h => sql`${h}`), sql`, `)}]`
      : sql``;

    // First, get the total count
    const countResult = await db.execute(sql`
      WITH project_metrics AS (
        SELECT 
          author_handle AS twitter_handle,
          MAX(author_id) AS twitter_id,
          COUNT(*) AS tweet_count,
          SUM(views) AS views,
          SUM(likes) AS likes,
          SUM(retweets) AS retweets,
          SUM(replies) AS replies,
          MIN(created_at) AS first_mention,
          MAX(created_at) AS last_mention
        FROM tweets t
        WHERE 
          t.eligible_loyalty_mentions @> ARRAY[${projectHandle}]
          ${startDateFilter}
          ${endDateFilter}
          ${hashtagFilter}
        GROUP BY author_handle
      ),
      project_members AS (
        SELECT 
          twitter_handle,
          joined_at
        FROM loyalty_members
        WHERE project_id = ${parsedProjectId} AND is_active = true
      )
      SELECT COUNT(*) AS total_count
      FROM project_members m
      LEFT JOIN project_metrics p ON m.twitter_handle = p.twitter_handle
    `);

    const totalCount = Number(countResult.rows[0]?.total_count || 0);

    // Query to aggregate metrics from eligible_loyalty_mentions with pagination
    const leaderboardData = await db.execute(sql`
      WITH project_metrics AS (
        SELECT 
          author_handle AS twitter_handle,
          MAX(author_id) AS twitter_id,
          COUNT(*) AS tweet_count,
          SUM(views) AS views,
          SUM(likes) AS likes,
          SUM(retweets) AS retweets,
          SUM(replies) AS replies,
          MIN(created_at) AS first_mention,
          MAX(created_at) AS last_mention
        FROM tweets t
        WHERE 
          t.eligible_loyalty_mentions @> ARRAY[${projectHandle}]
          ${startDateFilter}
          ${endDateFilter}
          ${hashtagFilter}
        GROUP BY author_handle
      ),
      project_members AS (
        SELECT 
          twitter_handle,
          joined_at
        FROM loyalty_members
        WHERE project_id = ${parsedProjectId} AND is_active = true
      )
      SELECT 
        m.twitter_handle,
        p.twitter_id,
        m.joined_at,
        COALESCE(p.tweet_count, 0) AS tweet_count,
        COALESCE(p.views, 0) AS views,
        COALESCE(p.likes, 0) AS likes,
        COALESCE(p.retweets, 0) AS retweets,
        COALESCE(p.replies, 0) AS replies,
        CASE 
          WHEN p.first_mention IS NOT NULL THEN p.first_mention
          ELSE m.joined_at
        END AS first_activity,
        CASE 
          WHEN p.last_mention IS NOT NULL THEN p.last_mention
          ELSE m.joined_at
        END AS last_activity,
        CASE
          WHEN ${Boolean(project.is_incentivized)} AND ${
      Number(project.price_per_view) || 0
    }::numeric > 0 THEN 
            ROUND((COALESCE(p.views, 0) * ${
              Number(project.price_per_view) || 0
            }::numeric)::numeric, 4)
          ELSE NULL
        END AS estimated_pay
      FROM project_members m
      LEFT JOIN project_metrics p ON m.twitter_handle = p.twitter_handle
      ORDER BY views DESC
      ${limit ? sql`LIMIT ${limit}` : sql``}
      ${offset ? sql`OFFSET ${offset}` : sql``}
    `);

    // Transform raw database results to add Twitter profile info
    const entries = leaderboardData.rows || [];
    const enhancedEntries = await this.addProfileInfoToLeaderboard(entries, {
      price_per_view: Number(project.price_per_view) || 0,
      is_incentivized: project.is_incentivized,
      incentive_type: project.incentive_type,
    });

    return {
      entries: enhancedEntries,
      total: totalCount
    };
  }

  async getProjectLeaderboardV1(
    projectId: number | string,
    startDateStr?: string,
    endDateStr?: string,
    limit?: number,
    offset?: number
  ): Promise<LeaderboardEntry[]> {
    // Validate project ID
    const parsedProjectId = Number(projectId);
    if (isNaN(parsedProjectId)) {
      throw new Error("Invalid project ID");
    }

    const project = await this.getProjectById(parsedProjectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Parse dates
    let parsedStartDate: Date | undefined;
    let parsedEndDate: Date | undefined;

    if (startDateStr && typeof startDateStr === "string") {
      const dateStr = startDateStr.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        parsedStartDate = new Date(dateStr);
      }
    }

    if (endDateStr && typeof endDateStr === "string") {
      const dateStr = endDateStr.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        parsedEndDate = new Date(dateStr);
      }
    }

    if (!project.twitter_handle) {
      throw new Error("Project has no Twitter handle");
    }

    const projectHandle = project.twitter_handle.replace("@", "").toLowerCase();

    // Define date filter conditions for SQL query
    const startDateFilter = parsedStartDate
      ? sql`AND t.created_at >= ${parsedStartDate}`
      : sql``;

    const endDateFilter = parsedEndDate
      ? sql`AND t.created_at <= ${parsedEndDate}`
      : sql``;

    // Define hashtag filter if project has hashtags specified
    const hashtagFilter = project.hashtags && project.hashtags.length > 0
      ? sql`AND t.hash_tags && ARRAY[${sql.join(project.hashtags.map(h => sql`${h}`), sql`, `)}]`
      : sql``;

    // Query to aggregate metrics from eligible_loyalty_mentions
    const leaderboardData = await db.execute(sql`
      WITH project_metrics AS (
        SELECT 
          author_handle AS twitter_handle,
          MAX(author_id) AS twitter_id,
          COUNT(*) AS tweet_count,
          SUM(views) AS views,
          SUM(likes) AS likes,
          SUM(retweets) AS retweets,
          SUM(replies) AS replies,
          MIN(created_at) AS first_mention,
          MAX(created_at) AS last_mention
        FROM tweets t
        WHERE 
          t.eligible_loyalty_mentions @> ARRAY[${projectHandle}]
          ${startDateFilter}
          ${endDateFilter}
          ${hashtagFilter}
        GROUP BY author_handle
      ),
      project_members AS (
        SELECT 
          twitter_handle,
          joined_at
        FROM loyalty_members
        WHERE project_id = ${parsedProjectId} AND is_active = true
      )
      SELECT 
        m.twitter_handle,
        p.twitter_id,
        m.joined_at,
        COALESCE(p.tweet_count, 0) AS tweet_count,
        COALESCE(p.views, 0) AS views,
        COALESCE(p.likes, 0) AS likes,
        COALESCE(p.retweets, 0) AS retweets,
        COALESCE(p.replies, 0) AS replies,
        CASE 
          WHEN p.first_mention IS NOT NULL THEN p.first_mention
          ELSE m.joined_at
        END AS first_activity,
        CASE 
          WHEN p.last_mention IS NOT NULL THEN p.last_mention
          ELSE m.joined_at
        END AS last_activity,
        CASE
          WHEN ${Boolean(project.is_incentivized)} AND ${
      Number(project.price_per_view) || 0
    }::numeric > 0 THEN 
            ROUND((COALESCE(p.views, 0) * ${
              Number(project.price_per_view) || 0
            }::numeric)::numeric, 4)
          ELSE NULL
        END AS estimated_pay
      FROM project_members m
      LEFT JOIN project_metrics p ON m.twitter_handle = p.twitter_handle
      ORDER BY views DESC
      ${limit ? sql`LIMIT ${limit}` : sql``}
      ${offset ? sql`OFFSET ${offset}` : sql``}
    `);

    // Transform raw database results to add Twitter profile info
    const entries = leaderboardData.rows || [];
    return this.addProfileInfoToLeaderboard(entries, {
      price_per_view: Number(project.price_per_view) || 0,
      is_incentivized: project.is_incentivized,
      incentive_type: project.incentive_type,
    });
  }

  /**
   * Get project leaderboard sorted by views with optional date filtering
   * @param projectId Project ID
   * @param startDate Optional start date for filtering tweet metrics
   * @param endDate Optional end date for filtering tweet metrics
   */
  async getProjectLeaderboard(
    projectId: number,
    startDate?: Date,
    endDate?: Date,
    forceCalculation: boolean = false
  ): Promise<LeaderboardEntry[]> {
    try {
      // First, get the project to access price_per_view and other details (using read replica for better performance)
      const [loyaltyProject] = await readDb
        .select({
          price_per_view: loyaltyProjects.price_per_view,
          twitter_handle: loyaltyProjects.twitter_handle,
          is_incentivized: loyaltyProjects.is_incentivized,
          incentive_type: loyaltyProjects.incentive_type,
          name: loyaltyProjects.name,
        })
        .from(loyaltyProjects)
        .where(eq(loyaltyProjects.id, projectId));

      if (!loyaltyProject) {
        throw new Error(`Project with ID ${projectId} not found`);
      }

      // IMPORTANT: Debug log
      log(
        `[DEBUG] getProjectLeaderboard called for project ${projectId} (${
          loyaltyProject.name
        }) with dates: ${startDate?.toISOString() || "null"} to ${
          endDate?.toISOString() || "null"
        } (forceCalculation=${forceCalculation})`
      );

      // Note: Removed special case for ATTN project (ID 17) - now using standard pipeline

      // DIRECT DATABASE APPROACH - Always use live data

      // If no date range, use the pre-calculated metrics from loyalty_metrics table
      if (!startDate && !endDate) {
        log(
          `Using live metrics from loyalty_metrics table for project ${projectId}`
        );

        // Query directly from metrics, members, and user profiles in one go (using read replica for better performance)
        const leaderboard = await readDb
          .select({
            twitter_handle: loyaltyMembers.twitter_handle,
            twitter_id: loyaltyMetrics.twitter_id,
            joined_at: loyaltyMembers.joined_at,
            tweet_count: loyaltyMetrics.tweet_count,
            views: loyaltyMetrics.views,
            likes: loyaltyMetrics.likes,
            retweets: loyaltyMetrics.retweets,
            replies: loyaltyMetrics.replies,
            username: giverepUsers.display_name,
            profilePicture: giverepUsers.profile_picture,
            profileUrl: giverepUsers.profile_url,
          })
          .from(loyaltyMembers)
          .innerJoin(
            loyaltyMetrics,
            and(
              eq(loyaltyMetrics.project_id, loyaltyMembers.project_id),
              sql`LOWER(${loyaltyMetrics.twitter_handle}) = LOWER(${loyaltyMembers.twitter_handle})`
            )
          )
          .leftJoin(
            giverepUsers,
            sql`LOWER(${giverepUsers.twitter_handle}) = LOWER(${loyaltyMembers.twitter_handle})`
          )
          .where(
            and(
              eq(loyaltyMembers.project_id, projectId),
              eq(loyaltyMembers.is_active, true),
              // Only include members with at least one view or tweet
              or(gt(loyaltyMetrics.views, 0), gt(loyaltyMetrics.tweet_count, 0))
            )
          )
          .orderBy(desc(loyaltyMetrics.views));

        // Process the results into LeaderboardEntry objects
        const leaderboardEntries: LeaderboardEntry[] = leaderboard.map(
          (entry) => {
            // Calculate estimated pay if project is incentivized
            const views = entry.views || 0;
            let estimatedPay: number | undefined = undefined;

            if (loyaltyProject.is_incentivized && views > 0) {
              const pricePerView =
                Number(loyaltyProject.price_per_view) || 0.0004; // Now stored as decimal

              // Calculate based on incentive type
              if (loyaltyProject.incentive_type === "points") {
                // For points, use price_per_view directly
                estimatedPay = views * pricePerView;
              } else {
                // For USDC (default), price is already in dollars
                estimatedPay = views * pricePerView;
              }
            }

            return {
              twitter_handle: entry.twitter_handle,
              twitter_id: entry.twitter_id ? String(entry.twitter_id) : undefined,
              username: entry.username || undefined,
              profilePicture: entry.profilePicture || undefined,
              profileUrl: entry.profileUrl || undefined,
              twitterUrl: `https://twitter.com/${entry.twitter_handle}`,
              tweet_count: entry.tweet_count || 0,
              views: views,
              likes: entry.likes || 0,
              retweets: entry.retweets || 0,
              replies: entry.replies || 0,
              joined_at: entry.joined_at,
              estimated_pay: estimatedPay,
            };
          }
        );

        // Log the top entries for debugging
        if (leaderboardEntries.length > 0) {
          const top3 = leaderboardEntries.slice(0, 3);
          log(
            `Top 3 members by views in project ${projectId} (${loyaltyProject.name}):`
          );
          for (const entry of top3) {
            log(
              `- ${entry.twitter_handle}: ${entry.views} views, ${entry.tweet_count} tweets`
            );
          }

          // Special debugging for willnigri
          const willnigri = leaderboardEntries.find(
            (e) => e.twitter_handle.toLowerCase() === "willnigri"
          );
          if (willnigri) {
            log(
              `willnigri stats: ${willnigri.views} views, ${
                willnigri.tweet_count
              } tweets, position ${leaderboardEntries.indexOf(willnigri) + 1}`
            );
          }
        }

        // Cache the results even though we're using live data
        // (this helps with date-specific queries later)
        await this.cacheLeaderboard(
          projectId,
          leaderboardEntries,
          startDate,
          endDate
        );

        return leaderboardEntries;
      }

      // If date range is provided, use direct metrics from the mindshare_tweets table with JOIN
      log(
        `Filtering leaderboard by date range: ${
          startDate?.toISOString() || "all time"
        } to ${endDate?.toISOString() || "present"}`
      );

      // Get mindshare project ID with matching Twitter handle (case insensitive) (using read replica for better performance)
      const [mindshareProject] = await readDb
        .select({
          id: mindshareProjects.id,
        })
        .from(mindshareProjects)
        .where(
          sql`LOWER(${mindshareProjects.twitter_handle}) = LOWER(${loyaltyProject.twitter_handle})`
        );

      if (!mindshareProject && !loyaltyProject.twitter_handle) {
        // We need either a mindshare project ID or a Twitter handle to find relevant tweets
        return [];
      }

      const projectHandle = loyaltyProject.twitter_handle?.toLowerCase();
      const mindshareProjectId = mindshareProject?.id;

      // Use a JOIN-based approach to aggregate all member metrics in a single query
      let memberMetricsQuery;

      if (mindshareProjectId) {
        // If we have a mindshare project ID, use it for the query
        memberMetricsQuery = db
          .select({
            twitter_handle: loyaltyMembers.twitter_handle,
            twitter_id: sql<string>`MAX(${mindshareTweets.user_id})`,
            joined_at: loyaltyMembers.joined_at,
            tweet_count: sql<number>`COUNT(${mindshareTweets.id})`,
            views: sql<number>`COALESCE(SUM(${mindshareTweets.views}), 0)`,
            likes: sql<number>`COALESCE(SUM(${mindshareTweets.likes}), 0)`,
            retweets: sql<number>`COALESCE(SUM(${mindshareTweets.retweets}), 0)`,
            replies: sql<number>`COALESCE(SUM(${mindshareTweets.replies}), 0)`,
          })
          .from(loyaltyMembers)
          .leftJoin(
            mindshareTweets,
            and(
              sql`LOWER(${mindshareTweets.user_handle}) = LOWER(${loyaltyMembers.twitter_handle})`,
              // Always include tweets since member joined (basic filter)
              gte(mindshareTweets.created_at, loyaltyMembers.joined_at),
              // Apply date filtering only if explicitly provided
              startDate ? gte(mindshareTweets.created_at, startDate) : sql`1=1`,
              endDate ? lte(mindshareTweets.created_at, endDate) : sql`1=1`,
              eq(mindshareTweets.project_id, mindshareProjectId),
              // Only count tweets with eligible mentions (≤2 loyalty projects mentioned)
              sql`${mindshareTweets.eligible_loyalty_mentions} @> ARRAY[${projectHandle}]::text[]`
            )
          )
          .where(
            and(
              eq(loyaltyMembers.project_id, projectId),
              eq(loyaltyMembers.is_active, true)
            )
          )
          .groupBy(loyaltyMembers.twitter_handle, loyaltyMembers.joined_at)
          .having(sql`COUNT(${mindshareTweets.id}) > 0`) // Only members with tweets
          .orderBy(
            sql<number>`COALESCE(SUM(${mindshareTweets.views}), 0) DESC`
          );
      } else if (projectHandle) {
        // Otherwise, use the project handle for content matching
        memberMetricsQuery = db
          .select({
            twitter_handle: loyaltyMembers.twitter_handle,
            twitter_id: sql<string>`MAX(${mindshareTweets.user_id})`,
            joined_at: loyaltyMembers.joined_at,
            tweet_count: sql<number>`COUNT(${mindshareTweets.id})`,
            views: sql<number>`COALESCE(SUM(${mindshareTweets.views}), 0)`,
            likes: sql<number>`COALESCE(SUM(${mindshareTweets.likes}), 0)`,
            retweets: sql<number>`COALESCE(SUM(${mindshareTweets.retweets}), 0)`,
            replies: sql<number>`COALESCE(SUM(${mindshareTweets.replies}), 0)`,
          })
          .from(loyaltyMembers)
          .leftJoin(
            mindshareTweets,
            and(
              sql`LOWER(${mindshareTweets.user_handle}) = LOWER(${loyaltyMembers.twitter_handle})`,
              gte(mindshareTweets.created_at, loyaltyMembers.joined_at),
              startDate
                ? gte(mindshareTweets.created_at, startDate)
                : undefined,
              endDate ? lte(mindshareTweets.created_at, endDate) : undefined,
              // Special case for ATTN project - also match ATTNtoken without @ since many tweets don't use @
              projectId === 17
                ? or(
                    sql`${
                      mindshareTweets.content
                    } ILIKE ${`%@${projectHandle}%`}`,
                    sql`${mindshareTweets.content} ILIKE ${"%ATTNtoken%"}`
                  )
                : sql`${mindshareTweets.content} ILIKE ${`%@${projectHandle}%`}`
            )
          )
          .where(
            and(
              eq(loyaltyMembers.project_id, projectId),
              eq(loyaltyMembers.is_active, true)
            )
          )
          .groupBy(loyaltyMembers.twitter_handle, loyaltyMembers.joined_at)
          .having(sql`COUNT(${mindshareTweets.id}) > 0`) // Only members with tweets
          .orderBy(
            sql<number>`COALESCE(SUM(${mindshareTweets.views}), 0) DESC`
          );
      } else {
        return []; // No project handle and no mindshare project ID, can't filter tweets
      }

      // Execute the query
      const memberMetrics = await memberMetricsQuery;

      // Get profiles for these members
      const twitterHandles = memberMetrics.map((m) => m.twitter_handle);

      const userProfiles = await readDb
        .select({
          twitter_handle: giverepUsers.twitter_handle,
          display_name: giverepUsers.display_name,
          profile_picture: giverepUsers.profile_picture,
          profile_url: giverepUsers.profile_url,
        })
        .from(giverepUsers)
        .where(
          inArray(
            sql`LOWER(${giverepUsers.twitter_handle})`,
            twitterHandles.map((h) => h.toLowerCase())
          )
        );

      // Create a map for quick profile lookup (case-insensitive)
      const profileMap: Record<string, (typeof userProfiles)[0]> = {};
      for (const profile of userProfiles) {
        if (profile.twitter_handle) {
          profileMap[profile.twitter_handle.toLowerCase()] = profile;
        }
      }

      // Build the leaderboard entries
      const leaderboardEntries: LeaderboardEntry[] = memberMetrics.map(
        (entry) => {
          // Get the profile (case-insensitive lookup)
          const profile = profileMap[entry.twitter_handle.toLowerCase()];

          // Calculate estimated pay if project is incentivized
          const views = entry.views || 0;
          let estimatedPay: number | undefined = undefined;

          if (loyaltyProject.is_incentivized && views > 0) {
            const pricePerView =
              Number(loyaltyProject.price_per_view) || 0.0004; // Now stored as decimal

            // Calculate based on incentive type
            if (loyaltyProject.incentive_type === "points") {
              // For points, use price_per_view directly
              estimatedPay = views * pricePerView;
            } else {
              // For USDC (default), price is already in dollars
              estimatedPay = views * pricePerView;
            }
          }

          return {
            twitter_handle: entry.twitter_handle,
            twitter_id: entry.twitter_id || undefined,
            username: profile?.display_name || undefined,
            profilePicture: profile?.profile_picture || undefined,
            profileUrl: profile?.profile_url || undefined,
            twitterUrl: `https://twitter.com/${entry.twitter_handle}`,
            tweet_count: entry.tweet_count || 0,
            views: views,
            likes: entry.likes || 0,
            retweets: entry.retweets || 0,
            replies: entry.replies || 0,
            joined_at: entry.joined_at,
            estimated_pay: estimatedPay,
          };
        }
      );

      // Cache these results for future date-specific queries
      await this.cacheLeaderboard(
        projectId,
        leaderboardEntries,
        startDate,
        endDate
      );

      return leaderboardEntries;
    } catch (error) {
      log(
        `Error getting leaderboard for project ${projectId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Helper method to add user profile information to leaderboard entries
   * Made public to support the v1 leaderboard API
   */
  async addProfileInfoToLeaderboard(
    leaderboard: any[],
    projectData?: {
      price_per_view: number;
      is_incentivized: boolean | null;
      incentive_type?: string | null;
    }
  ): Promise<LeaderboardEntry[]> {
    try {
      if (leaderboard.length === 0) {
        return [];
      }

      // Get project information if not provided
      let pricePerView = Number(projectData?.price_per_view) ?? 0.0004; // Now stored as decimal
      const isIncentivized = projectData?.is_incentivized ?? false;

      // Collect all twitter handles to fetch profiles in a single query
      const twitterHandles = leaderboard.map((entry) => entry.twitter_handle);

      // Get all user profiles in a single query for better performance
      // Add detailed logging to debug issues
      log(`Getting profiles for ${twitterHandles.length} Twitter handles.`);

      let userProfiles: any[] = [];
      
      // Helper function to fetch profiles with a given batch size
      const fetchProfilesWithBatchSize = async (batchSize: number | null): Promise<any[]> => {
        const profiles: any[] = [];
        
        if (batchSize === null) {
          // Try to fetch all at once
          log(`Attempting to fetch all ${twitterHandles.length} profiles in a single query...`);
          
          const result = await db
            .select({
              twitter_handle: giverepUsers.twitter_handle,
              display_name: giverepUsers.display_name,
              profile_picture: giverepUsers.profile_picture,
              profile_url: giverepUsers.profile_url,
            })
            .from(giverepUsers)
            .where(
              sql`LOWER(${giverepUsers.twitter_handle}) = ANY(ARRAY[${sql.join(
                twitterHandles.map((h) => sql`${h.toLowerCase()}`),
                sql`, `
              )}])`
            );
          
          return result;
        } else {
          // Fetch in batches
          log(`Fetching profiles in batches of ${batchSize}...`);
          
          for (let i = 0; i < twitterHandles.length; i += batchSize) {
            const handleBatch = twitterHandles.slice(i, i + batchSize);
            
            const batchProfiles = await db
              .select({
                twitter_handle: giverepUsers.twitter_handle,
                display_name: giverepUsers.display_name,
                profile_picture: giverepUsers.profile_picture,
                profile_url: giverepUsers.profile_url,
              })
              .from(giverepUsers)
              .where(
                sql`LOWER(${giverepUsers.twitter_handle}) = ANY(ARRAY[${sql.join(
                  handleBatch.map((h) => sql`${h.toLowerCase()}`),
                  sql`, `
                )}])`
              );
            
            profiles.push(...batchProfiles);
            
            if (batchSize < twitterHandles.length) {
              log(
                `Fetched batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(twitterHandles.length / batchSize)} (${batchProfiles.length} profiles)`
              );
            }
          }
          
          return profiles;
        }
      };
      
      if (twitterHandles.length > 0) {
        // Progressive fallback strategy
        const batchSizes = [null, 50000, 25000, 10000, 5000, 1000]; // null means try all at once
        
        for (const batchSize of batchSizes) {
          try {
            userProfiles = await fetchProfilesWithBatchSize(batchSize);
            log(
              `Found ${userProfiles.length} user profiles for ${twitterHandles.length} requested handles${
                batchSize ? ` (using batch size ${batchSize})` : ' (single query)'
              }`
            );
            break; // Success, exit the loop
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            if (batchSize === batchSizes[batchSizes.length - 1]) {
              // Last attempt failed
              log(`Error getting user profiles even with smallest batch size: ${errorMessage}`);
              log(`Profile fetch failed but import will continue without profile data. This won't affect reward calculations.`);
              userProfiles = [];
              break;
            } else {
              // Try with smaller batch size
              const nextBatchSize = batchSizes[batchSizes.indexOf(batchSize) + 1];
              log(
                `Failed to fetch profiles${batchSize ? ` with batch size ${batchSize}` : ' in single query'}: ${errorMessage}. ` +
                `Retrying with ${nextBatchSize ? `batch size ${nextBatchSize}` : 'smaller batches'}...`
              );
            }
          }
        }
      }

      // Create a map for quick lookup of profiles (using lowercase keys for case-insensitive matching)
      const profileMap = userProfiles.reduce((map, profile) => {
        if (profile.twitter_handle) {
          // Store with lowercase key for case-insensitive lookup
          map[profile.twitter_handle.toLowerCase()] = profile;
        }
        return map;
      }, {} as Record<string, (typeof userProfiles)[0]>);

      // Build the enhanced leaderboard with profiles
      const leaderboardWithProfiles: LeaderboardEntry[] = leaderboard.map(
        (entry) => {
          // Get profile from map using case-insensitive lookup
          const userProfile = profileMap[entry.twitter_handle?.toLowerCase()];

          // Calculate estimated pay/points if project is incentivized
          const views = Number(entry.views) || 0;
          let estimatedPay = null;

          if (isIncentivized && views > 0) {
            // Handle different incentive types
            if (projectData?.incentive_type === "points") {
              // For points, use price_per_view directly
              estimatedPay = views * pricePerView;
            } else {
              // For USDC (default), price is already in dollars
              estimatedPay = views * pricePerView;
            }
          }

          return {
            ...entry,
            // Ensure values are never null to match the LeaderboardEntry type
            // Convert string values to numbers (PostgreSQL returns numeric as strings in raw SQL)
            tweet_count: Number(entry.tweet_count) || 0,
            views: Number(views) || 0,
            likes: Number(entry.likes) || 0,
            retweets: Number(entry.retweets) || 0,
            replies: Number(entry.replies) || 0,
            username: userProfile?.display_name,
            profilePicture: userProfile?.profile_picture,
            profileUrl: userProfile?.profile_url,
            twitterUrl: `https://twitter.com/${entry.twitter_handle}`,
            estimated_pay: estimatedPay,
          };
        }
      );

      return leaderboardWithProfiles;
    } catch (error) {
      log(
        `Error adding profile info to leaderboard: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Filter tweets to only include those that mention 1-2 projects maximum
   * This ensures tweets that mention too many projects don't qualify for loyalty rewards
   * @param tweets The tweets to filter
   * @returns Array of tweets that mention 1-2 projects maximum
   */
  private async filterTweetsByProjectMentions(
    tweets: MindshareTweet[]
  ): Promise<MindshareTweet[]> {
    if (!tweets || tweets.length === 0) {
      return [];
    }

    try {
      // Get all active projects with their Twitter handles
      const projects = await db
        .select({
          id: mindshareProjects.id,
          handle: mindshareProjects.twitter_handle,
          name: mindshareProjects.name,
        })
        .from(mindshareProjects)
        .where(eq(mindshareProjects.is_active, true));

      // Filter out projects without Twitter handles
      const projectHandles = projects
        .filter((p) => p.handle && p.handle.trim().length > 0)
        .map((p) => ({
          id: p.id,
          handle: p.handle!.toLowerCase(),
          name: p.name,
        }));

      if (projectHandles.length === 0) {
        // No projects with Twitter handles to check against
        return tweets;
      }

      // Filter tweets that mention 1-2 projects maximum
      const qualifiedTweets = tweets.filter((tweet) => {
        if (!tweet.content) return false;

        // Convert tweet content to lowercase for case-insensitive matching
        const content = tweet.content.toLowerCase();

        // Count how many project Twitter handles are mentioned
        let mentionCount = 0;
        for (const project of projectHandles) {
          // Special case for ATTN project - also check for "ATTNtoken" without @
          if (project.name === "ATTN 👁️" || project.id === 81) {
            if (content.includes("attntoken")) {
              mentionCount++;
              continue;
            }
          }

          // Standard check for @handle
          if (content.includes(`@${project.handle}`)) {
            mentionCount++;
          }
        }

        // Only accept tweets that mention 1-2 projects
        return mentionCount >= 1 && mentionCount <= 2;
      });

      log(
        `Filtered ${tweets.length} tweets down to ${qualifiedTweets.length} that mention 1-2 projects maximum`
      );
      return qualifiedTweets;
    } catch (error) {
      log(
        `Error filtering tweets by project mentions: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Return original tweets if there's an error
      return tweets;
    }
  }

  // Note: Removed special getATTNProjectLeaderboard method
  // ATTN project now uses the standard pipeline like all other projects

  /**
   * Calculate metrics for all active loyalty projects
   */
  async calculateAllProjectMetrics(): Promise<{
    projectsUpdated: number;
    membersUpdated: number;
    totalTweets: number;
    leaderboardsCached: number;
  }> {
    try {
      // Get all active projects in one query
      const activeProjects = await db
        .select()
        .from(loyaltyProjects)
        .where(eq(loyaltyProjects.is_active, true));

      if (activeProjects.length === 0) {
        log("No active loyalty projects found");
        return {
          projectsUpdated: 0,
          membersUpdated: 0,
          totalTweets: 0,
          leaderboardsCached: 0,
        };
      }

      // Save the original incentive status of each project before calculating metrics
      const originalIncentiveStatus = new Map<number, boolean>();
      activeProjects.forEach((project) => {
        originalIncentiveStatus.set(
          project.id,
          project.is_incentivized || false
        );
      });

      // First, pre-aggregate all daily tweets to prepare for faster metrics calculation
      // Always use forceRefresh=true to clear existing aggregations before recalculating
      log(
        "Pre-aggregating daily tweets for all projects (clearing existing data)..."
      );
      const { projectsUpdated: aggregatedProjects, tweetsAggregated } =
        await this.aggregateDailyTweets(true);

      log(
        `Pre-aggregated ${tweetsAggregated} tweets for ${aggregatedProjects} projects`
      );

      let projectsUpdated = 0;
      let membersUpdated = 0;
      let totalTweets = 0;
      let leaderboardsCached = 0;

      // Process projects in parallel with Promise.all, but limit concurrency
      // to avoid overwhelming the database
      const BATCH_SIZE = 3; // Process up to 3 projects at a time
      const projectBatches = [];

      // Create batches of projects
      for (let i = 0; i < activeProjects.length; i += BATCH_SIZE) {
        projectBatches.push(activeProjects.slice(i, i + BATCH_SIZE));
      }

      // Process each batch sequentially to control load
      for (const batch of projectBatches) {
        // Process projects in the current batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (project) => {
            try {
              // Use the optimized calculation method with pre-aggregated data
              const { updatedMembers, totalTweets: projectTweets } =
                await this.calculateProjectMetricsFromDailyTweets(project.id);

              let cachedLeaderboard = false;

              // If metrics were updated, generate and cache the leaderboard
              if (updatedMembers > 0) {
                try {
                  // Before generating leaderboard, get top 5 members by views for debugging
                  const topMembers = await db
                    .select()
                    .from(loyaltyMetrics)
                    .where(eq(loyaltyMetrics.project_id, project.id))
                    .orderBy(desc(loyaltyMetrics.views))
                    .limit(5);

                  log(
                    `[DEBUG] Top 5 members for project ${project.id} (${project.name}) by metrics table:`
                  );
                  topMembers.forEach((member, idx) => {
                    log(
                      `[DEBUG]   ${idx + 1}. ${member.twitter_handle}: ${
                        member.views
                      } views, ${member.tweet_count} tweets`
                    );
                  });

                  // Force calculation when run from admin functions
                  const leaderboard = await this.getProjectLeaderboard(
                    project.id,
                    undefined,
                    undefined,
                    true
                  );

                  // After generating leaderboard, log the top 5 entries for debugging
                  if (leaderboard.length > 0) {
                    log(
                      `[DEBUG] Top 5 entries in generated leaderboard for project ${project.id}:`
                    );
                    leaderboard.slice(0, 5).forEach((entry, idx) => {
                      log(
                        `[DEBUG]   ${idx + 1}. ${entry.twitter_handle}: ${
                          entry.views
                        } views, ${entry.tweet_count} tweets`
                      );
                    });
                  }

                  // Count as cached if it has entries
                  if (leaderboard.length > 0) {
                    cachedLeaderboard = true;
                    log(
                      `Generated and cached leaderboard for project ${project.id} (${project.name}) with ${leaderboard.length} entries`
                    );
                  }

                  // Check budget while preserving original incentive status
                  await this.checkAndUpdateIncentiveBudget(project.id, true);
                } catch (cacheError) {
                  log(
                    `Error caching leaderboard for project ${project.id} (${
                      project.name
                    }): ${
                      cacheError instanceof Error
                        ? cacheError.message
                        : String(cacheError)
                    }`
                  );
                }

                return {
                  success: true,
                  projectId: project.id,
                  updatedMembers,
                  totalTweets: projectTweets,
                  cachedLeaderboard,
                };
              }

              return {
                success: true,
                projectId: project.id,
                updatedMembers: 0,
                totalTweets: 0,
                cachedLeaderboard: false,
              };
            } catch (error) {
              log(
                `Error calculating metrics for project ${project.id} (${
                  project.name
                }): ${error instanceof Error ? error.message : String(error)}`
              );

              log(
                `Falling back to original calculation method for project ${project.id}`
              );

              try {
                // Fall back to original calculation if optimized method fails
                const { updatedMembers, totalTweets: projectTweets } =
                  await this.calculateProjectMetrics(project.id);

                let cachedLeaderboard = false;

                if (updatedMembers > 0) {
                  try {
                    // Force calculation in the fallback method as well
                    const leaderboard = await this.getProjectLeaderboard(
                      project.id,
                      undefined,
                      undefined,
                      true
                    );

                    if (leaderboard.length > 0) {
                      cachedLeaderboard = true;
                    }

                    await this.checkAndUpdateIncentiveBudget(project.id, true);
                  } catch (innerError) {
                    // Just log and continue
                    log(
                      `Error in fallback leaderboard cache for project ${
                        project.id
                      }: ${
                        innerError instanceof Error
                          ? innerError.message
                          : String(innerError)
                      }`
                    );
                  }

                  return {
                    success: true,
                    projectId: project.id,
                    updatedMembers,
                    totalTweets: projectTweets,
                    cachedLeaderboard,
                  };
                }

                return {
                  success: true,
                  projectId: project.id,
                  updatedMembers: 0,
                  totalTweets: 0,
                  cachedLeaderboard: false,
                };
              } catch (fallbackError) {
                log(
                  `Fallback calculation also failed for project ${
                    project.id
                  }: ${
                    fallbackError instanceof Error
                      ? fallbackError.message
                      : String(fallbackError)
                  }`
                );

                return {
                  success: false,
                  projectId: project.id,
                  updatedMembers: 0,
                  totalTweets: 0,
                  cachedLeaderboard: false,
                };
              }
            }
          })
        );

        // Aggregate results from this batch
        batchResults.forEach((result) => {
          if (result.success && result.updatedMembers > 0) {
            projectsUpdated++;
            membersUpdated += result.updatedMembers;
            totalTweets += result.totalTweets;

            if (result.cachedLeaderboard) {
              leaderboardsCached++;
            }
          }
        });

        // Format totalTweets with commas to make it more readable and prevent binary representation
        const formattedTweets = totalTweets.toLocaleString();
        log(
          `Processed batch of ${batch.length} projects. Running totals: ${projectsUpdated} projects, ${membersUpdated} members, ${formattedTweets} tweets`
        );
      }

      // After calculating all metrics, recalculate project spending
      log("Recalculating spending for all projects...");
      try {
        const spendingResult = await this.recalculateAllProjectSpending();
        log(
          `Recalculated spending for ${
            spendingResult.updatedProjects
          } projects. Total views: ${
            spendingResult.totalViews
          }, Total spent: $${(spendingResult.totalSpent / 100).toFixed(2)}`
        );
      } catch (spendingError) {
        log(
          `Error recalculating spending: ${
            spendingError instanceof Error
              ? spendingError.message
              : String(spendingError)
          }`
        );
        // Continue with the response even if spending recalculation fails
      }

      return {
        projectsUpdated,
        membersUpdated,
        totalTweets,
        leaderboardsCached,
      };
    } catch (error) {
      log(
        `Error calculating metrics for all projects: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Update incentive spending for all active projects based on cached leaderboard data
   * This ensures spending is calculated using the most accurate available view counts
   *
   * Note: Spending is stored in cents (integer), but displayed in dollars (float)
   */
  async recalculateAllProjectSpending(): Promise<{
    updatedProjects: number;
    totalViews: number;
    totalSpent: number;
  }> {
    try {
      // Get all incentivized projects
      const projects = await db
        .select()
        .from(loyaltyProjects)
        .where(
          and(
            eq(loyaltyProjects.is_active, true),
            eq(loyaltyProjects.is_incentivized, true)
          )
        );

      let updatedProjects = 0;
      let totalViews = 0;
      let totalSpentCents = 0;

      for (const project of projects) {
        try {
          // Reset the project's total_incentive_spent to 0
          await db
            .update(loyaltyProjects)
            .set({ total_incentive_spent: 0 })
            .where(eq(loyaltyProjects.id, project.id));

          // First check if we have cached leaderboard data for more accurate view counts
          const cachedData = await db
            .select()
            .from(loyaltyLeaderboard)
            .where(eq(loyaltyLeaderboard.project_id, project.id))
            .orderBy(desc(loyaltyLeaderboard.last_calculated))
            .limit(1);

          let projectViews = 0;

          if (cachedData.length > 0 && cachedData[0].total_views) {
            // Use the cached total views for more accurate calculation
            projectViews = cachedData[0].total_views;
            log(
              `Using cached view count for project ${project.id} (${project.name}): ${projectViews} views`
            );
          } else {
            // Fallback to summing metrics if no cached data is available
            const metrics = await db
              .select()
              .from(loyaltyMetrics)
              .where(eq(loyaltyMetrics.project_id, project.id));

            // Sum up all views for this project
            for (const metric of metrics) {
              projectViews += metric.views || 0;
            }
            log(
              `Using summed metrics for project ${project.id} (${project.name}): ${projectViews} views`
            );
          }

          totalViews += projectViews;

          // Update the project's spending based on total views
          if (projectViews > 0) {
            // Calculate spending in cents
            const pricePerView = project.price_per_view || 4; // Default 0.0004 USD (4 = 0.0001 * 4)

            // Calculate spending in cents
            // pricePerView is in ten-thousandths of a dollar (e.g., 4 = $0.0004, 40 = $0.004)
            // To convert to cents: (views * price / 10000) * 100 which simplifies to (views * price / 100)
            const numericPricePerView = Number(pricePerView);
            const spendingInCents = Math.round(
              (projectViews * numericPricePerView) / 100
            );

            console.log(
              `[SPENDING CALC] Project ${project.id} (${
                project.name
              }): ${projectViews} views * ${numericPricePerView / 10000} USD = $${(
                (projectViews * numericPricePerView) /
                10000
              ).toFixed(2)} (${spendingInCents} cents)`
            );

            await db
              .update(loyaltyProjects)
              .set({
                total_incentive_spent: spendingInCents,
                updated_at: new Date(),
              })
              .where(eq(loyaltyProjects.id, project.id));

            totalSpentCents += spendingInCents;

            // Convert cents to dollars for logging
            const spentDollars = spendingInCents / 100;
            log(
              `Recalculated spending for project ${project.id} (${
                project.name
              }): ${projectViews} views × ${
                numericPricePerView / 10000
              }$ = $${spentDollars.toFixed(2)}`
            );

            // Check if budget is now exhausted, but don't turn off incentives during bulk calculation
            // This prevents accidental disabling during metrics calculation
            await this.checkAndUpdateIncentiveBudget(project.id, true);
          }

          updatedProjects++;
        } catch (error) {
          log(
            `Error recalculating spending for project ${project.id} (${
              project.name
            }): ${error instanceof Error ? error.message : String(error)}`
          );
          // Continue with other projects
        }
      }

      // Convert total spent from cents to dollars for the API response
      const totalSpent = totalSpentCents / 100;

      return { updatedProjects, totalViews, totalSpent };
    } catch (error) {
      log(
        `Error recalculating spending for all projects: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Aggregate and store daily tweets for all projects
   * This populates the loyalty_daily_tweets table for fast calculations
   */
  async aggregateDailyTweets(forceRefresh: boolean = false): Promise<{
    projectsUpdated: number;
    daysProcessed: number;
    tweetsAggregated: number;
  }> {
    try {
      const activeProjects = await db
        .select()
        .from(loyaltyProjects)
        .where(eq(loyaltyProjects.is_active, true));

      if (activeProjects.length === 0) {
        log("No active projects found for daily tweet aggregation");
        return { projectsUpdated: 0, daysProcessed: 0, tweetsAggregated: 0 };
      }

      // Get corresponding mindshare projects for all loyalty projects in one query
      const mindshareProjectMap = new Map<number, number>();

      for (const project of activeProjects) {
        if (!project.twitter_handle) continue;

        const [mindshareProject] = await db
          .select({
            id: mindshareProjects.id,
            handle: mindshareProjects.twitter_handle,
          })
          .from(mindshareProjects)
          .where(
            sql`LOWER(${mindshareProjects.twitter_handle}) = LOWER(${project.twitter_handle})`
          )
          .limit(1);

        if (mindshareProject) {
          mindshareProjectMap.set(project.id, mindshareProject.id);
        }
      }

      let projectsUpdated = 0;
      let daysProcessed = 0;
      let tweetsAggregated = 0;

      // Process each project with a corresponding mindshare project
      for (const project of activeProjects) {
        const mindshareProjectId = mindshareProjectMap.get(project.id);

        if (!mindshareProjectId) {
          log(
            `No matching mindshare project found for loyalty project ${project.id} (${project.name})`
          );
          continue;
        }

        // Determine the date range to process
        // Default to last 30 days if no existing data
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        let startDate = new Date(thirtyDaysAgo);

        if (!forceRefresh) {
          // Get the latest processed date for this project
          const [latestAggregation] = await db
            .select({
              tweet_date: loyaltyDailyTweets.tweet_date,
            })
            .from(loyaltyDailyTweets)
            .where(eq(loyaltyDailyTweets.project_id, project.id))
            .orderBy(desc(loyaltyDailyTweets.tweet_date))
            .limit(1);

          if (latestAggregation?.tweet_date) {
            // Start from the day after the latest processed date
            startDate = new Date(latestAggregation.tweet_date);
            startDate.setDate(startDate.getDate() + 1);
          }
        } else if (forceRefresh) {
          // If forcing refresh, delete existing aggregations for this project
          await db
            .delete(loyaltyDailyTweets)
            .where(eq(loyaltyDailyTweets.project_id, project.id));

          log(
            `Deleted existing daily tweet aggregations for project ${project.id} (${project.name})`
          );
        }

        // Get the current date as the end date
        const endDate = new Date();

        // If start date is after end date, no processing needed
        if (startDate > endDate) {
          log(
            `No new data to aggregate for project ${project.id} (${
              project.name
            }). Latest aggregation: ${startDate.toISOString()}`
          );
          continue;
        }

        // Process each day in the range
        const currentDate = new Date(startDate);
        let projectDaysProcessed = 0;
        let projectTweetsAggregated = 0;

        while (currentDate <= endDate) {
          // Format current date as YYYY-MM-DD for SQL
          const formattedDate = currentDate.toISOString().split("T")[0];

          // Create next day date
          const nextDate = new Date(currentDate);
          nextDate.setDate(nextDate.getDate() + 1);

          // NEW APPROACH: Use separate queries to avoid conflict errors
          let dailyInsertCount = 0;

          try {
            // First, get aggregated tweet data for the day
            const fetchAggregateQuery = `
              SELECT 
                LOWER(user_handle) as user_handle,
                COUNT(*) as tweet_count,
                COALESCE(SUM(views), 0) as total_views,
                COALESCE(SUM(likes), 0) as total_likes,
                COALESCE(SUM(retweets), 0) as total_retweets,
                COALESCE(SUM(replies), 0) as total_replies
              FROM 
                mindshare_tweets
              WHERE 
                project_id = $1
                AND created_at >= $2::timestamp
                AND created_at < $3::timestamp
              GROUP BY 
                LOWER(user_handle)
            `;

            const aggregateResult = await pool.query(fetchAggregateQuery, [
              mindshareProjectId,
              `${formattedDate}T00:00:00Z`,
              nextDate.toISOString(),
            ]);

            // Process each user's aggregated data individually to avoid conflicts
            for (const row of aggregateResult.rows) {
              try {
                // Insert or update each user's data separately
                const upsertQuery = `
                  INSERT INTO loyalty_daily_tweets 
                    (project_id, tweet_date, user_handle, tweet_count, views, likes, retweets, replies, last_updated)
                  VALUES 
                    ($1, $2::date, $3, $4, $5, $6, $7, $8, NOW())
                  ON CONFLICT (project_id, tweet_date, user_handle) 
                  DO UPDATE SET
                    tweet_count = EXCLUDED.tweet_count,
                    views = EXCLUDED.views,
                    likes = EXCLUDED.likes,
                    retweets = EXCLUDED.retweets,
                    replies = EXCLUDED.replies,
                    last_updated = EXCLUDED.last_updated
                `;

                await pool.query(upsertQuery, [
                  project.id,
                  formattedDate,
                  row.user_handle,
                  row.tweet_count,
                  row.total_views,
                  row.total_likes,
                  row.total_retweets,
                  row.total_replies,
                ]);

                dailyInsertCount++;
              } catch (rowError: any) {
                // Log row-specific error but continue processing other rows
                log(
                  `Error processing row for ${row.user_handle} on ${formattedDate}: ${rowError.message}`
                );
              }
            }

            projectTweetsAggregated += dailyInsertCount;
          } catch (dayError: any) {
            // Log day-specific error but continue processing other days
            log(
              `Error in aggregation for project ${project.id} on ${formattedDate}: ${dayError.message}`
            );
          }

          projectDaysProcessed++;

          // Format for better readability
          log(
            `Aggregated ${dailyInsertCount.toLocaleString()} tweet summaries for project ${
              project.id
            } (${project.name}) on ${formattedDate}`
          );

          // Move to next day
          currentDate.setDate(currentDate.getDate() + 1);
        }

        tweetsAggregated += projectTweetsAggregated;
        daysProcessed += projectDaysProcessed;

        if (projectDaysProcessed > 0) {
          projectsUpdated++;
          // Format for better readability
          const formattedTweetsAggregated =
            projectTweetsAggregated.toLocaleString();
          log(
            `Processed ${projectDaysProcessed} days with ${formattedTweetsAggregated} tweet aggregations for project ${project.id} (${project.name})`
          );
        }
      }

      return { projectsUpdated, daysProcessed, tweetsAggregated };
    } catch (error) {
      log(
        `Error aggregating daily tweets: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Calculate metrics using the pre-computed daily tweets
   * This is a much more efficient version that uses the aggregated data
   */
  async calculateProjectMetricsFromDailyTweets(projectId: number): Promise<{
    updatedMembers: number;
    totalTweets: number;
  }> {
    try {
      // First, check if daily tweets are already aggregated for this project
      const dailyTweetsCount = await db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(loyaltyDailyTweets)
        .where(eq(loyaltyDailyTweets.project_id, projectId));

      const hasAggregatedData = dailyTweetsCount[0]?.count > 0;

      if (!hasAggregatedData) {
        // Aggregate daily tweets if not already done
        log(
          `No pre-aggregated daily tweets found for project ${projectId}. Running aggregation...`
        );
        await this.aggregateDailyTweets(false);

        // Check again after aggregation
        const recountDailyTweets = await db
          .select({
            count: sql<number>`count(*)`,
          })
          .from(loyaltyDailyTweets)
          .where(eq(loyaltyDailyTweets.project_id, projectId));

        if (recountDailyTweets[0]?.count === 0) {
          log(
            `No tweets found for project ${projectId} after aggregation attempt. Falling back to original method.`
          );
          // Fall back to original method if still no data
          return this.calculateProjectMetrics(projectId);
        }
      }

      // Get project info for follower count requirements
      const loyaltyProject = await this.getProjectById(projectId);
      if (!loyaltyProject) {
        throw new Error(`Loyalty project with ID ${projectId} not found`);
      }

      const minFollowerCount = loyaltyProject.min_follower_count || 0;

      // Get all active members
      const members = await db
        .select()
        .from(loyaltyMembers)
        .where(
          and(
            eq(loyaltyMembers.project_id, projectId),
            eq(loyaltyMembers.is_active, true)
          )
        );

      if (members.length === 0) {
        log(`No active members found for loyalty project ${projectId}`);
        return { updatedMembers: 0, totalTweets: 0 };
      }

      // Build a set of member handles for quick lookup
      const memberHandleSet = new Set(
        members.map((m) => m.twitter_handle.toLowerCase())
      );

      // Get follower counts for filtering if needed
      const memberFollowers = new Map<string, number>();

      if (minFollowerCount > 0) {
        // Get all member handles
        const memberHandles = members.map((member) => member.twitter_handle);
        const lowerMemberHandles = memberHandles.map((h) => h.toLowerCase());

        // Use a safer approach for IN queries with list of values
        let giverepProfiles = [];
        if (lowerMemberHandles.length > 0) {
          // Create a SQL query with proper string formatting
          const placeholders = lowerMemberHandles
            .map((_, i) => `$${i + 1}`)
            .join(", ");
          const queryText = `SELECT twitter_handle, follower_count 
                          FROM giverep_users 
                          WHERE LOWER(twitter_handle) IN (${placeholders})`;

          const { rows } = await pool.query(queryText, lowerMemberHandles);
          giverepProfiles = rows;
        }

        // Get follower counts from rep_users table as backup
        let repProfiles = [];
        if (lowerMemberHandles.length > 0) {
          // Create a SQL query with proper string formatting
          const placeholders = lowerMemberHandles
            .map((_, i) => `$${i + 1}`)
            .join(", ");
          const queryText = `SELECT twitter_handle, follower_count 
                          FROM rep_users 
                          WHERE LOWER(twitter_handle) IN (${placeholders})`;

          const { rows } = await pool.query(queryText, lowerMemberHandles);
          repProfiles = rows;
        }

        // Populate the follower count map, prioritizing giverep_users data
        giverepProfiles.forEach((profile) => {
          if (profile.twitter_handle && profile.follower_count !== null) {
            memberFollowers.set(
              profile.twitter_handle.toLowerCase(),
              profile.follower_count
            );
          }
        });

        // Add rep_users data if not already in the map
        repProfiles.forEach((profile) => {
          if (profile.twitter_handle && profile.follower_count !== null) {
            const lowercaseHandle = profile.twitter_handle.toLowerCase();
            if (!memberFollowers.has(lowercaseHandle)) {
              memberFollowers.set(lowercaseHandle, profile.follower_count);
            }
          }
        });
      }

      // Create a mapping of member handles to joined dates
      const memberJoinedDates = new Map<string, Date>();
      members.forEach((member) => {
        memberJoinedDates.set(
          member.twitter_handle.toLowerCase(),
          member.joined_at
        );
      });

      // For each member, get their aggregated metrics after they joined the project
      let updatedMembers = 0;
      let totalTweets = 0;

      // Prepare data for bulk update
      const metricsUpdates: Array<{
        twitter_handle: string;
        tweet_count: number;
        views: number;
        likes: number;
        retweets: number;
        replies: number;
      }> = [];

      // Use a SQL transaction for this operation
      await db.transaction(async (tx) => {
        // For each member, calculate their metrics using the aggregated daily data
        for (const member of members) {
          const lowerHandle = member.twitter_handle.toLowerCase();
          const joinedDate = member.joined_at;

          // Skip if user doesn't meet follower count requirement
          if (minFollowerCount > 0) {
            const followerCount = memberFollowers.get(lowerHandle) || 0;
            if (followerCount < minFollowerCount) {
              // Add empty metrics for this member
              metricsUpdates.push({
                twitter_handle: member.twitter_handle,
                tweet_count: 0,
                views: 0,
                likes: 0,
                retweets: 0,
                replies: 0,
              });

              continue;
            }
          }

          // Get the aggregated metrics for this user since they joined the project
          const joinedDateStr = joinedDate.toISOString().split("T")[0]; // Format as YYYY-MM-DD

          const userMetrics = await tx
            .select({
              totalTweetCount: sql<number>`COALESCE(SUM(${loyaltyDailyTweets.tweet_count}), 0)`,
              totalViews: sql<number>`COALESCE(SUM(${loyaltyDailyTweets.views}), 0)`,
              totalLikes: sql<number>`COALESCE(SUM(${loyaltyDailyTweets.likes}), 0)`,
              totalRetweets: sql<number>`COALESCE(SUM(${loyaltyDailyTweets.retweets}), 0)`,
              totalReplies: sql<number>`COALESCE(SUM(${loyaltyDailyTweets.replies}), 0)`,
            })
            .from(loyaltyDailyTweets)
            .where(
              and(
                eq(loyaltyDailyTweets.project_id, projectId),
                sql`LOWER(${loyaltyDailyTweets.user_handle}) = LOWER(${member.twitter_handle})`,
                gte(loyaltyDailyTweets.tweet_date, joinedDateStr)
              )
            );

          const metrics = {
            twitter_handle: member.twitter_handle,
            tweet_count: userMetrics[0]?.totalTweetCount || 0,
            views: userMetrics[0]?.totalViews || 0,
            likes: userMetrics[0]?.totalLikes || 0,
            retweets: userMetrics[0]?.totalRetweets || 0,
            replies: userMetrics[0]?.totalReplies || 0,
          };

          totalTweets += metrics.tweet_count;
          metricsUpdates.push(metrics);
        }
      });

      // Perform the bulk update for all members
      if (metricsUpdates.length > 0) {
        updatedMembers = await this.bulkUpdateMemberMetrics(
          projectId,
          metricsUpdates
        );
        log(
          `Updated metrics for ${updatedMembers} members in project ${projectId} using pre-aggregated daily tweets`
        );
      }

      return { updatedMembers, totalTweets };
    } catch (error) {
      log(
        `Error calculating metrics from daily tweets for project ${projectId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Fall back to original method if the optimized method fails
      log(
        `Falling back to original metrics calculation method for project ${projectId}`
      );
      return this.calculateProjectMetrics(projectId);
    }
  }

  /**
   * Delete a loyalty project and all related data
   * This deletes the project, its members, metrics, and cached leaderboard data
   */
  async deleteProject(projectId: number): Promise<boolean> {
    try {
      // First check if project exists
      const [project] = await db
        .select()
        .from(loyaltyProjects)
        .where(eq(loyaltyProjects.id, projectId));

      if (!project) {
        return false;
      }

      // Delete in order to respect foreign key constraints

      // 1. Delete cached leaderboard data (no foreign keys)
      try {
        await db
          .delete(loyaltyLeaderboard)
          .where(eq(loyaltyLeaderboard.project_id, projectId));
        log(`Deleted cached leaderboard data for project ${projectId}`);
      } catch (cacheError) {
        // Log but continue with other deletions
        log(
          `Error deleting cached leaderboard data for project ${projectId}: ${
            cacheError instanceof Error
              ? cacheError.message
              : String(cacheError)
          }`
        );
      }

      // 2. Delete daily tweets aggregations
      try {
        await db
          .delete(loyaltyDailyTweets)
          .where(eq(loyaltyDailyTweets.project_id, projectId));
        log(`Deleted daily tweet aggregations for project ${projectId}`);
      } catch (error) {
        // Log but continue with other deletions
        log(
          `Error deleting daily tweet aggregations for project ${projectId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      // 3. Delete metrics
      await db
        .delete(loyaltyMetrics)
        .where(eq(loyaltyMetrics.project_id, projectId));

      // 4. Delete members
      await db
        .delete(loyaltyMembers)
        .where(eq(loyaltyMembers.project_id, projectId));

      // 5. Finally delete the project
      await db.delete(loyaltyProjects).where(eq(loyaltyProjects.id, projectId));

      log(
        `Successfully deleted project ${projectId} (${project.name}) with all related data`
      );
      return true;
    } catch (error) {
      log(
        `Error deleting project ${projectId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Check if a project's budget has been exhausted and update its incentivized status if needed
   * Called after metric updates to ensure incentivized status is kept in sync with budget usage
   */
  async checkAndUpdateIncentiveBudget(
    projectId: number,
    forcePreserveIncentiveStatus: boolean = false
  ): Promise<boolean> {
    try {
      // Get the project
      const [project] = await db
        .select()
        .from(loyaltyProjects)
        .where(eq(loyaltyProjects.id, projectId));

      if (!project) {
        return false;
      }

      // If not incentivized, nothing to check
      if (!project.is_incentivized) {
        return false;
      }

      // If budget is exhausted, disable incentivized status
      // Note: both values are in cents
      if (
        !forcePreserveIncentiveStatus &&
        project.incentive_budget &&
        project.total_incentive_spent &&
        project.total_incentive_spent >= project.incentive_budget
      ) {
        // Convert cents to dollars for logging
        const spentDollars = (project.total_incentive_spent / 100).toFixed(2);
        const budgetDollars = (project.incentive_budget / 100).toFixed(2);

        log(
          `Budget exhausted for project ${projectId} (${project.name}): $${spentDollars}/$${budgetDollars} - Auto-disabling incentivized status`
        );

        await db
          .update(loyaltyProjects)
          .set({
            is_incentivized: false,
            updated_at: new Date(),
          })
          .where(eq(loyaltyProjects.id, projectId));

        return true;
      }

      return false;
    } catch (error) {
      log(
        `Error checking incentive budget for project ${projectId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

  /**
   * Update total incentive spent for a project based on view count
   * Called after metric updates to track spending for incentivized projects
   *
   * Note: Spending is calculated in whole number of cents (integer)
   * Price per view is stored in hundred-thousandths of a dollar
   * e.g., price_per_view of 40 means $0.0004 per view
   */
  async updateIncentiveSpending(
    projectId: number,
    newViewCount: number,
    prevViewCount: number = 0
  ): Promise<boolean> {
    try {
      // Get the project
      const [project] = await db
        .select()
        .from(loyaltyProjects)
        .where(eq(loyaltyProjects.id, projectId));

      if (!project) {
        return false;
      }

      // If not incentivized, nothing to update
      if (!project.is_incentivized) {
        return false;
      }

      // Calculate new views
      const newViews = Math.max(0, newViewCount - prevViewCount);

      // If no new views, nothing to update
      if (newViews <= 0) {
        return false;
      }

      // Calculate spending in cents (integer)
      const pricePerView = Number(project.price_per_view) || 0.0004; // Now stored as decimal

      // Calculate spending based on incentive type
      let spendingAmount: number;
      let currentSpent: number = project.total_incentive_spent || 0;
      let newSpent: number;
      let logMessage: string;

      // Handle different incentive types
      if (project.incentive_type === "points") {
        // For points, we use the price_per_view directly as points per view
        spendingAmount = newViews * pricePerView;
        newSpent = currentSpent + spendingAmount;

        console.log(
          `[SPENDING CALC] Points - Views: ${newViews}, PointsPerView: ${pricePerView}, Calculation: ${newViews} * ${pricePerView} = ${spendingAmount} points`
        );
        logMessage = `Updated incentive spending for project ${projectId} (${project.name}): +${spendingAmount} points for ${newViews} new views (Total: ${newSpent} points)`;
      } else {
        // For USDC, pricePerView is already in dollars, convert to cents for storage
        spendingAmount = Math.round(newViews * pricePerView * 100); // Result is in cents
        newSpent = currentSpent + spendingAmount;

        console.log(
          `[SPENDING CALC] USDC - Views: ${newViews}, PricePerView: ${pricePerView} USD, Calculation: ${newViews} * ${pricePerView} = $${(
            newViews * pricePerView
          ).toFixed(2)} (${spendingAmount} cents)`
        );

        // For logging, convert cents to dollars
        const spendingDollars = spendingAmount / 100;
        const newSpentDollars = newSpent / 100;
        logMessage = `Updated incentive spending for project ${projectId} (${
          project.name
        }): +$${spendingDollars.toFixed(
          2
        )} for ${newViews} new views (Total: $${newSpentDollars.toFixed(2)})`;
      }

      // Update total spent
      await db
        .update(loyaltyProjects)
        .set({
          total_incentive_spent: newSpent,
          updated_at: new Date(),
        })
        .where(eq(loyaltyProjects.id, projectId));

      log(logMessage);

      // Check if budget is now exhausted but preserve incentive status during bulk operations
      // Only turn off incentives when directly updating spending for a single project
      await this.checkAndUpdateIncentiveBudget(projectId, true);

      return true;
    } catch (error) {
      log(
        `Error updating incentive spending for project ${projectId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

  /**
   * Get all members with metrics across all active projects
   * @param includeMetrics Whether to include metrics data
   * @returns Array of members with metrics
   */
  async getAllMembersWithMetrics(
    includeMetrics: boolean = true
  ): Promise<ExtendedLoyaltyMember[]> {
    try {
      log(
        `Getting all members${includeMetrics ? " with metrics" : ""} for export`
      );

      // Query to get all members with their metrics
      const query = `
        SELECT 
          lm.id, 
          lm.project_id, 
          lm.twitter_handle, 
          lm.joined_at, 
          lm.is_active,
          lp.name as project_name,
          ${
            includeMetrics
              ? `
          lmet.tweet_count, 
          lmet.views, 
          lmet.likes, 
          lmet.retweets, 
          lmet.replies,
          lmet.estimated_payment,`
              : ""
          }
          gu.display_name, 
          gu.profile_picture, 
          gu.profile_url
        FROM loyalty_members lm
        JOIN loyalty_projects lp ON lp.id = lm.project_id
        ${
          includeMetrics
            ? `
        LEFT JOIN loyalty_metrics lmet ON 
          lmet.project_id = lm.project_id AND 
          LOWER(lmet.twitter_handle) = LOWER(lm.twitter_handle)`
            : ""
        }
        LEFT JOIN giverep_users gu ON 
          LOWER(gu.twitter_handle) = LOWER(lm.twitter_handle)
        WHERE 
          lm.is_active = true AND
          lp.is_active = true
        ORDER BY lm.joined_at DESC
      `;

      const { rows: results } = await pool.query(query);

      log(`Found ${results.length} total members across all projects`);

      if (results.length === 0) {
        return [];
      }

      // Map raw query results to ExtendedLoyaltyMember objects
      const extendedMembers: ExtendedLoyaltyMember[] = results.map((row) => {
        // Create the metrics object if any metrics data exists and includeMetrics is true
        const metrics =
          includeMetrics && (row.tweet_count !== null || row.views !== null)
            ? {
                id: 0, // Not used in the frontend
                project_id: row.project_id,
                twitter_handle: row.twitter_handle,
                twitter_id: null, // Added missing field
                tweet_count: row.tweet_count || 0,
                views: row.views || 0,
                likes: row.likes || 0,
                retweets: row.retweets || 0,
                replies: row.replies || 0,
                estimated_payment: row.estimated_payment || 0,
                last_updated: new Date(),
              }
            : undefined;

        return {
          id: row.id,
          project_id: row.project_id,
          project_name: row.project_name, // Add project name for reference
          twitter_handle: row.twitter_handle,
          joined_at: row.joined_at,
          is_active: row.is_active,
          username: row.display_name || row.twitter_handle,
          profilePicture: row.profile_picture || null,
          profileUrl: row.profile_url || null,
          metrics: metrics,
        };
      });

      return extendedMembers;
    } catch (error) {
      log(
        `Error getting all members with metrics: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Award reputation points based on tweet views
   * Users earn 1 reputation point per 100 views when tweeting about projects in the loyalty list
   * @param twitterHandle User's Twitter handle
   * @param viewDifference New views - previous views
   * @param projectId The loyalty project ID
   * @param tweetId The tweet ID (optional)
   * @returns Boolean indicating if reputation was successfully awarded
   */
  async awardReputationForViews(
    twitterHandle: string,
    viewDifference: number,
    projectId: number,
    tweetId?: string
  ): Promise<boolean> {
    try {
      // Skip if no new views
      if (viewDifference <= 0) {
        return false;
      }

      // Import repPoints table and other necessary types
      const { repPoints, repUsers } = await import(
        "../../db/reputation_schema"
      );

      // Calculate reputation points to award (0.1 point per view)
      // Note: viewDifference is already validated by calculateMetricDifference before this function is called
      const pointsToAward = viewDifference * 0.1;

      // Skip if no points to award
      if (pointsToAward <= 0) {
        return false;
      }

      // Get project details for reference
      const project = await this.getProjectById(projectId);
      if (!project) {
        log(`Error awarding view reputation: Project ${projectId} not found`);
        return false;
      }

      // Normalize handle for consistency
      const normalizedHandle = twitterHandle.toLowerCase();

      // Check if user exists in reputation system, create if not
      let repUser = await db.query.repUsers.findFirst({
        where: sql`LOWER(${repUsers.twitterHandle}) = ${normalizedHandle}`,
      });

      if (!repUser) {
        // Try to get user details from giverep_users
        const giverepUser = await db.query.giverepUsers.findFirst({
          where: sql`LOWER(${giverepUsers.twitter_handle}) = ${normalizedHandle}`,
        });

        // Create user in reputation system
        await db.insert(repUsers).values({
          twitterHandle: normalizedHandle,
          profileUrl:
            giverepUser?.profile_picture ||
            `https://twitter.com/${normalizedHandle}`,
          followerCount: giverepUser?.follower_count || 0,
          lastUpdated: new Date(),
        });

        log(
          `Created new reputation user for view rewards: ${normalizedHandle}`
        );
      }

      // Generate a unique ID if none is provided
      const uniqueId =
        tweetId ||
        `loyalty_views_${projectId}_${normalizedHandle}_${Date.now()}`;

      // Award reputation points (format points to 1 decimal place for display)
      const formattedPoints = pointsToAward.toFixed(1);

      // Convert points to integer as the database field is an integer
      // Ensure the value is within safe integer range
      let pointsAsInteger = Math.round(pointsToAward);

      // PostgreSQL integer type has a max value of 2,147,483,647
      // Ensure we stay well below this limit to prevent database errors
      const MAX_SAFE_INTEGER_FOR_DB = 1000000; // Keep well below the max to be safe
      if (pointsAsInteger > MAX_SAFE_INTEGER_FOR_DB) {
        log(
          `[WARNING] Points calculation resulted in value too large (${pointsAsInteger}), capping at ${MAX_SAFE_INTEGER_FOR_DB}`,
          "loyalty"
        );
        pointsAsInteger = MAX_SAFE_INTEGER_FOR_DB;
      }

      // Set the appropriate message based on whether the values were capped
      let tweetContent = "";
      if (pointsAsInteger === MAX_SAFE_INTEGER_FOR_DB) {
        // If points were capped, indicate this in the message
        tweetContent = `Earned ${formattedPoints} points for ${viewDifference} views on tweets about project: ${project.name} (0.1 points per view, points capped for database safety)`;
      } else {
        tweetContent = `Earned ${formattedPoints} points for ${viewDifference} views on tweets about project: ${project.name} (0.1 points per view)`;
      }

      // Use repPointsService for consistent Twitter ID tracking
      await repPointsService.createRepPoint({
        fromHandle: "giverep", // System-awarded point
        toHandle: normalizedHandle,
        tweetId: uniqueId,
        tweetContent,
        createdAt: new Date(),
        points: pointsAsInteger,
      });

      // Enhanced logging with more diagnostic information
      if (
        viewDifference > 10000000 ||
        pointsAsInteger === MAX_SAFE_INTEGER_FOR_DB
      ) {
        log(
          `Awarded ${formattedPoints} reputation points (0.1 per view) to ${normalizedHandle} for ${safeViewDifference} views (capped from ${viewDifference}) on project ${project.name}`
        );
      } else {
        log(
          `Awarded ${formattedPoints} reputation points (0.1 per view) to ${normalizedHandle} for ${viewDifference} views on project ${project.name}`
        );
      }

      return true;
    } catch (error) {
      // More detailed error logging to help diagnose issues
      log(
        `Error awarding reputation for views: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      log(
        `Error context: twitterHandle=${twitterHandle}, viewDifference=${viewDifference}, projectId=${projectId}, calculated points=${
          viewDifference * 0.1
        }`
      );
      return false;
    }
  }
}

export const loyaltyService = new LoyaltyService();
