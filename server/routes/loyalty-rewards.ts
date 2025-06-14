import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { and, desc, eq, sql } from "drizzle-orm";
import express from "express";
import { phantom } from "../../client/src/lib/move/GiveRepClaim/_framework/reified";
import { PACKAGE_ID as GiveRepClaimPackageId } from "../../client/src/lib/move/GiveRepClaim/giverep_claim";
import {
  ClaimEvent,
  isClaimEvent,
} from "../../client/src/lib/move/GiveRepClaim/giverep_claim/giverep-claim/structs";
import { db } from "../../db";
import { legalTermsAgreement } from "../../db/legal_terms_schema";
import {
  loyaltyProjects,
  loyaltyRewardConfig,
  loyaltyRewards,
} from "../../db/loyalty_schema";
import { repUsers } from "../../db/reputation_schema";
import { trustUsers } from "../../db/trust_count_schema";
import { verifyTwitterIdentity } from "../lib/verifyTwitterIdentity";
import { isAdminOrLoyaltyManager } from "../middleware/loyaltyAuth";
import { LeaderboardEntry, LoyaltyService } from "../services/loyalty-service";

const router = express.Router();

const loyaltyService = new LoyaltyService();

// Common logic for fetching user rewards (internal use - includes sensitive data)
async function getUserRewardsInternal(
  twitterHandle: string,
  options: { showNotes?: boolean } = {}
) {
  console.log(`Fetching rewards for Twitter handle: ${twitterHandle}`);

  // Convert to lowercase for case-insensitive search
  const lowerHandle = twitterHandle.toLowerCase();

  // Get all rewards for this user across all projects with project and contract info
  const rewardsWithProjects = await db
    .select({
      reward: loyaltyRewards,
      project: loyaltyProjects,
      contract: loyaltyRewardConfig,
    })
    .from(loyaltyRewards)
    .innerJoin(
      loyaltyProjects,
      eq(loyaltyRewards.project_id, loyaltyProjects.id)
    )
    .leftJoin(
      loyaltyRewardConfig,
      eq(loyaltyRewards.project_id, loyaltyRewardConfig.project_id)
    )
    .where(
      sql`LOWER(${loyaltyRewards.twitter_handle}) = LOWER(${twitterHandle})`
    );

  console.log(
    `Found ${rewardsWithProjects.length} rewards for ${twitterHandle}`
  );

  // Transform rewards to include availability status
  const transformedRewards = rewardsWithProjects.map(
    ({ reward, project, contract }) => {
      let status: "available" | "not_available" | "claimed" = "not_available";
      let reason: string | null = null;

      if (reward.claimed) {
        status = "claimed";
        reason = "Already claimed";
      } else if (!contract) {
        status = "not_available";
        reason = "No contract configured for this project";
      } else if (!contract.is_available) {
        status = "not_available";
        reason = "Contract is not available for claims";
      } else {
        status = "available";
      }

      const totalAmount =
        (reward.initial_amount || 0) +
        (reward.adjust_amount || 0) +
        (reward.manual_adjustment || 0);

      return {
        id: reward.id,
        project_id: reward.project_id,
        project_name: project.name,
        project_logo: project.logo_url,
        twitter_handle: reward.twitter_handle,
        twitter_id: reward.twitter_id,
        token_type: reward.token_type || contract?.coin_type || "Unknown",
        initial_amount: reward.initial_amount,
        adjust_amount: reward.adjust_amount,
        manual_adjustment: reward.manual_adjustment,
        total_amount: totalAmount,
        notes: options.showNotes === false ? "" : reward.notes,
        tags: reward.tags,
        claimed: reward.claimed,
        claimer: reward.claimer,
        claimed_at: reward.claimed_at,
        claim_transaction_digest: reward.claim_transaction_digest,
        created_at: reward.created_at,
        updated_at: reward.updated_at,
        status,
        reason,
        contract_available: contract?.is_available || false,
        pool_object_id: contract?.pool_object_id || null,
      };
    }
  );

  // Sort rewards: available first, then not_available, then claimed
  const sortedRewards = transformedRewards.sort((a, b) => {
    const statusOrder = { available: 0, not_available: 1, claimed: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  return {
    success: true,
    rewards: sortedRewards,
    summary: {
      total: sortedRewards.length,
      available: sortedRewards.filter((r) => r.status === "available").length,
      not_available: sortedRewards.filter((r) => r.status === "not_available")
        .length,
      claimed: sortedRewards.filter((r) => r.status === "claimed").length,
    },
  };
}

// Public-safe version of getUserRewards
async function getUserRewardsPublic(twitterHandle: string) {
  console.log(`Fetching public rewards for Twitter handle: ${twitterHandle}`);

  // Convert to lowercase for case-insensitive search
  const lowerHandle = twitterHandle.toLowerCase();

  // Get all rewards for this user across all projects with project and contract info
  const rewardsWithProjects = await db
    .select({
      reward: loyaltyRewards,
      project: loyaltyProjects,
      contract: loyaltyRewardConfig,
    })
    .from(loyaltyRewards)
    .innerJoin(
      loyaltyProjects,
      eq(loyaltyRewards.project_id, loyaltyProjects.id)
    )
    .leftJoin(
      loyaltyRewardConfig,
      eq(loyaltyRewards.project_id, loyaltyRewardConfig.project_id)
    )
    .where(
      sql`LOWER(${loyaltyRewards.twitter_handle}) = LOWER(${twitterHandle})`
    );

  console.log(
    `Found ${rewardsWithProjects.length} rewards for ${twitterHandle}`
  );

  // Transform rewards to include only public-safe information
  const transformedRewards = rewardsWithProjects.map(
    ({ reward, project, contract }) => {
      let status: "available" | "not_available" | "claimed" = "not_available";
      let reason: string | null = null;

      if (reward.claimed) {
        status = "claimed";
        reason = "Already claimed";
      } else if (!contract) {
        status = "not_available";
        reason = "No contract configured for this project";
      } else if (!contract.is_available) {
        status = "not_available";
        reason = "Contract is not available for claims";
      } else {
        status = "available";
      }

      const totalAmount =
        (reward.initial_amount || 0) +
        (reward.adjust_amount || 0) +
        (reward.manual_adjustment || 0);

      return {
        id: reward.id,
        project_id: reward.project_id,
        project_name: project.name,
        project_logo: project.logo_url,
        twitter_handle: reward.twitter_handle,
        twitter_id: reward.twitter_id,
        token_type: reward.token_type || contract?.coin_type || "Unknown",
        amount: totalAmount, // Only show the final amount
        claimed: reward.claimed,
        claimer: reward.claimer,
        claimed_at: reward.claimed_at,
        claim_transaction_digest: reward.claim_transaction_digest,
        created_at: reward.created_at,
        updated_at: reward.updated_at,
        status,
        reason,
        contract_available: contract?.is_available || false,
        pool_object_id: contract?.pool_object_id || null,
      };
    }
  );

  // Sort rewards: available first, then not_available, then claimed
  const sortedRewards = transformedRewards.sort((a, b) => {
    const statusOrder = { available: 0, not_available: 1, claimed: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  return {
    success: true,
    rewards: sortedRewards,
    summary: {
      total: sortedRewards.length,
      available: sortedRewards.filter((r) => r.status === "available").length,
      not_available: sortedRewards.filter((r) => r.status === "not_available")
        .length,
      claimed: sortedRewards.filter((r) => r.status === "claimed").length,
    },
  };
}

// GET endpoint - now returns public-safe data
router.get("/user-rewards/:handle", async (req, res) => {
  try {
    const result = await getUserRewardsPublic(req.params.handle);
    res.json(result);
  } catch (error) {
    console.error("Error fetching user rewards:", error);
    res.status(500).json({ error: "Failed to fetch user rewards" });
  }
});

// POST endpoint to bypass Cloudflare cache - now returns public-safe data
router.post("/user-rewards", async (req, res) => {
  try {
    const { twitterHandle } = req.body;

    if (!twitterHandle) {
      return res.status(400).json({ error: "Twitter handle is required" });
    }

    const result = await getUserRewardsPublic(twitterHandle);

    res.json(result);
  } catch (error) {
    console.error("Error fetching user rewards:", error);
    res.status(500).json({ error: "Failed to fetch user rewards" });
  }
});

// Admin endpoint to get user rewards with full details
router.get(
  "/admin/user-rewards/:handle",
  isAdminOrLoyaltyManager,
  async (req, res) => {
    try {
      const result = await getUserRewardsInternal(req.params.handle, {
        showNotes: true,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching user rewards (admin):", error);
      res.status(500).json({ error: "Failed to fetch user rewards" });
    }
  }
);

// Get all rewards for a project with pagination
router.get(
  "/projects/:id/rewards",
  isAdminOrLoyaltyManager,
  async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 50000); // Max 50000 per page for backwards compatibility
      const offset = (page - 1) * limit;

      // Parse sorting parameters
      const sortField = (req.query.sortField as string) || "total_amount";
      const sortDirection =
        (req.query.sortDirection as string) === "asc" ? "asc" : "desc";

      // Check if project exists
      const project = await db.query.loyaltyProjects.findFirst({
        where: eq(loyaltyProjects.id, projectId),
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Get total count for pagination metadata
      const totalCountResult = await db
        .select({ count: sql`COUNT(*)::int` })
        .from(loyaltyRewards)
        .where(eq(loyaltyRewards.project_id, projectId));

      const totalCount = totalCountResult[0]?.count || 0;

      // Build order by clause based on sort field (using lr alias)
      let orderByClause;
      switch (sortField) {
        case "twitter_handle":
          orderByClause =
            sortDirection === "asc"
              ? sql`lr.twitter_handle ASC`
              : sql`lr.twitter_handle DESC`;
          break;
        case "initial_amount":
          orderByClause =
            sortDirection === "asc"
              ? sql`lr.initial_amount ASC`
              : sql`lr.initial_amount DESC`;
          break;
        case "adjust_amount":
          orderByClause =
            sortDirection === "asc"
              ? sql`lr.adjust_amount ASC`
              : sql`lr.adjust_amount DESC`;
          break;
        case "total_amount":
          orderByClause =
            sortDirection === "asc"
              ? sql`(lr.initial_amount + lr.adjust_amount + lr.manual_adjustment) ASC`
              : sql`(lr.initial_amount + lr.adjust_amount + lr.manual_adjustment) DESC`;
          break;
        case "token_type":
          orderByClause =
            sortDirection === "asc"
              ? sql`lr.token_type ASC`
              : sql`lr.token_type DESC`;
          break;
        case "created_at":
          orderByClause =
            sortDirection === "asc"
              ? sql`lr.created_at ASC`
              : sql`lr.created_at DESC`;
          break;
        case "claimed":
          orderByClause =
            sortDirection === "asc"
              ? sql`lr.claimed ASC`
              : sql`lr.claimed DESC`;
          break;
        default:
          // Default to total amount descending
          orderByClause = sql`(lr.initial_amount + lr.adjust_amount + lr.manual_adjustment) DESC`;
      }

      // Get paginated and sorted rewards with influencer status and trusted follower count
      const rewardsQuery = sql`
        SELECT 
          lr.*,
          COALESCE(ru.is_influencer, false) as is_influencer,
          COALESCE(tu.trusted_follower_count, 0) as trusted_follower_count
        FROM loyalty_rewards lr
        LEFT JOIN rep_users ru ON LOWER(ru.twitter_handle) = LOWER(lr.twitter_handle)
        LEFT JOIN trust_users tu ON LOWER(tu.twitter_handle) = LOWER(lr.twitter_handle)
        WHERE lr.project_id = ${projectId}
        ORDER BY ${orderByClause}
        LIMIT ${limit}
        OFFSET ${offset}
      `;
      
      const rewardsResult = await db.execute(rewardsQuery);
      const rewards = rewardsResult.rows.map(row => ({
        ...row,
        initial_amount: Number(row.initial_amount),
        adjust_amount: Number(row.adjust_amount),
        manual_adjustment: row.manual_adjustment ? Number(row.manual_adjustment) : 0,
        is_influencer: Boolean(row.is_influencer),
        trusted_follower_count: Number(row.trusted_follower_count || 0)
      }));

      // Return paginated response
      res.json({
        rewards,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNext: page * limit < totalCount,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      console.error("Error getting rewards:", error);
      res.status(500).json({ error: "Failed to get rewards" });
    }
  }
);

// Search rewards for a project
router.get(
  "/projects/:id/rewards/search",
  isAdminOrLoyaltyManager,
  async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      const { twitter_handle, claimed, tags } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = (page - 1) * limit;

      // Parse sorting parameters
      const sortField = (req.query.sortField as string) || "total_amount";
      const sortDirection =
        (req.query.sortDirection as string) === "asc" ? "asc" : "desc";

      // Build where conditions
      const whereConditions = [eq(loyaltyRewards.project_id, projectId)];

      if (twitter_handle) {
        whereConditions.push(
          sql`LOWER(${
            loyaltyRewards.twitter_handle
          }) LIKE LOWER(${`%${twitter_handle}%`})`
        );
      }

      if (claimed !== undefined) {
        whereConditions.push(eq(loyaltyRewards.claimed, claimed === "true"));
      }

      if (tags && typeof tags === "string") {
        whereConditions.push(
          sql`${loyaltyRewards.tags} @> ARRAY[${tags}]::text[]`
        );
      }

      // Get filtered count
      const countResult = await db
        .select({ count: sql`COUNT(*)::int` })
        .from(loyaltyRewards)
        .where(and(...whereConditions));

      const totalCount = countResult[0]?.count || 0;

      // Build order by clause based on sort field
      let orderByClause;
      switch (sortField) {
        case "twitter_handle":
          orderByClause =
            sortDirection === "asc"
              ? sql`${loyaltyRewards.twitter_handle} ASC`
              : sql`${loyaltyRewards.twitter_handle} DESC`;
          break;
        case "initial_amount":
          orderByClause =
            sortDirection === "asc"
              ? sql`${loyaltyRewards.initial_amount} ASC`
              : sql`${loyaltyRewards.initial_amount} DESC`;
          break;
        case "adjust_amount":
          orderByClause =
            sortDirection === "asc"
              ? sql`${loyaltyRewards.adjust_amount} ASC`
              : sql`${loyaltyRewards.adjust_amount} DESC`;
          break;
        case "total_amount":
          orderByClause =
            sortDirection === "asc"
              ? sql`(${loyaltyRewards.initial_amount} + ${loyaltyRewards.adjust_amount} + ${loyaltyRewards.manual_adjustment}) ASC`
              : sql`(${loyaltyRewards.initial_amount} + ${loyaltyRewards.adjust_amount} + ${loyaltyRewards.manual_adjustment}) DESC`;
          break;
        case "token_type":
          orderByClause =
            sortDirection === "asc"
              ? sql`${loyaltyRewards.token_type} ASC`
              : sql`${loyaltyRewards.token_type} DESC`;
          break;
        case "created_at":
          orderByClause =
            sortDirection === "asc"
              ? sql`${loyaltyRewards.created_at} ASC`
              : sql`${loyaltyRewards.created_at} DESC`;
          break;
        case "claimed":
          orderByClause =
            sortDirection === "asc"
              ? sql`${loyaltyRewards.claimed} ASC`
              : sql`${loyaltyRewards.claimed} DESC`;
          break;
        default:
          // Default to total amount descending
          orderByClause = sql`(${loyaltyRewards.initial_amount} + ${loyaltyRewards.adjust_amount} + ${loyaltyRewards.manual_adjustment}) DESC`;
      }

      // Get filtered rewards - use the Drizzle approach with is_influencer and trusted_follower_count in select
      const rewardsData = await db
        .select({
          id: loyaltyRewards.id,
          project_id: loyaltyRewards.project_id,
          twitter_handle: loyaltyRewards.twitter_handle,
          twitter_id: loyaltyRewards.twitter_id,
          wallet_address: loyaltyRewards.wallet_address,
          initial_amount: loyaltyRewards.initial_amount,
          adjust_amount: loyaltyRewards.adjust_amount,
          manual_adjustment: loyaltyRewards.manual_adjustment,
          notes: loyaltyRewards.notes,
          tags: loyaltyRewards.tags,
          token_type: loyaltyRewards.token_type,
          claim_transaction_digest: loyaltyRewards.claim_transaction_digest,
          claimer: loyaltyRewards.claimer,
          claimed: loyaltyRewards.claimed,
          created_at: loyaltyRewards.created_at,
          updated_at: loyaltyRewards.updated_at,
          is_influencer: sql<boolean>`COALESCE(${repUsers.is_influencer}, false)`,
          trusted_follower_count: sql<number>`COALESCE(${trustUsers.trusted_follower_count}, 0)`,
        })
        .from(loyaltyRewards)
        .leftJoin(repUsers, sql`LOWER(${repUsers.twitter_handle}) = LOWER(${loyaltyRewards.twitter_handle})`)
        .leftJoin(trustUsers, sql`LOWER(${trustUsers.twitter_handle}) = LOWER(${loyaltyRewards.twitter_handle})`)
        .where(and(...whereConditions))
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset);

      // Ensure numeric fields are numbers
      const rewards = rewardsData.map(row => ({
        ...row,
        initial_amount: Number(row.initial_amount),
        adjust_amount: Number(row.adjust_amount),
        manual_adjustment: row.manual_adjustment ? Number(row.manual_adjustment) : 0,
        trusted_follower_count: Number(row.trusted_follower_count || 0),
      }));

      res.json({
        rewards,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNext: page * limit < totalCount,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      console.error("Error searching rewards:", error);
      res.status(500).json({ error: "Failed to search rewards" });
    }
  }
);

// Import rewards from leaderboard
router.post(
  "/projects/:id/import-rewards",
  isAdminOrLoyaltyManager,
  async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      const { tokenType, totalRewards, decimals, startDate, endDate } =
        req.body;

      if (!tokenType) {
        return res.status(400).json({ error: "Token type is required" });
      }

      if (!totalRewards || totalRewards <= 0) {
        return res.status(400).json({
          error: "Total rewards amount is required and must be positive",
        });
      }

      // Check if project exists
      const project = await db.query.loyaltyProjects.findFirst({
        where: eq(loyaltyProjects.id, projectId),
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Parse and validate date parameters
      let startDateTime: Date | undefined;
      let endDateTime: Date | undefined;

      if (startDate) {
        startDateTime = new Date(startDate);
        startDateTime.setHours(0, 0, 0, 0);

        if (isNaN(startDateTime.getTime())) {
          return res
            .status(400)
            .json({ error: "Invalid startDate format. Use YYYY-MM-DD." });
        }
      }

      if (endDate) {
        endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);

        if (isNaN(endDateTime.getTime())) {
          return res
            .status(400)
            .json({ error: "Invalid endDate format. Use YYYY-MM-DD." });
        }
      }

      // Fetch leaderboard data using loyalty service V1
      const leaderboardData = await loyaltyService.getProjectLeaderboardV1(
        projectId,
        startDate,
        endDate
      );

      if (
        !leaderboardData ||
        !Array.isArray(leaderboardData) ||
        leaderboardData.length === 0
      ) {
        return res
          .status(404)
          .json({ error: "No leaderboard data found for import" });
      }

      // Check if rewards already exist for this project
      const existingRewards = await db.query.loyaltyRewards.findMany({
        where: eq(loyaltyRewards.project_id, projectId),
      });

      // Instead of throwing an error, just log and continue if rewards already exist
      if (existingRewards.length > 0) {
        console.log(
          `Found ${existingRewards.length} existing rewards for project ${projectId}, will add more`
        );
        // We'll continue with the import process instead of returning an error
      }

      // Get trusted follower counts for all users
      const twitterHandles = leaderboardData.map((entry: any) =>
        entry.twitter_handle.toLowerCase()
      );

      const trustedFollowerCounts: Array<{
        twitter_handle: string;
        trusted_follower_count: number | null;
      }> = [];

      // Helper function to fetch trusted followers with a given batch size
      const fetchTrustedFollowersWithBatchSize = async (
        batchSize: number | null
      ): Promise<typeof trustedFollowerCounts> => {
        const results: typeof trustedFollowerCounts = [];

        if (batchSize === null) {
          // Try to fetch all at once
          console.log(
            `[loyalty] Attempting to fetch trusted followers for all ${twitterHandles.length} handles in a single query...`
          );

          const allResults = await db
            .select({
              twitter_handle: trustUsers.twitter_handle,
              trusted_follower_count: trustUsers.trusted_follower_count,
            })
            .from(trustUsers)
            .where(
              sql`LOWER(${trustUsers.twitter_handle}) = ANY(ARRAY[${sql.join(
                twitterHandles.map((h) => sql`${h.toLowerCase()}`),
                sql`, `
              )}])`
            );

          return allResults;
        } else {
          // Fetch in batches
          console.log(
            `[loyalty] Fetching trusted followers in batches of ${batchSize}...`
          );

          for (let i = 0; i < twitterHandles.length; i += batchSize) {
            const handleBatch = twitterHandles.slice(i, i + batchSize);

            const batchResults = await db
              .select({
                twitter_handle: trustUsers.twitter_handle,
                trusted_follower_count: trustUsers.trusted_follower_count,
              })
              .from(trustUsers)
              .where(
                sql`LOWER(${trustUsers.twitter_handle}) = ANY(ARRAY[${sql.join(
                  handleBatch.map((h) => sql`${h.toLowerCase()}`),
                  sql`, `
                )}])`
              );

            results.push(...batchResults);
          }

          return results;
        }
      };

      // Progressive fallback strategy
      const batchSizes = [null, 50000, 25000, 10000, 5000, 1000]; // null means try all at once

      for (const batchSize of batchSizes) {
        try {
          const results = await fetchTrustedFollowersWithBatchSize(batchSize);
          trustedFollowerCounts.push(...results);
          console.log(
            `[loyalty] Fetched trusted follower counts for ${
              results.length
            } users${
              batchSize ? ` (using batch size ${batchSize})` : " (single query)"
            }`
          );
          break; // Success, exit the loop
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          if (batchSize === batchSizes[batchSizes.length - 1]) {
            // Last attempt failed
            console.error(
              `[loyalty] Error fetching trusted followers even with smallest batch size: ${errorMessage}`
            );
            // Continue with empty array - non-critical for import
            break;
          } else {
            // Try with smaller batch size
            const nextBatchSize = batchSizes[batchSizes.indexOf(batchSize) + 1];
            console.log(
              `[loyalty] Failed to fetch trusted followers${
                batchSize ? ` with batch size ${batchSize}` : " in single query"
              }: ${errorMessage}. ` +
                `Retrying with ${
                  nextBatchSize
                    ? `batch size ${nextBatchSize}`
                    : "smaller batches"
                }...`
            );
          }
        }
      }

      // Create a map for easy lookup
      const trustedFollowerMap = new Map<string, number>();
      trustedFollowerCounts.forEach((item) => {
        trustedFollowerMap.set(
          item.twitter_handle.toLowerCase(),
          item.trusted_follower_count || 0
        );
      });

      // Use provided decimals or default to 9
      const tokenDecimals = decimals || 9;

      // Calculate initial rewards based on leaderboard data and price per view
      let totalCalculatedAmount = 0;
      const initialRewards = leaderboardData.map((entry: LeaderboardEntry) => {
        // Calculate initial amount based on views and price per view
        const viewCount = entry.views || 0;
        const pricePerView = Number(project.price_per_view) || 0.0004; // Now stored as decimal directly

        // Calculate amount: views * price per view
        // pricePerView is now stored as the actual USD value (e.g., 0.0001)
        // This gives us the amount in human-readable tokens
        const baseAmountInTokens = viewCount * pricePerView;

        // Convert to raw units for storage
        const baseAmountRaw = Math.round(
          baseAmountInTokens * Math.pow(10, tokenDecimals)
        );

        // Get trusted follower count
        const trustedFollowers =
          trustedFollowerMap.get(entry.twitter_handle.toLowerCase()) || 0;

        // Apply trusted follower adjustment
        let adjustedAmountRaw = baseAmountRaw;
        let adjustmentNote = "";
        if (trustedFollowers < 50) {
          // Reduce by 30% if less than 50 trusted followers
          adjustedAmountRaw = Math.round(baseAmountRaw * 0.7);
          adjustmentNote = ` (-30% for ${trustedFollowers} trusted followers)`;
        } else {
          // Increase by 30% if 50 or more trusted followers
          adjustedAmountRaw = Math.round(baseAmountRaw * 1.3);
          adjustmentNote = ` (+30% for ${trustedFollowers} trusted followers)`;
        }

        totalCalculatedAmount += adjustedAmountRaw;

        return {
          twitter_handle: entry.twitter_handle,
          twitter_id: entry.twitter_id,
          viewCount,
          baseAmountRaw,
          adjustedAmountRaw,
          trustedFollowers,
          adjustmentNote,
        };
      });

      // Scale all rewards to match the total rewards budget
      // Both totalRewards and totalCalculatedAmount are now in raw units
      // Avoid division by zero
      const scalingFactor =
        totalCalculatedAmount > 0 ? totalRewards / totalCalculatedAmount : 0;

      // Log if there's an issue with the scaling
      if (!Number.isFinite(scalingFactor)) {
        console.error(
          `Invalid scaling factor: totalRewards=${totalRewards}, totalCalculatedAmount=${totalCalculatedAmount}, scalingFactor=${scalingFactor}`
        );
      }

      // Calculate final rewards and filter out small amounts
      const rewardsToInsert = initialRewards
        .map((reward) => {
          const scaledAmount = Math.round(
            reward.adjustedAmountRaw * scalingFactor
          );
          const dateRangeNote =
            startDate && endDate ? ` from ${startDate} to ${endDate}` : "";

          // Validate amounts to prevent NaN or Infinity
          const validInitialAmount = Number.isFinite(reward.baseAmountRaw)
            ? reward.baseAmountRaw
            : 0;
          const validScaledAmount = Number.isFinite(scaledAmount)
            ? scaledAmount
            : 0;
          const adjustAmount = validScaledAmount - validInitialAmount;

          // Calculate the actual multiplier per view
          const pricePerView = Number(project.price_per_view) || 0.0004;
          const actualMultiplierPerView = pricePerView * scalingFactor;

          // Calculate total amount in human-readable format (after decimal parsing)
          const totalAmountHuman =
            validScaledAmount / Math.pow(10, tokenDecimals);

          // Skip if total amount is less than 0.1
          if (totalAmountHuman < 0.1) {
            return null;
          }

          return {
            project_id: projectId,
            twitter_handle: reward.twitter_handle,
            twitter_id: reward.twitter_id ? Number(reward.twitter_id) : null,
            token_type: tokenType,
            initial_amount: validInitialAmount,
            adjust_amount: adjustAmount,
            notes: `Imported from leaderboard${dateRangeNote}. Views: ${
              reward.viewCount
            }, Scaled by ${actualMultiplierPerView.toFixed(9)} per view${
              reward.adjustmentNote
            }.`,
            tags: ["auto-imported"],
            claimed: false,
          };
        })
        .filter((reward) => reward !== null); // Remove null entries

      // Log filtering results
      const filteredCount = initialRewards.length - rewardsToInsert.length;
      if (filteredCount > 0) {
        console.log(
          `Filtered out ${filteredCount} rewards with amounts less than 0.1 ${tokenType}`
        );
      }

      // Insert rewards into database in batches to avoid stack overflow
      if (rewardsToInsert.length > 0) {
        // Batch size - process 5000 records at a time for efficiency
        const BATCH_SIZE = 5000;
        let totalInserted = 0;

        console.log(
          `Inserting ${rewardsToInsert.length} rewards in batches of ${BATCH_SIZE}...`
        );

        // Process in batches
        for (let i = 0; i < rewardsToInsert.length; i += BATCH_SIZE) {
          const batch = rewardsToInsert.slice(i, i + BATCH_SIZE);

          try {
            await db.insert(loyaltyRewards).values(batch);
            totalInserted += batch.length;

            console.log(
              `Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
                rewardsToInsert.length / BATCH_SIZE
              )} (${totalInserted}/${rewardsToInsert.length} rewards)`
            );
          } catch (batchError) {
            console.error(
              `Error inserting batch starting at index ${i}:`,
              batchError
            );
            return res.status(500).json({
              error: "Failed to import rewards",
              message: `Successfully imported ${totalInserted} rewards before encountering an error`,
              totalAttempted: rewardsToInsert.length,
            });
          }
        }

        // Send response immediately
        res.status(201).json({
          success: true,
          count: totalInserted,
          message: `Imported ${totalInserted} rewards in ${Math.ceil(
            rewardsToInsert.length / BATCH_SIZE
          )} batches${
            filteredCount > 0
              ? ` (filtered out ${filteredCount} small rewards)`
              : ""
          }. Relevance calculation will be triggered automatically.`,
          summary: {
            totalRewardsAmount: totalRewards,
            totalCalculatedBeforeScaling: totalCalculatedAmount,
            scalingFactor: scalingFactor,
            batchSize: BATCH_SIZE,
            totalBatches: Math.ceil(rewardsToInsert.length / BATCH_SIZE),
            totalProcessed: initialRewards.length,
            filteredOut: filteredCount,
            imported: totalInserted,
          },
        });

        // Trigger relevance score calculation asynchronously after response
        console.log(
          `Triggering relevance calculation for ${totalInserted} imported rewards...`
        );

        // Use setImmediate to ensure this runs after the response is sent
        setImmediate(async () => {
          try {
            // Get unique Twitter handles from imported rewards
            const importedHandles = rewardsToInsert
              .slice(0, totalInserted) // Only get handles that were successfully imported
              .map((reward) => reward.twitter_handle);

            // Call the relevance calculation endpoint
            const relevanceResponse = await fetch(
              `http://localhost:${
                process.env.PORT || 5000
              }/api/creator-score/analyze-relevance`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Admin-Password": process.env.ADMIN_PASSWORD || "",
                },
                body: JSON.stringify({
                  projectId: projectId,
                  handles: importedHandles,
                  minRewardThreshold: 0, // Calculate for all imported users
                }),
              }
            );

            if (relevanceResponse.ok) {
              const relevanceData = await relevanceResponse.json();
              console.log(
                `Relevance calculation triggered for ${relevanceData.handlesToAnalyze} users`
              );

              // Log token usage if available
              if (relevanceData.tokenUsage) {
                console.log(`Token usage for relevance calculation:
                  - Input tokens: ${relevanceData.tokenUsage.input}
                  - Output tokens: ${relevanceData.tokenUsage.output}
                  - Total tokens: ${relevanceData.tokenUsage.total}
                  - Estimated cost: $${relevanceData.tokenUsage.estimatedCostUSD}`);
              }
            } else {
              console.error(
                "Failed to trigger relevance calculation:",
                await relevanceResponse.text()
              );
            }
          } catch (relevanceError) {
            console.error(
              "Error triggering relevance calculation:",
              relevanceError
            );
            // Don't fail the import if relevance calculation fails
          }
        });
      } else {
        res.status(400).json({ error: "No rewards to import" });
      }
    } catch (error) {
      console.error("Error importing rewards:", error);
      res.status(500).json({ error: "Failed to import rewards" });
    }
  }
);

// Update a reward
router.post(
  "/projects/:id/update-reward",
  isAdminOrLoyaltyManager,
  async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      const { id, adjustAmount, notes, tags, claimed } = req.body;

      if (!id) {
        return res.status(400).json({ error: "Reward ID is required" });
      }

      // Find the reward
      const existingReward = await db.query.loyaltyRewards.findFirst({
        where: and(
          eq(loyaltyRewards.id, id),
          eq(loyaltyRewards.project_id, projectId)
        ),
      });

      if (!existingReward) {
        return res.status(404).json({ error: "Reward not found" });
      }

      // Update the reward
      const updateData: any = {
        adjust_amount: adjustAmount,
        notes: notes,
        tags: tags,
        updated_at: new Date(),
      };

      // Only update claimed status if it's provided
      if (typeof claimed === "boolean") {
        updateData.claimed = claimed;
      }

      await db
        .update(loyaltyRewards)
        .set(updateData)
        .where(
          and(
            eq(loyaltyRewards.id, id),
            eq(loyaltyRewards.project_id, projectId)
          )
        );

      res.json({
        success: true,
        message: "Reward updated successfully",
      });
    } catch (error) {
      console.error("Error updating reward:", error);
      res.status(500).json({ error: "Failed to update reward" });
    }
  }
);

// Add manual reward entry
router.post(
  "/projects/:id/add-reward",
  isAdminOrLoyaltyManager,
  async (req, res) => {
    const {
      twitterHandle,
      tokenType,
      initialAmount,
      adjustAmount,
      notes,
      decimals,
    } = req.body;

    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      if (
        !twitterHandle ||
        !tokenType ||
        initialAmount === undefined ||
        notes === undefined
      ) {
        return res.status(400).json({
          error:
            "Twitter handle, token type, initial amount, and notes are required",
        });
      }

      // Check if project exists
      const project = await db.query.loyaltyProjects.findFirst({
        where: eq(loyaltyProjects.id, projectId),
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Check if reward already exists for this twitter handle (case-insensitive)
      const existingReward = await db.query.loyaltyRewards.findFirst({
        where: and(
          eq(loyaltyRewards.project_id, projectId),
          sql`LOWER(${loyaltyRewards.twitter_handle}) = LOWER(${twitterHandle})`
        ),
      });

      if (existingReward) {
        return res.status(409).json({
          error: "User already exists",
          message: `A reward for @${twitterHandle} already exists in this project`,
        });
      }

      // Create the reward - ensure twitter handle is lowercase
      const newReward = await db
        .insert(loyaltyRewards)
        .values({
          project_id: projectId,
          twitter_handle: twitterHandle.toLowerCase(),
          twitter_id: null, // Will be fetched later if needed
          token_type: tokenType,
          initial_amount: initialAmount,
          adjust_amount: adjustAmount || 0,
          notes: notes,
          tags: ["manual-entry"],
          claimed: false,
        })
        .returning();

      res.json({
        success: true,
        message: "Reward added successfully",
        reward: newReward[0],
      });
    } catch (error) {
      console.error("Error adding manual reward:", error);

      // Handle specific database errors
      if (error instanceof Error && "code" in error) {
        const dbError = error as any;
        if (
          dbError.code === "23505" &&
          dbError.constraint === "loyalty_rewards_project_id_twitter_handle_key"
        ) {
          return res.status(409).json({
            error: "User already exists",
            message: `A reward for @${twitterHandle} already exists in this project`,
          });
        }
      }

      res.status(500).json({ error: "Failed to add reward" });
    }
  }
);

// Normalize rewards to match a target total (SQL-based version)
router.post(
  "/projects/:id/normalize-rewards",
  isAdminOrLoyaltyManager,
  async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      const { targetTotal } = req.body;

      if (!targetTotal || targetTotal <= 0) {
        return res.status(400).json({
          error: "Target total amount is required and must be positive",
        });
      }

      // First, check token types and get summary
      let tokenType: string;
      let rewardCount: number;
      let currentTotalRaw: number;

      const checkResult = await db.execute(
        sql`
          SELECT 
            token_type,
            COUNT(*) as reward_count,
            SUM(initial_amount + COALESCE(adjust_amount, 0) + COALESCE(manual_adjustment, 0)) as current_total_raw
          FROM loyalty_rewards
          WHERE project_id = ${projectId} 
            AND claimed = false
            AND token_type IS NOT NULL
          GROUP BY token_type
        `
      );

      if (!checkResult.rows || checkResult.rows.length === 0) {
        return res
          .status(400)
          .json({ error: "No unclaimed rewards to normalize" });
      }

      if (checkResult.rows.length > 1) {
        return res.status(400).json({
          error:
            "Cannot normalize rewards with multiple token types. Please filter by token type first.",
        });
      }

      const tokenInfo = checkResult.rows[0];
      tokenType = tokenInfo.token_type as string;
      rewardCount = parseInt(tokenInfo.reward_count as string);
      currentTotalRaw = parseFloat(tokenInfo.current_total_raw as string);

      // Ensure token type is not null
      if (!tokenType) {
        return res.status(400).json({
          error: "Token type is missing from rewards. Cannot normalize.",
        });
      }

      if (currentTotalRaw === 0) {
        return res.status(400).json({
          error: "Current total is zero, cannot normalize",
        });
      }

      // Get coin metadata to determine decimals
      const suiClient = new SuiClient({
        url: process.env.SUI_RPC_URL || getFullnodeUrl("mainnet"),
      });

      let decimals = 9; // Default decimals
      try {
        const metadata = await suiClient.getCoinMetadata({
          coinType: tokenType,
        });
        if (metadata) {
          decimals = metadata.decimals;
        }
      } catch (error) {
        console.error("Error fetching coin metadata:", error);
      }

      // Convert target total from human-readable to raw units
      const targetTotalRaw = Math.floor(targetTotal * Math.pow(10, decimals));
      const scalingFactor = targetTotalRaw / currentTotalRaw;

      // Prepare the normalization note
      const normalizeNote = ` | Normalized to ${targetTotal.toFixed(
        decimals > 2 ? 2 : decimals
      )} ${tokenType} total (factor: ${scalingFactor.toFixed(4)})`;

      // Perform the normalization using a single SQL query
      // First, validate inputs to prevent injection
      if (!Number.isInteger(projectId) || projectId <= 0) {
        throw new Error("Invalid project ID");
      }

      if (
        !Number.isFinite(scalingFactor) ||
        scalingFactor <= 0 ||
        scalingFactor > 1000
      ) {
        throw new Error("Invalid scaling factor");
      }

      // Validate token type format (should be a valid Sui address format)
      if (
        !tokenType ||
        typeof tokenType !== "string" ||
        tokenType.length > 500
      ) {
        throw new Error("Invalid token type");
      }

      // Perform the normalization using parameterized query
      // Use Drizzle's sql template with proper parameterization
      const updateResult = await db.execute(
        sql`
          UPDATE loyalty_rewards
          SET 
            adjust_amount = ROUND((initial_amount + COALESCE(adjust_amount, 0) + COALESCE(manual_adjustment, 0)) * ${scalingFactor}::numeric) - initial_amount - COALESCE(manual_adjustment, 0),
            notes = CASE 
              WHEN notes IS NULL OR notes = '' THEN ${normalizeNote}::text
              ELSE notes || ${normalizeNote}::text
            END,
            updated_at = NOW()
          WHERE project_id = ${projectId}::integer
            AND claimed = false
            AND token_type = ${tokenType}::text
        `
      );

      if (updateResult.rowCount !== rewardCount) {
        console.warn(
          `[Normalize] Warning: Updated ${updateResult.rowCount} rows but expected ${rewardCount}`
        );
      }

      // Verify the update
      const verifyResult = await db.execute(
        sql`
          SELECT SUM(initial_amount + COALESCE(adjust_amount, 0) + COALESCE(manual_adjustment, 0)) as new_total_raw
          FROM loyalty_rewards
          WHERE project_id = ${projectId}
            AND claimed = false
            AND token_type = ${tokenType}
        `
      );

      const newTotalRaw = parseFloat(
        (verifyResult.rows[0]?.new_total_raw as unknown as string) || "0"
      );
      const newTotalHuman = newTotalRaw / Math.pow(10, decimals);

      res.json({
        success: true,
        message: `Normalized ${rewardCount} rewards to total ${targetTotal} ${tokenType}`,
        summary: {
          rewardsNormalized: rewardCount,
          tokenType: tokenType,
          previousTotal: (currentTotalRaw / Math.pow(10, decimals)).toFixed(
            decimals > 2 ? 2 : decimals
          ),
          newTotal: newTotalHuman.toFixed(decimals > 2 ? 2 : decimals),
          scalingFactor: scalingFactor.toFixed(4),
        },
      });
    } catch (error) {
      console.error("Error normalizing rewards:", error);
      res.status(500).json({ error: "Failed to normalize rewards" });
    }
  }
);

// Adjust rewards based on relevance scores
router.post(
  "/projects/:id/adjust-by-relevance",
  isAdminOrLoyaltyManager,
  async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      const { method, maintainBudget, tiers } = req.body;

      // Validate tiers if method is tiered
      if (method === "tiered" && !tiers) {
        return res.status(400).json({ error: "Tiers configuration is required for tiered method" });
      }

      // Build the SQL query with all calculations done at database level
      let adjustmentQuery;
      
      if (method === "tiered") {
        // For tiered method, use CASE statements to determine multiplier
        adjustmentQuery = sql`
          WITH reward_calculations AS (
            SELECT 
              r.id,
              r.twitter_handle,
              r.initial_amount,
              r.adjust_amount,
              r.manual_adjustment,
              r.token_type,
              COALESCE(pcs.relevance_score, 500) as relevance_score,
              COALESCE(ru.is_influencer, false) as is_influencer,
              -- Calculate base multiplier based on relevance score tiers
              CASE 
                WHEN COALESCE(pcs.relevance_score, 500) >= ${tiers.excellent.minScore} THEN ${tiers.excellent.multiplier}::numeric
                WHEN COALESCE(pcs.relevance_score, 500) >= ${tiers.good.minScore} THEN ${tiers.good.multiplier}::numeric
                WHEN COALESCE(pcs.relevance_score, 500) >= ${tiers.standard.minScore} THEN ${tiers.standard.multiplier}::numeric
                WHEN COALESCE(pcs.relevance_score, 500) >= ${tiers.poor.minScore} THEN ${tiers.poor.multiplier}::numeric
                ELSE ${tiers.spam.multiplier}::numeric
              END as base_multiplier,
              -- Apply influencer bonus if applicable
              CASE 
                WHEN COALESCE(ru.is_influencer, false) = true THEN 1.2
                ELSE 1.0
              END as influencer_multiplier
            FROM loyalty_rewards r
            LEFT JOIN project_creator_scores pcs 
              ON pcs.project_id = r.project_id 
              AND LOWER(pcs.twitter_handle) = LOWER(r.twitter_handle)
            LEFT JOIN rep_users ru
              ON LOWER(ru.twitter_handle) = LOWER(r.twitter_handle)
            WHERE r.project_id = ${projectId} 
              AND r.claimed = false
              AND r.token_type IS NOT NULL
          ),
          token_totals AS (
            SELECT 
              token_type,
              SUM(initial_amount + COALESCE(adjust_amount, 0) + COALESCE(manual_adjustment, 0)) as current_total,
              SUM((initial_amount + COALESCE(adjust_amount, 0) + COALESCE(manual_adjustment, 0)) * base_multiplier * influencer_multiplier) as new_total
            FROM reward_calculations
            GROUP BY token_type
          )
          SELECT 
            rc.*,
            rc.base_multiplier * rc.influencer_multiplier as final_multiplier,
            (rc.initial_amount + COALESCE(rc.adjust_amount, 0) + COALESCE(rc.manual_adjustment, 0)) as current_amount,
            CASE 
              WHEN ${maintainBudget} = true AND tt.new_total > 0 THEN
                FLOOR(
                  (rc.initial_amount + COALESCE(rc.adjust_amount, 0) + COALESCE(rc.manual_adjustment, 0)) * 
                  rc.base_multiplier * rc.influencer_multiplier * 
                  (tt.current_total::numeric / tt.new_total::numeric)
                )::bigint
              ELSE
                FLOOR(
                  (rc.initial_amount + COALESCE(rc.adjust_amount, 0) + COALESCE(rc.manual_adjustment, 0)) * 
                  rc.base_multiplier * rc.influencer_multiplier
                )::bigint
            END as new_amount
          FROM reward_calculations rc
          JOIN token_totals tt ON rc.token_type = tt.token_type
        `;
      } else if (method === "linear") {
        // For linear method, calculate multiplier as score/500
        adjustmentQuery = sql`
          WITH reward_calculations AS (
            SELECT 
              r.id,
              r.twitter_handle,
              r.initial_amount,
              r.adjust_amount,
              r.manual_adjustment,
              r.token_type,
              COALESCE(pcs.relevance_score, 500) as relevance_score,
              COALESCE(ru.is_influencer, false) as is_influencer,
              -- Linear multiplier: score/500
              (COALESCE(pcs.relevance_score, 500)::numeric / 500) as base_multiplier,
              -- Apply influencer bonus if applicable
              CASE 
                WHEN COALESCE(ru.is_influencer, false) = true THEN 1.2
                ELSE 1.0
              END as influencer_multiplier
            FROM loyalty_rewards r
            LEFT JOIN project_creator_scores pcs 
              ON pcs.project_id = r.project_id 
              AND LOWER(pcs.twitter_handle) = LOWER(r.twitter_handle)
            LEFT JOIN rep_users ru
              ON LOWER(ru.twitter_handle) = LOWER(r.twitter_handle)
            WHERE r.project_id = ${projectId} 
              AND r.claimed = false
              AND r.token_type IS NOT NULL
          ),
          token_totals AS (
            SELECT 
              token_type,
              SUM(initial_amount + COALESCE(adjust_amount, 0) + COALESCE(manual_adjustment, 0)) as current_total,
              SUM((initial_amount + COALESCE(adjust_amount, 0) + COALESCE(manual_adjustment, 0)) * base_multiplier * influencer_multiplier) as new_total
            FROM reward_calculations
            GROUP BY token_type
          )
          SELECT 
            rc.*,
            rc.base_multiplier * rc.influencer_multiplier as final_multiplier,
            (rc.initial_amount + COALESCE(rc.adjust_amount, 0) + COALESCE(rc.manual_adjustment, 0)) as current_amount,
            CASE 
              WHEN ${maintainBudget} = true AND tt.new_total > 0 THEN
                FLOOR(
                  (rc.initial_amount + COALESCE(rc.adjust_amount, 0) + COALESCE(rc.manual_adjustment, 0)) * 
                  rc.base_multiplier * rc.influencer_multiplier * 
                  (tt.current_total::numeric / tt.new_total::numeric)
                )::bigint
              ELSE
                FLOOR(
                  (rc.initial_amount + COALESCE(rc.adjust_amount, 0) + COALESCE(rc.manual_adjustment, 0)) * 
                  rc.base_multiplier * rc.influencer_multiplier
                )::bigint
            END as new_amount
          FROM reward_calculations rc
          JOIN token_totals tt ON rc.token_type = tt.token_type
        `;
      } else {
        return res.status(400).json({ error: `Unsupported adjustment method: ${method}` });
      }

      // Execute the query to get all calculations
      const calculations = await db.execute(adjustmentQuery);

      if (!calculations.rows || calculations.rows.length === 0) {
        return res.status(400).json({ error: "No unclaimed rewards to adjust" });
      }

      // Apply adjustments in a transaction
      let totalAdjusted = 0;
      const tokenTypes = new Set<string>();

      await db.transaction(async (tx) => {
        for (const calc of calculations.rows) {
          const adjustment = BigInt(calc.new_amount as string) - BigInt(calc.current_amount as string);
          
          if (adjustment !== BigInt(0)) {
            tokenTypes.add(calc.token_type as string);
            totalAdjusted++;
            
            // Build note message
            const noteMessage = `Relevance adjustment (${method}, score: ${calc.relevance_score}, ` +
              `base: ${parseFloat(calc.base_multiplier as string).toFixed(2)}x` +
              (calc.is_influencer ? ', influencer: 1.2x' : '') +
              `, final: ${parseFloat(calc.final_multiplier as string).toFixed(2)}x)`;
            
            // Update the reward
            await tx.execute(
              sql`
                UPDATE loyalty_rewards
                SET 
                  manual_adjustment = COALESCE(manual_adjustment, 0) + ${adjustment.toString()}::bigint,
                  notes = CASE 
                    WHEN notes IS NULL OR notes = '' THEN ${noteMessage}::text
                    ELSE notes || ${' | ' + noteMessage}::text
                  END,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ${calc.id}
              `
            );
          }
        }
      });

      res.json({
        success: true,
        message: `Rewards adjusted by relevance scores using ${method} method`,
        tokenTypes: Array.from(tokenTypes),
        totalAdjusted: totalAdjusted
      });

    } catch (error) {
      console.error("Error adjusting rewards by relevance:", error);
      res.status(500).json({ error: "Failed to adjust rewards by relevance" });
    }
  }
);

