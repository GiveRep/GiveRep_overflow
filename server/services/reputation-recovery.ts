import { pool } from "../../db";

interface RecoveryResult {
  success: boolean;
  message: string;
  recoveredData?: {
    oldHandle: string;
    newHandle: string;
    pointsRecovered: number;
    tablesUpdated: string[];
  };
}

/**
 * Recover reputation points when a user changes their Twitter handle
 * This updates the rep_user_points table to reflect the new handle
 */
export async function recoverReputationPoints(
  oldHandle: string,
  newHandle: string,
  twitterId: string
): Promise<RecoveryResult> {
  // Normalize handles
  const normalizedOldHandle = oldHandle.toLowerCase().replace('@', '');
  const normalizedNewHandle = newHandle.toLowerCase().replace('@', '');
  
  if (normalizedOldHandle === normalizedNewHandle) {
    return {
      success: false,
      message: "Old and new handles are the same"
    };
  }
  
  try {
    // Call the consolidated database function to handle recovery
    const recoveryQuery = `SELECT recover_rep_user_account($1, $2, $3) as success`;
    const result = await pool.query(recoveryQuery, [
      normalizedOldHandle,
      normalizedNewHandle,
      BigInt(twitterId)
    ]);
    
    if (!result.rows[0]?.success) {
      return {
        success: false,
        message: "No data found for the old handle"
      };
    }
    
    // Get the recovered points information
    const pointsQuery = `
      SELECT 
        total_reputation,
        points_last_7d,
        points_last_30d,
        unique_givers_total
      FROM rep_users
      WHERE LOWER(twitter_handle) = LOWER($1)
    `;
    
    const pointsResult = await pool.query(pointsQuery, [normalizedNewHandle]);
    const points = pointsResult.rows[0];
    
    return {
      success: true,
      message: "Successfully recovered reputation data",
      recoveredData: {
        oldHandle: normalizedOldHandle,
        newHandle: normalizedNewHandle,
        pointsRecovered: points?.total_reputation || 0,
        tablesUpdated: ['rep_users']
      }
    };
    
  } catch (error: any) {
    console.error('Error recovering reputation points:', error);
    
    // Check for specific error messages
    if (error.message?.includes('Twitter ID mismatch')) {
      return {
        success: false,
        message: "This account does not belong to you"
      };
    }
    
    return {
      success: false,
      message: error.message || "Failed to recover reputation data"
    };
  }
}

/**
 * Find all handles associated with a twitter_id
 * Useful for identifying handle changes
 */
export async function findHandlesByTwitterId(twitterId: string): Promise<string[]> {
  try {
    const query = `SELECT * FROM find_user_handles_by_twitter_id($1)`;
    const result = await pool.query(query, [BigInt(twitterId)]);
    
    return result.rows.map(row => row.handle);
  } catch (error) {
    console.error('Error finding handles:', error);
    return [];
  }
}

/**
 * Populate twitter_id for users who don't have it
 * This helps ensure all users can be properly tracked even after handle changes
 */
export async function populateMissingTwitterIds(): Promise<number> {
  try {
    // Try to populate from multiple sources
    const updateQuery = `
      UPDATE rep_user_points rup
      SET twitter_id = COALESCE(
        -- Try rep_points first
        (SELECT to_id FROM rep_points WHERE LOWER(to_handle) = rup.twitter_handle AND to_id IS NOT NULL LIMIT 1),
        -- Then try twitter_user_info
        (SELECT twitter_id FROM twitter_user_info WHERE LOWER(handle) = rup.twitter_handle AND twitter_id IS NOT NULL LIMIT 1),
        -- Then try rep_users (convert if needed)
        (SELECT twitter_id::BIGINT FROM rep_users WHERE LOWER(twitter_handle) = rup.twitter_handle AND twitter_id IS NOT NULL AND twitter_id ~ '^[0-9]+$' LIMIT 1),
        -- Finally try giverep_users
        (SELECT twitter_id::BIGINT FROM giverep_users WHERE LOWER(twitter_handle) = rup.twitter_handle AND twitter_id IS NOT NULL AND twitter_id ~ '^[0-9]+$' LIMIT 1)
      )
      WHERE twitter_id IS NULL
    `;
    
    const result = await pool.query(updateQuery);
    return result.rowCount || 0;
  } catch (error) {
    console.error('Error populating twitter_ids:', error);
    return 0;
  }
}