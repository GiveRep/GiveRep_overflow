import { relations } from "drizzle-orm";
import {
  integer,
  serial,
  text,
  timestamp,
  pgTable,
  unique,
  boolean,
  index,
  bigint,
  numeric,
  customType,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// Custom vector type for pgvector
const vector = (name: string, config: { dimensions: number }) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${config.dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(",")}]`;
    },
    fromDriver(value: string): number[] {
      return value.slice(1, -1).split(",").map(Number);
    },
  })(name);

// Influencer Categories - categories that can be applied to influencers
export const influencerCategories = pgTable(
  "influencer_categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    visible: boolean("visible").default(true).notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => {
    return {
      nameIdx: unique("influencer_categories_name_idx").on(table.name),
    };
  }
);

// Store users who have been mentioned in giverep tweets
export const repUsers = pgTable(
  "rep_users",
  {
    id: serial("id").primaryKey(),
    twitterHandle: text("twitter_handle").notNull(),
    followerCount: integer("follower_count").default(0),
    lastUpdated: timestamp("last_updated").defaultNow(),
    profileUrl: text("profile_url"),
    totalReputation: integer("total_reputation").default(0),
    endorsedByInfluencers: text("endorsed_by_influencers"),
    twitterId: bigint("twitter_id", { mode: "bigint" }), // Using native bigint for Twitter IDs
    // Quota and multiplier fields (moved from rep_quota table)
    dailyQuota: integer("daily_quota").default(3), // Daily points quota (default: 3)
    pointsUsed: integer("points_used").default(0), // Points used today
    multiplier: integer("multiplier").default(1), // Point multiplier for influencers (default: 1)
    quotaDate: timestamp("quota_date").defaultNow(), // Date for quota tracking
    // Influencer fields
    isInfluencer: boolean("is_influencer").default(false), // Whether user is marked as an influencer
    influencerCategories: integer("influencer_categories").array(), // Array of influencer category IDs
    // PFP Collection field
    pfpCollectionId: integer("pfp_collection_id"), // Reference to pfp_collections table
    pfpLastCheck: timestamp("pfp_last_check"), // Last time PFP was checked/updated for NFT matching
    profileImageUrl: text("profile_image_url"), // Twitter profile image URL
    pfpLastVerified: timestamp("pfp_last_verified"), // Last time profile image URL was verified as valid (HTTP 200)
    // Loyalty program fields
    isLoyaltyProgram: boolean("is_loyalty_program").default(false), // Whether user is a loyalty program account
    loyaltyProjectId: text("loyalty_project_id"), // ID of the loyalty project this user represents
    // Pre-calculated ranking fields
    rank1d: integer("rank_1d"),
    rank7d: integer("rank_7d"),
    rank30d: integer("rank_30d"),
    rank90d: integer("rank_90d"),
    rankTotal: integer("rank_total"),
    rankUpdatedAt: timestamp("rank_updated_at").defaultNow(),
    // Time-based reputation point fields
    pointsLast1d: integer("points_last_1d").default(0),
    pointsLast7d: integer("points_last_7d").default(0),
    pointsLast30d: integer("points_last_30d").default(0),
    pointsLast90d: integer("points_last_90d").default(0),
    // Unique giver count fields
    uniqueGivers1d: integer("unique_givers_1d").default(0),
    uniqueGivers7d: integer("unique_givers_7d").default(0),
    uniqueGivers30d: integer("unique_givers_30d").default(0),
    uniqueGivers90d: integer("unique_givers_90d").default(0),
    uniqueGiversTotal: integer("unique_givers_total").default(0),
    // Consolidated timestamp for all reputation updates
    pointsLastUpdatedAt: timestamp("points_last_updated_at"),
  },
  (table) => {
    return {
      // Add performance indexes
      // Note: We define these indexes in the schema to match the database
      // but the actual DESC order is defined when the index is created directly in the database
      totalReputationIdx: index("rep_users_total_reputation_idx").on(
        table.totalReputation
      ),
      handleReputationIdx: index("rep_users_handle_reputation_idx").on(
        table.twitterHandle,
        table.totalReputation
      ),
      isInfluencerIdx: index("rep_users_is_influencer_idx").on(
        table.isInfluencer
      ),
      pfpCollectionIdIdx: index("rep_users_pfp_collection_id_idx").on(
        table.pfpCollectionId
      ),
      pfpLastCheckIdx: index("rep_users_pfp_last_check_idx").on(
        table.pfpLastCheck
      ),
      loyaltyProjectIdIdx: index("rep_users_loyalty_project_id_idx").on(
        table.loyaltyProjectId
      ),
      // Note: GIN index for influencer_categories array is created via SQL migration

      // Ensure unique twitter handles (case insensitive)
      twitterHandleUnique: unique("rep_users_twitter_handle_unique_idx").on(
        table.twitterHandle
      ),
    };
  }
);

// Store reputation points given
export const repPoints = pgTable(
  "rep_points",
  {
    id: serial("id").primaryKey(),
    fromHandle: text("from_handle").notNull(),
    toHandle: text("to_handle").notNull(),
    tweetId: text("tweet_id").notNull(),
    tweetUrl: text("tweet_url"),
    tweetContent: text("tweet_content"),
    createdAt: timestamp("created_at").defaultNow(),
    points: integer("points").default(1),
    influencerBonus: boolean("influencer_bonus").default(false),
    fromId: bigint("from_id", { mode: "bigint" }), // Using native bigint for Twitter IDs
    toId: bigint("to_id", { mode: "bigint" }), // Using native bigint for Twitter IDs
    isManual: boolean("is_manual").default(false), // True if awarded through manual tweet addition
    fromLoyaltyProgramId: integer("from_loyalty_program_id"), // ID of loyalty program that gave points (null if not from loyalty program)
    countedForAirdrop: boolean("counted_for_airdrop").default(true), // Whether this point counts toward airdrops (false for restored invalid points)
  },
  (table) => {
    return {
      // Ensure a user can't give reputation to the same handle in the same tweet
      uniqPointsGiven: unique().on(
        table.fromHandle,
        table.toHandle,
        table.tweetId
      ),
      // Performance indexes for influencer bonus queries
      influencerBonusIdx: index("rep_points_influencer_bonus_idx").on(
        table.influencerBonus
      ),
      toHandleInfluencerIdx: index(
        "rep_points_to_handle_influencer_bonus_idx"
      ).on(table.toHandle, table.influencerBonus),
      // Indexes for the new ID columns
      fromIdIdx: index("rep_points_from_id_idx").on(table.fromId),
      toIdIdx: index("rep_points_to_id_idx").on(table.toId),
      fromLoyaltyProgramIdIdx: index(
        "rep_points_from_loyalty_program_id_idx"
      ).on(table.fromLoyaltyProgramId),
      toHandleFromLoyaltyProgramIdIdx: index(
        "rep_points_to_handle_from_loyalty_program_id_idx"
      ).on(table.toHandle, table.fromLoyaltyProgramId),
      // Index for airdrop counting (only true values need to be fast)
      countedForAirdropIdx: index("rep_points_counted_for_airdrop_idx").on(
        table.countedForAirdrop
      ),
    };
  }
);

// DEPRECATED: Daily reputation points quota table
// ⚠️ This table is DEPRECATED and kept only for backward compatibility.
// Use rep_users.daily_quota, rep_users.points_used, rep_users.multiplier instead.
// OMITTED: Remove this table after migration is complete and all references are updated.
export const repQuota = pgTable(
  "rep_quota",
  {
    id: serial("id").primaryKey(),
    twitterHandle: text("twitter_handle").notNull(),
    date: timestamp("date").defaultNow(),
    pointsUsed: integer("points_used").default(0),
    totalQuota: integer("total_quota").default(3),
    multiplier: integer("multiplier").default(1), // Added multiplier field - default is 1x (no multiplier)
  },
  (table) => {
    return {
      // Ensure only one quota entry per user per day
      uniqDailyQuota: unique().on(table.twitterHandle, table.date),
    };
  }
);

// Track Apify runs for reputation scanning
export const repScans = pgTable("rep_scans", {
  id: serial("id").primaryKey(),
  startTime: timestamp("start_time").defaultNow(),
  endTime: timestamp("end_time"),
  status: text("status").default("running"),
  tweetsScanned: integer("tweets_scanned").default(0),
  reputationAwarded: integer("reputation_awarded").default(0),
  error: text("error"),
});

// Store the keyword/topic of the day
export const repKeywords = pgTable("rep_keywords", {
  id: serial("id").primaryKey(),
  keyword: text("keyword").notNull(),
  description: text("description"),
  pointsAwarded: integer("points_awarded").default(1),
  activeDate: timestamp("active_date").defaultNow(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Store PFP (Profile Picture) collections data
export const pfpCollections = pgTable(
  "pfp_collections",
  {
    id: serial("id").primaryKey(),
    nftName: text("nft_name").notNull(),
    nftType: text("nft_type").notNull(),
    twitterHandle: text("twitter_handle"),
    count: integer("count").default(0),
    totalSupply: integer("total_supply"),
    price: numeric("price", { precision: 20, scale: 8 }), // Using numeric for precise price handling
    mindshareScore: numeric("mindshare_score", { precision: 10, scale: 4 }),
    ranking: integer("ranking"),
    active: boolean("active").default(true).notNull(), // Track if collection is active
  },
  (table) => {
    return {
      nftTypeIdx: index("pfp_collections_nft_type_idx").on(table.nftType),
      twitterHandleIdx: index("pfp_collections_twitter_handle_idx").on(
        table.twitterHandle
      ),
      mindshareScoreIdx: index("pfp_collections_mindshare_score_idx").on(
        table.mindshareScore
      ),
      rankingIdx: index("pfp_collections_ranking_idx").on(table.ranking),
    };
  }
);

// Store NFT data with image vectors for similarity search
export const nfts = pgTable(
  "nfts",
  {
    id: serial("id").primaryKey(),
    objectId: text("object_id").notNull().unique(), // SUI object ID
    type: text("type").notNull(), // e.g., "otherNFT"
    objectType: text("object_type").notNull(), // Full contract type
    name: text("name").notNull(), // NFT name
    description: text("description"), // NFT description
    owner: text("owner").notNull(), // Current owner address
    imageURL: text("image_url").notNull(), // IPFS or HTTP URL
    imageVector: vector("image_vector", { dimensions: 768 }), // pgvector for 768-dimensional embeddings
    imageVectorUpToDate: boolean("image_vector_up_to_date")
      .default(false)
      .notNull(), // Track if image vector is current
    version: bigint("version", { mode: "number" }), // Object version
    createdTime: bigint("created_time", { mode: "number" }), // Unix timestamp
    holder: text("holder"), // Holder address (different from owner?)
    lastImageUpdateTime: timestamp("last_image_update_time").defaultNow(), // Last time image vector was updated
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => {
    return {
      objectIdIdx: index("nfts_object_id_idx").on(table.objectId),
      objectTypeIdx: index("nfts_object_type_idx").on(table.objectType),
      ownerIdx: index("nfts_owner_idx").on(table.owner),
      holderIdx: index("nfts_holder_idx").on(table.holder),
      imageUrlIdx: index("nfts_image_url_idx").on(table.imageURL),
      imageVectorUpToDateIdx: index("nfts_image_vector_up_to_date_idx").on(
        table.imageVectorUpToDate
      ),
      createdTimeIdx: index("nfts_created_time_idx").on(table.createdTime),
      lastImageUpdateIdx: index("nfts_last_image_update_idx").on(
        table.lastImageUpdateTime
      ),
    };
  }
);

// Import loyalty projects table for relations
import { loyaltyProjects } from "./loyalty_schema";

// Relations
export const repUserRelations = relations(repUsers, ({ many, one }) => ({
  receivedPoints: many(repPoints, { relationName: "reputation_received" }),
  givenPoints: many(repPoints, { relationName: "reputation_given" }),
  pfpCollection: one(pfpCollections, {
    fields: [repUsers.pfpCollectionId],
    references: [pfpCollections.id],
  }),
  loyaltyProject: one(loyaltyProjects, {
    fields: [repUsers.loyaltyProjectId],
    references: [loyaltyProjects.id],
  }),
  // DEPRECATED: quotas relation removed since quota data is now in rep_users table
  // quotas: many(repQuota)
}));

export const pfpCollectionsRelations = relations(
  pfpCollections,
  ({ many }) => ({
    users: many(repUsers),
    // NFTs table is independent without direct foreign key relations
  })
);

export const nftsRelations = relations(nfts, ({}) => ({
  // NFTs are standalone entities without direct foreign key relations
  // They can be linked to pfp collections via objectType matching
}));

export const repPointsRelations = relations(repPoints, ({ one }) => ({
  giver: one(repUsers, {
    fields: [repPoints.fromHandle],
    references: [repUsers.twitterHandle],
    relationName: "reputation_given",
  }),
  receiver: one(repUsers, {
    fields: [repPoints.toHandle],
    references: [repUsers.twitterHandle],
    relationName: "reputation_received",
  }),
}));

export const repQuotaRelations = relations(repQuota, ({ one }) => ({
  user: one(repUsers, {
    fields: [repQuota.twitterHandle],
    references: [repUsers.twitterHandle],
  }),
}));

// Types
export type RepUser = typeof repUsers.$inferSelect;
export type InsertRepUser = typeof repUsers.$inferInsert;
export type RepPoint = typeof repPoints.$inferSelect;
export type InsertRepPoint = typeof repPoints.$inferInsert;
export type RepQuota = typeof repQuota.$inferSelect;
export type InsertRepQuota = typeof repQuota.$inferInsert;
export type RepScan = typeof repScans.$inferSelect;
export type InsertRepScan = typeof repScans.$inferInsert;
export type RepKeyword = typeof repKeywords.$inferSelect;
export type InsertRepKeyword = typeof repKeywords.$inferInsert;
export type InfluencerCategory = typeof influencerCategories.$inferSelect;
export type InsertInfluencerCategory = typeof influencerCategories.$inferInsert;
export type PfpCollection = typeof pfpCollections.$inferSelect;
export type InsertPfpCollection = typeof pfpCollections.$inferInsert;
export type Nft = typeof nfts.$inferSelect;
export type InsertNft = typeof nfts.$inferInsert;

// Schemas
export const insertRepUserSchema = createInsertSchema(repUsers);
export const selectRepUserSchema = createSelectSchema(repUsers);
export const insertRepPointSchema = createInsertSchema(repPoints);
export const selectRepPointSchema = createSelectSchema(repPoints);
export const insertRepQuotaSchema = createInsertSchema(repQuota);
export const selectRepQuotaSchema = createSelectSchema(repQuota);
export const insertRepKeywordSchema = createInsertSchema(repKeywords);
export const selectRepKeywordSchema = createSelectSchema(repKeywords);
export const insertInfluencerCategorySchema = createInsertSchema(
  influencerCategories
).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export const selectInfluencerCategorySchema =
  createSelectSchema(influencerCategories);
export const insertPfpCollectionSchema = createInsertSchema(pfpCollections);
export const selectPfpCollectionSchema = createSelectSchema(pfpCollections);
export const insertNftSchema = createInsertSchema(nfts);
export const selectNftSchema = createSelectSchema(nfts);