// Delete a specific reward
router.delete(
  "/projects/:projectId/rewards/:rewardId",
  isAdminOrLoyaltyManager,
  async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const rewardId = parseInt(req.params.rewardId);

      if (isNaN(projectId) || isNaN(rewardId)) {
        return res.status(400).json({ error: "Invalid project or reward ID" });
      }

      // Check if reward exists and belongs to the project
      const reward = await db.query.loyaltyRewards.findFirst({
        where: and(
          eq(loyaltyRewards.id, rewardId),
          eq(loyaltyRewards.project_id, projectId)
        ),
      });

      if (!reward) {
        return res.status(404).json({ error: "Reward not found" });
      }

      // Delete the reward
      await db.delete(loyaltyRewards).where(eq(loyaltyRewards.id, rewardId));

      console.log(
        `[loyalty] Deleted reward ${rewardId} for project ${projectId}`
      );

      return res.json({
        success: true,
        message: "Reward deleted successfully",
      });
    } catch (error) {
      console.error("[loyalty] Error deleting reward:", error);
      return res.status(500).json({ error: "Failed to delete reward" });
    }
  }
);

// Delete all rewards for a project
router.delete(
  "/projects/:id/reset-rewards",
  isAdminOrLoyaltyManager,
  async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      // Check if project exists
      const project = await db.query.loyaltyProjects.findFirst({
        where: eq(loyaltyProjects.id, projectId),
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Delete all rewards for this project
      await db
        .delete(loyaltyRewards)
        .where(eq(loyaltyRewards.project_id, projectId));

      res.json({
        success: true,
        message: `All rewards for project ${project.name} have been deleted`,
        projectId,
        projectName: project.name,
      });
    } catch (error) {
      console.error("Error resetting rewards:", error);
      res.status(500).json({
        success: false,
        error: "Failed to reset rewards",
        message: `An error occurred while deleting rewards for the project`,
      });
    }
  }
);

