import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as giverepSchema from "./giverep_schema";
import * as legalTermsSchema from "./legal_terms_schema";
import * as loyaltySchema from "./loyalty_schema";
import * as mindshareSchema from "./mindshare_schema";
import * as nftFetchingStatusSchema from "./nft_fetching_status_schema";
import * as pfpMatchingTasksSchema from "./pfp_matching_tasks_schema";
import * as reputationSchema from "./reputation_schema";
import * as schema from "./schema";
import * as trustCountSchema from "./trust_count_schema";
import * as twitterUserInfoSchema from "./twitter_user_info_schema";

neonConfig.webSocketConstructor = ws;

import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}

// Create connection pool for write operations (primary database)
export const writePool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create connection pool for read operations (read replica)
// Falls back to primary database if read replica URL is not set
export const readPool = process.env.DATABASE_URL_READ
  ? new Pool({ connectionString: process.env.DATABASE_URL_READ })
  : writePool;

// Log which connections we're using
console.log(`Database connections initialized:`);
console.log(`- Write operations: Using primary database`);
console.log(
  `- Read operations: Using ${
    process.env.DATABASE_URL_READ
      ? "read replica"
      : "primary database (no read replica configured)"
  }`
);

// Create a single schema object that combines all schemas
const combinedSchema = {
  ...schema,
  ...twitterUserInfoSchema,
  ...loyaltySchema,
  ...reputationSchema,
  ...mindshareSchema,
  ...giverepSchema,
  ...trustCountSchema,
  ...legalTermsSchema,
  ...nftFetchingStatusSchema,
  ...pfpMatchingTasksSchema,
};

// Create Drizzle instances for read and write operations
export const db = drizzle({ client: writePool, schema: combinedSchema });
export const readDb = drizzle({ client: readPool, schema: combinedSchema });

// For backward compatibility, keep the 'pool' export pointing to writePool
export const pool = writePool;

/**
 * Utility function to get the appropriate database connection for read operations
 * This makes it easy to add more read replicas or implement load balancing in the future
 * @returns Database connection for read operations
 */
export function getReadDatabase() {
  return readDb;
}

/**
 * Utility function to get the appropriate database connection for write operations
 * @returns Database connection for write operations
 */
export function getWriteDatabase() {
  return db;
}

/**
 * Utility function to get the appropriate connection pool for direct SQL queries
 * @param forWrite Whether the operation is a write operation (defaults to false)
 * @returns The appropriate connection pool
 */
export function getConnectionPool(forWrite = false) {
  return forWrite ? writePool : readPool;
}