// Get rewards summary for a project
router.get(
  "/projects/:id/rewards/summary",
  isAdminOrLoyaltyManager,
  async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      // First get overall totals
      const summaryResult = await db.execute(
        sql`
          SELECT 
            COUNT(*) as total_count,
            COUNT(CASE WHEN claimed = true THEN 1 END) as claimed_count,
            COUNT(CASE WHEN claimed = false THEN 1 END) as unclaimed_count,
            SUM(initial_amount) as total_initial_amount,
            SUM(COALESCE(adjust_amount, 0)) as total_adjust_amount,
            SUM(COALESCE(manual_adjustment, 0)) as total_manual_adjustment,
            SUM(initial_amount + COALESCE(adjust_amount, 0) + COALESCE(manual_adjustment, 0)) as total_amount,
            SUM(CASE WHEN claimed = true THEN initial_amount + COALESCE(adjust_amount, 0) + COALESCE(manual_adjustment, 0) ELSE 0 END) as claimed_amount,
            COUNT(DISTINCT claimer) FILTER (WHERE claimer IS NOT NULL) as unique_claimers,
            COUNT(DISTINCT token_type) as token_types
          FROM loyalty_rewards
          WHERE project_id = ${projectId}
        `
      );

      // Get totals by token type
      const tokenSummaryResult = await db.execute(
        sql`
          SELECT 
            token_type,
            COUNT(*) as count,
            SUM(initial_amount) as initial_amount,
            SUM(COALESCE(adjust_amount, 0)) as adjust_amount,
            SUM(COALESCE(manual_adjustment, 0)) as manual_adjustment,
            SUM(initial_amount + COALESCE(adjust_amount, 0) + COALESCE(manual_adjustment, 0)) as total_amount
          FROM loyalty_rewards
          WHERE project_id = ${projectId}
          GROUP BY token_type
          ORDER BY total_amount DESC
        `
      );

      const summary = summaryResult.rows[0];
      const tokenSummaries = tokenSummaryResult.rows.map((row) => ({
        tokenType: row.token_type as string,
        count: parseInt(row.count as string),
        initialAmount: parseFloat(row.initial_amount as string) || 0,
        adjustAmount: parseFloat(row.adjust_amount as string) || 0,
        manualAdjustment: parseFloat(row.manual_adjustment as string) || 0,
        totalAmount: parseFloat(row.total_amount as string) || 0,
      }));

      res.json({
        totalRewards: parseInt(summary.total_count as string),
        claimedRewards: parseInt(summary.claimed_count as string),
        unclaimedRewards: parseInt(summary.unclaimed_count as string),
        totalInitialAmount:
          parseFloat(summary.total_initial_amount as string) || 0,
        totalAdjustAmount:
          parseFloat(summary.total_adjust_amount as string) || 0,
        totalManualAdjustment:
          parseFloat(summary.total_manual_adjustment as string) || 0,
        totalAmount: parseFloat(summary.total_amount as string) || 0,
        claimedAmount: parseFloat(summary.claimed_amount as string) || 0,
        unclaimedAmount:
          (parseFloat(summary.total_amount as string) || 0) -
          (parseFloat(summary.claimed_amount as string) || 0),
        uniqueClaimers: parseInt(summary.unique_claimers as string),
        tokenTypes: parseInt(summary.token_types as string),
        claimRate:
          parseInt(summary.total_count as string) > 0
            ? (parseInt(summary.claimed_count as string) /
                parseInt(summary.total_count as string)) *
              100
            : 0,
        tokenSummaries: tokenSummaries,
      });
    } catch (error) {
      console.error("Error fetching rewards summary:", error);
      res.status(500).json({ error: "Failed to fetch rewards summary" });
    }
  }
);

// Get claim statistics for a project
router.get("/:projectId/contract/stats", async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);

    if (isNaN(projectId)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    // Get all rewards for the project
    const rewards = await db
      .select()
      .from(loyaltyRewards)
      .where(eq(loyaltyRewards.project_id, projectId));

    // Calculate statistics
    const totalRewards = rewards.length;
    const claimedRewards = rewards.filter((r) => r.claimed).length;
    const unclaimedRewards = totalRewards - claimedRewards;

    // Calculate total amounts
    const totalAmount = rewards.reduce(
      (sum, r) =>
        sum +
        Number(r.initial_amount || 0) +
        Number(r.adjust_amount || 0) +
        Number(r.manual_adjustment || 0),
      0
    );
    const claimedAmount = rewards
      .filter((r) => r.claimed)
      .reduce(
        (sum, r) =>
          sum +
          Number(r.initial_amount || 0) +
          Number(r.adjust_amount || 0) +
          Number(r.manual_adjustment || 0),
        0
      );
    const unclaimedAmount = totalAmount - claimedAmount;

    // Get unique claimers count
    const uniqueClaimers = new Set(
      rewards.filter((r) => r.claimed && r.claimer).map((r) => r.claimer)
    ).size;

    res.json({
      totalRewards,
      claimedRewards,
      unclaimedRewards,
      totalAmount,
      claimedAmount,
      unclaimedAmount,
      uniqueClaimers,
      claimRate: totalRewards > 0 ? (claimedRewards / totalRewards) * 100 : 0,
    });
  } catch (error) {
    console.error("Error fetching contract stats:", error);
    res.status(500).json({ error: "Failed to fetch contract statistics" });
  }
});

// Contract Management Routes

// Get contract for a project
router.get("/:projectId/contract", async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);

    if (isNaN(projectId)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const contract = await db
      .select()
      .from(loyaltyRewardConfig)
      .where(eq(loyaltyRewardConfig.project_id, projectId))
      .limit(1);

    if (contract.length === 0) {
      return res.json({ contract: null });
    }

    res.json({ contract: contract[0] });
  } catch (error) {
    console.error("Error fetching contract:", error);
    res.status(500).json({ error: "Failed to fetch contract" });
  }
});

// Create or update contract for a project
router.post(
  "/:projectId/contract",
  isAdminOrLoyaltyManager,
  async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { amount, coinType, decimals, poolObjectId, isAvailable } =
        req.body;

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      if (!amount || !coinType || !decimals || !poolObjectId) {
        return res.status(400).json({
          error: "Amount, coinType, decimals, and poolObjectId are required",
        });
      }

      // Check if contract already exists
      const existingContract = await db
        .select()
        .from(loyaltyRewardConfig)
        .where(eq(loyaltyRewardConfig.project_id, projectId))
        .limit(1);

      if (existingContract.length > 0) {
        // Update existing contract
        const updatedContract = await db
          .update(loyaltyRewardConfig)
          .set({
            amount: parseInt(amount) * 10 ** decimals,
            coin_type: coinType,
            is_available: isAvailable !== undefined ? isAvailable : true,
            updated_at: new Date(),
            pool_object_id: poolObjectId,
          })
          .where(eq(loyaltyRewardConfig.project_id, projectId))
          .returning();

        res.json({
          contract: updatedContract[0],
          message: "Contract updated successfully",
        });
      } else {
        // Create new contract
        const newContract = await db
          .insert(loyaltyRewardConfig)
          .values({
            project_id: projectId,
            amount: parseInt(amount),
            coin_type: coinType,
            is_available: isAvailable !== undefined ? isAvailable : true,
            pool_object_id: poolObjectId,
          })
          .returning();

        res.json({
          contract: newContract[0],
          message: "Contract created successfully",
        });
      }
    } catch (error) {
      console.error("Error creating/updating contract:", error);
      res.status(500).json({ error: "Failed to create/update contract" });
    }
  }
);

// Update contract availability
router.patch(
  "/:projectId/contract/availability",
  isAdminOrLoyaltyManager,
  async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { isAvailable } = req.body;

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      if (typeof isAvailable !== "boolean") {
        return res.status(400).json({ error: "isAvailable must be a boolean" });
      }

      const updatedContract = await db
        .update(loyaltyRewardConfig)
        .set({
          is_available: isAvailable,
          updated_at: new Date(),
        })
        .where(eq(loyaltyRewardConfig.project_id, projectId))
        .returning();

      if (updatedContract.length === 0) {
        return res.status(404).json({ error: "Contract not found" });
      }

      res.json({
        contract: updatedContract[0],
        message: "Contract availability updated successfully",
      });
    } catch (error) {
      console.error("Error updating contract availability:", error);
      res.status(500).json({ error: "Failed to update contract availability" });
    }
  }
);

// Update contract funding
router.patch(
  "/:projectId/contract/funding",
  isAdminOrLoyaltyManager,
  async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { amount, action } = req.body;

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      if (!amount || !action) {
        return res
          .status(400)
          .json({ error: "Amount and action are required" });
      }

      if (!["add", "remove"].includes(action)) {
        return res
          .status(400)
          .json({ error: "Action must be 'add' or 'remove'" });
      }

      // Get current contract
      const existingContract = await db
        .select()
        .from(loyaltyRewardConfig)
        .where(eq(loyaltyRewardConfig.project_id, projectId))
        .limit(1);

      if (existingContract.length === 0) {
        return res.status(404).json({ error: "Contract not found" });
      }

      const currentAmount = existingContract[0].amount;
      const amountChange = parseInt(amount);

      let newAmount: number;
      if (action === "add") {
        newAmount = currentAmount + amountChange;
      } else {
        newAmount = currentAmount - amountChange;
        if (newAmount < 0) {
          return res.status(400).json({
            error: "Cannot remove more than current contract balance",
          });
        }
      }

      const updatedContract = await db
        .update(loyaltyRewardConfig)
        .set({
          amount: newAmount,
          updated_at: new Date(),
        })
        .where(eq(loyaltyRewardConfig.project_id, projectId))
        .returning();

      res.json({
        contract: updatedContract[0],
        message: `Contract funding ${
          action === "add" ? "increased" : "decreased"
        } successfully`,
        previous_amount: currentAmount,
        new_amount: newAmount,
        change_amount: amountChange,
      });
    } catch (error) {
      console.error("Error updating contract funding:", error);
      res.status(500).json({ error: "Failed to update contract funding" });
    }
  }
);

// Delete contract for a project
router.delete(
  "/:projectId/contract",
  isAdminOrLoyaltyManager,
  async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      const deletedContract = await db
        .delete(loyaltyRewardConfig)
        .where(eq(loyaltyRewardConfig.project_id, projectId))
        .returning();

      if (deletedContract.length === 0) {
        return res.status(404).json({ error: "Contract not found" });
      }

      res.json({
        success: true,
        message: "Contract deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting contract:", error);
      res.status(500).json({ error: "Failed to delete contract" });
    }
  }
);

async function validateClaimTransaction(
  transactionBytes: string,
  projectId: number,
  projectRewardConfig: any,
  userReward: any,
  suiClient: SuiClient
) {
  // Remove the claimed check here since we handle it in the main function
  // The reward is already marked as claimed optimistically

  const tx = Transaction.from(transactionBytes);
  const txData = tx.getData();
  const isAdminIsSender =
    txData.sender === process.env.VITE_ADMIN_SUI_WALLET_PUBLIC_ADDRESS;
  const isAdminIsNotGasOwner =
    txData.gasData.owner !== process.env.VITE_ADMIN_SUI_WALLET_PUBLIC_ADDRESS;
  const onlyOneCommand = txData.commands.length === 1;
  const command = txData.commands[0];
  const isCorrectPackage = command.MoveCall!.package == GiveRepClaimPackageId;
  const isCorrectFunction = command.MoveCall!.function == "claim";
  const isCorrectModule = command.MoveCall!.module == "giverep_claim";
  const isCorrectType =
    command.MoveCall!.typeArguments[0] == projectRewardConfig.coin_type;
  const isAvailable = projectRewardConfig.is_available;

  const dryRunResult = await suiClient.dryRunTransactionBlock({
    transactionBlock: transactionBytes,
  });

  const claimEvent = dryRunResult.events.find((event) =>
    isClaimEvent(event.type)
  );
  if (!claimEvent) {
    throw new Error("Claim event not found");
  }

  const claimEventData = ClaimEvent.fromBcs(
    phantom("TYPE"),
    fromBase64(claimEvent.bcs)
  );
  const isWorkspaceIdCorrect =
    BigInt(claimEventData.workspaceId) === BigInt(projectId);
  const isAmountCorrect =
    BigInt(claimEventData.amount) ===
    BigInt(userReward.initial_amount || 0) +
      BigInt(userReward.adjust_amount || 0) +
      BigInt(userReward.manual_adjustment || 0);

  if (!isAvailable) {
    throw new Error("Contract is not available");
  }
  if (!isWorkspaceIdCorrect) {
    throw new Error("Incorrect workspace ID");
  }
  if (!isAmountCorrect) {
    throw new Error("Incorrect claim amount");
  }
  if (!isAdminIsSender) {
    throw new Error("Transaction sender must be admin");
  }
  if (!isAdminIsNotGasOwner) {
    throw new Error("Gas owner must not be admin");
  }
  if (!onlyOneCommand) {
    throw new Error("Transaction must have exactly one command");
  }
  if (!isCorrectPackage) {
    throw new Error("Incorrect package ID");
  }
  if (!isCorrectFunction) {
    throw new Error("Incorrect function name");
  }
  if (!isCorrectModule) {
    throw new Error("Incorrect module name");
  }
  if (!isCorrectType) {
    throw new Error("Incorrect coin type");
  }

  return { suiClient };
}

router.post("/:projectId/contract/claim-reward", async (req, res) => {
  let transactionExecuted = false;
  try {
    const projectId = parseInt(req.params.projectId);

    const suiClient = new SuiClient({
      url: process.env.SUI_RPC_URL || getFullnodeUrl("mainnet"),
    });

    const { transactionBytes, userSignature, twitterHandle } = req.body;

    const verificationResult = await verifyTwitterIdentity(req, twitterHandle);
    if (!verificationResult.success) {
      return res.status(400).json({ error: "Twitter handle not verified" });
    }

    // Get the gas owner (user's wallet address) from the transaction
    const tx = Transaction.from(transactionBytes);
    const txData = tx.getData();
    const userWalletAddress = txData.gasData.owner;

    if (!userWalletAddress) {
      return res.status(400).json({ error: "Gas owner not found" });
    }

    // Check if user has agreed to terms
    const termsAgreement = await db
      .select()
      .from(legalTermsAgreement)
      .where(
        and(
          sql`LOWER(${legalTermsAgreement.userHandle}) = LOWER(${twitterHandle})`,
          sql`LOWER(${legalTermsAgreement.walletAddress}) = LOWER(${userWalletAddress})`
        )
      )
      .limit(1);

    if (termsAgreement.length === 0) {
      return res.status(400).json({
        error:
          "You must agree to the Reward Claim Terms before claiming rewards",
        termsRequired: true,
      });
    }

    const [projectRewardConfig, userReward] = await Promise.all([
      db
        .select()
        .from(loyaltyRewardConfig)
        .where(eq(loyaltyRewardConfig.project_id, projectId))
        .limit(1)
        .then((rows) => rows[0]),
      db
        .select()
        .from(loyaltyRewards)
        .where(
          and(
            eq(loyaltyRewards.project_id, projectId),
            sql`LOWER(${loyaltyRewards.twitter_handle}) = LOWER(${twitterHandle})`
          )
        )
        .limit(1)
        .then((rows) => rows[0]),
    ]);

    if (!userReward) {
      return res.status(404).json({ error: "Reward not found" });
    }

    if (!projectRewardConfig) {
      return res.status(404).json({ error: "Project reward config not found" });
    }

    // Check if already claimed
    if (userReward.claimed) {
      return res.status(400).json({ error: "Reward already claimed" });
    }

    // Immediately mark as claimed to prevent double-claiming
    const updateResult = await db
      .update(loyaltyRewards)
      .set({
        claimed: true,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(loyaltyRewards.project_id, projectId),
          sql`LOWER(${loyaltyRewards.twitter_handle}) = LOWER(${twitterHandle})`,
          eq(loyaltyRewards.claimed, false) // Additional check to prevent race condition
        )
      )
      .returning();

    // If no rows were updated, it means another request already claimed it
    if (updateResult.length === 0) {
      return res.status(409).json({ error: "Reward already being claimed" });
    }

    try {
      await validateClaimTransaction(
        transactionBytes,
        projectId,
        projectRewardConfig,
        userReward,
        suiClient
      );

      const backendSigner = Ed25519Keypair.fromSecretKey(
        process.env.BACKEND_ADMIN_SUI_WALLET_PRIVATE_KEY || ""
      );

      const { signature: giverepSignature } =
        await backendSigner.signTransaction(fromBase64(transactionBytes));

      const result = await suiClient.executeTransactionBlock({
        transactionBlock: transactionBytes,
        signature: [giverepSignature, userSignature],
        options: {
          showEvents: true,
        },
      });

      if (result.digest) {
        transactionExecuted = true;
      }

      const claimEvent = result.events?.find((event) =>
        isClaimEvent(event.type)
      );
      if (!claimEvent) {
        throw new Error("Claim event not found");
      }

      const claimEventData = ClaimEvent.fromBcs(
        phantom("TYPE"),
        fromBase64(claimEvent.bcs)
      );

      // Update with full claim details
      await db
        .update(loyaltyRewards)
        .set({
          claimed: true,
          claimer: claimEventData.receiver,
          claimed_at: new Date(),
          claim_transaction_digest: result.digest,
        })
        .where(
          and(
            eq(loyaltyRewards.project_id, projectId),
            sql`LOWER(${loyaltyRewards.twitter_handle}) = LOWER(${twitterHandle})`
          )
        );

      return res.json({ success: true, digest: result.digest });
    } catch (error) {
      // Rollback the claim status on any error
      console.error("Error during claim transaction, rolling back:", error);
      if (!transactionExecuted) {
        await db
          .update(loyaltyRewards)
          .set({
            claimed: false,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(loyaltyRewards.project_id, projectId),
              sql`LOWER(${loyaltyRewards.twitter_handle}) = LOWER(${twitterHandle})`
            )
          );
      }

      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(400).json({ error: "Unknown error occurred" });
    }
  } catch (error) {
    console.error("Error claiming reward:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET user tweets for a specific loyalty project
router.get("/projects/:projectId/user-tweets/:twitterHandle", 
  isAdminOrLoyaltyManager,
  async (req, res) => {
    try {
      const { projectId, twitterHandle } = req.params;
      
      const projectIdNum = parseInt(projectId);
      
      if (isNaN(projectIdNum)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }
      
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
      
      // Import tweets table
      const { tweets } = await import("../../db/tweets_schema");
      
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
  }
);

export default router;
