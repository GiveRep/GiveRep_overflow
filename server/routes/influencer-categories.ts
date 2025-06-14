import { Router, Request, Response } from "express";
import { db } from "../../db";
import { repUsers, influencerCategories, InfluencerCategory, InsertInfluencerCategory } from "../../db/reputation_schema";
import { eq, sql, and, desc, inArray } from "drizzle-orm";
import { isAdmin } from "../middleware/auth";
import { clearCacheByPrefix } from "../utils/cache";

export const influencerCategoriesRouter = Router();

// GET /api/influencer-categories - Get all available categories
influencerCategoriesRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const categories = await db
      .select()
      .from(influencerCategories)
      .where(eq(influencerCategories.visible, true))
      .orderBy(influencerCategories.name);

    res.json({
      categories,
      success: true
    });
  } catch (error) {
    console.error("Error fetching influencer categories:", error);
    res.status(500).json({ 
      error: "Failed to fetch categories",
      success: false 
    });
  }
});

// POST /api/influencer-categories - Create new category (admin only)
influencerCategoriesRouter.post("/", isAdmin, async (req: Request, res: Response) => {
  try {
    const { name, description, visible = true } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ 
        error: "Category name is required",
        success: false 
      });
    }

    const [newCategory] = await db
      .insert(influencerCategories)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        visible
      })
      .returning();

    res.json({
      category: newCategory,
      success: true
    });
  } catch (error: any) {
    console.error("Error creating influencer category:", error);
    if (error?.code === '23505') { // Unique constraint violation
      res.status(400).json({ 
        error: "Category name already exists",
        success: false 
      });
    } else {
      res.status(500).json({ 
        error: "Failed to create category",
        success: false 
      });
    }
  }
});

// PUT /api/influencer-categories/:id - Update category (admin only)
influencerCategoriesRouter.put("/:id", isAdmin, async (req: Request, res: Response) => {
  try {
    const categoryId = parseInt(req.params.id);
    const { name, description, visible } = req.body;

    if (isNaN(categoryId)) {
      return res.status(400).json({ 
        error: "Invalid category ID",
        success: false 
      });
    }

    const updateData: Partial<InfluencerCategory> = {};
    
    if (name !== undefined) {
      updateData.name = name.trim();
    }
    
    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }
    
    if (typeof visible === 'boolean') {
      updateData.visible = visible;
    }

    updateData.updated_at = new Date();

    const [updatedCategory] = await db
      .update(influencerCategories)
      .set(updateData)
      .where(eq(influencerCategories.id, categoryId))
      .returning();

    if (!updatedCategory) {
      return res.status(404).json({ 
        error: "Category not found",
        success: false 
      });
    }

    res.json({
      category: updatedCategory,
      success: true
    });
  } catch (error: any) {
    console.error("Error updating influencer category:", error);
    if (error?.code === '23505') { // Unique constraint violation
      res.status(400).json({ 
        error: "Category name already exists",
        success: false 
      });
    } else {
      res.status(500).json({ 
        error: "Failed to update category",
        success: false 
      });
    }
  }
});

// DELETE /api/influencer-categories/:id - Delete category (admin only)
influencerCategoriesRouter.delete("/:id", isAdmin, async (req: Request, res: Response) => {
  try {
    const categoryId = parseInt(req.params.id);

    if (isNaN(categoryId)) {
      return res.status(400).json({ 
        error: "Invalid category ID",
        success: false 
      });
    }

    // Check if category is being used by any influencers
    // SQL injection prevention: Using parameterized query instead of string interpolation
    const usageCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(repUsers)
      .where(
        and(
          eq(repUsers.isInfluencer, true),
          sql`${repUsers.influencerCategories} @> ARRAY[${sql.placeholder('categoryId')}]::integer[]`
        )
      )
      .prepare('checkCategoryUsage')
      .execute({ categoryId });

    if (usageCount[0]?.count > 0) {
      return res.status(400).json({ 
        error: `Cannot delete category: it is being used by ${usageCount[0].count} influencer(s)`,
        success: false 
      });
    }

    const [deletedCategory] = await db
      .delete(influencerCategories)
      .where(eq(influencerCategories.id, categoryId))
      .returning();

    if (!deletedCategory) {
      return res.status(404).json({ 
        error: "Category not found",
        success: false 
      });
    }

    res.json({
      category: deletedCategory,
      success: true
    });
  } catch (error) {
    console.error("Error deleting influencer category:", error);
    res.status(500).json({ 
      error: "Failed to delete category",
      success: false 
    });
  }
});

// POST /api/influencer-categories/influencers - Set influencer status and categories by Twitter handle
influencerCategoriesRouter.post("/influencers", isAdmin, async (req: Request, res: Response) => {
  try {
    const { twitter_handle, categories, dailyQuota, multiplier } = req.body;

    if (!twitter_handle || typeof twitter_handle !== 'string') {
      return res.status(400).json({ 
        error: "Twitter handle is required",
        success: false 
      });
    }

    // Validate category IDs exist
    if (categories && Array.isArray(categories) && categories.length > 0) {
      const existingCategories = await db
        .select({ id: influencerCategories.id })
        .from(influencerCategories)
        .where(inArray(influencerCategories.id, categories));

      if (existingCategories.length !== categories.length) {
        return res.status(400).json({ 
          error: "One or more category IDs do not exist",
          success: false 
        });
      }
    }

    // Find user by twitter handle (case-insensitive)
    const [user] = await db
      .select({ id: repUsers.id })
      .from(repUsers)
      .where(eq(sql`LOWER(${repUsers.twitterHandle})`, twitter_handle.toLowerCase()));

    if (!user) {
      return res.status(404).json({ 
        error: `User with handle @${twitter_handle} not found`,
        success: false 
      });
    }

    // Update user to be influencer with categories
    const updateData: any = {
      isInfluencer: true,
      influencerCategories: Array.isArray(categories) ? categories : []
    };
    
    // Add optional fields if provided
    if (dailyQuota !== undefined && typeof dailyQuota === 'number') {
      updateData.dailyQuota = Math.min(100, Math.max(1, dailyQuota));
    }
    
    if (multiplier !== undefined && typeof multiplier === 'number') {
      updateData.multiplier = Math.min(10, Math.max(0.1, multiplier));
    }
    
    await db
      .update(repUsers)
      .set(updateData)
      .where(eq(repUsers.id, user.id));

    // Fetch updated user with category details
    const [updatedUser] = await db
      .select({
        id: repUsers.id,
        twitter_handle: repUsers.twitterHandle,
        is_influencer: repUsers.isInfluencer,
        influencer_categories: repUsers.influencerCategories,
        total_reputation: repUsers.totalReputation,
        follower_count: repUsers.followerCount,
        multiplier: repUsers.multiplier,
        daily_quota: repUsers.dailyQuota,
      })
      .from(repUsers)
      .where(eq(repUsers.id, user.id));

    // Get category details
    const categoryDetails = (updatedUser.influencer_categories && updatedUser.influencer_categories.length > 0) ? await db
      .select()
      .from(influencerCategories)
      .where(inArray(influencerCategories.id, updatedUser.influencer_categories)) : [];

    // Clear influencer cache so updated data is reflected immediately
    await clearCacheByPrefix('rep:influencers:');
    console.log("Cleared influencer cache after updating categories for:", twitter_handle);

    res.json({
      user: {
        ...updatedUser,
        categories: categoryDetails
      },
      success: true
    });
  } catch (error) {
    console.error("Error setting influencer status:", error);
    res.status(500).json({ 
      error: "Failed to set influencer status",
      success: false 
    });
  }
});

// GET /api/influencer-categories/stats - Get category statistics
influencerCategoriesRouter.get("/stats", async (_req: Request, res: Response) => {
  try {
    // Get total influencers count
    const totalInfluencers = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(repUsers)
      .where(eq(repUsers.isInfluencer, true));

    // Get all categories
    const categories = await db
      .select()
      .from(influencerCategories)
      .where(eq(influencerCategories.visible, true));

    // Get category distribution
    const categoryStats = await Promise.all(
      categories.map(async (category) => {
        // SQL injection prevention: Using parameterized query instead of string interpolation
        const count = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(repUsers)
          .where(
            and(
              eq(repUsers.isInfluencer, true),
              sql`${repUsers.influencerCategories} @> ARRAY[${sql.placeholder('categoryId')}]::integer[]`
            )
          )
          .prepare(`checkCategoryUsage_${category.id}`)
          .execute({ categoryId: category.id });
        
        return {
          ...category,
          influencer_count: count[0]?.count || 0
        };
      })
    );

    res.json({
      total_influencers: totalInfluencers[0]?.count || 0,
      category_distribution: categoryStats,
      success: true
    });
  } catch (error) {
    console.error("Error fetching category stats:", error);
    res.status(500).json({ 
      error: "Failed to fetch stats",
      success: false 
    });
  }
});

// POST /api/influencer-categories/influencers/bulk - Bulk import influencers
influencerCategoriesRouter.post("/influencers/bulk", isAdmin, async (req: Request, res: Response) => {
  try {
    const { influencers } = req.body;

    if (!Array.isArray(influencers) || influencers.length === 0) {
      return res.status(400).json({ 
        error: "No influencers provided for import",
        success: false 
      });
    }

    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    // Collect all twitter handles for batch lookup
    const handles = influencers
      .filter(inf => inf.twitter_handle && typeof inf.twitter_handle === 'string')
      .map(inf => inf.twitter_handle.toLowerCase());

    if (handles.length === 0) {
      return res.status(400).json({ 
        error: "No valid twitter handles provided",
        success: false 
      });
    }

    // Batch lookup all users
    const existingUsers = await db
      .select({
        id: repUsers.id,
        twitterHandle: repUsers.twitterHandle
      })
      .from(repUsers)
      .where(sql`LOWER(${repUsers.twitterHandle}) = ANY(ARRAY[${sql.join(handles.map(h => sql`${h}`), sql`,`)}])`);

    // Create a map for quick lookup
    const userMap = new Map(
      existingUsers.map(user => [user.twitterHandle.toLowerCase(), user.id])
    );

    // Prepare batch updates
    const updates: Array<{ id: number, data: any }> = [];
    
    for (const influencer of influencers) {
      const { twitter_handle, categories, dailyQuota, multiplier } = influencer;

      if (!twitter_handle || typeof twitter_handle !== 'string') {
        failed++;
        errors.push(`Invalid twitter handle: ${twitter_handle}`);
        continue;
      }

      const userId = userMap.get(twitter_handle.toLowerCase());
      if (!userId) {
        failed++;
        errors.push(`User @${twitter_handle} not found`);
        continue;
      }

      // Prepare update data
      const updateData: any = {
        isInfluencer: true,
        influencerCategories: Array.isArray(categories) ? categories : []
      };
      
      if (dailyQuota !== undefined && typeof dailyQuota === 'number') {
        updateData.dailyQuota = Math.min(100, Math.max(1, dailyQuota));
      }
      
      if (multiplier !== undefined && typeof multiplier === 'number') {
        updateData.multiplier = Math.min(10, Math.max(0.1, multiplier));
      }

      updates.push({ id: userId, data: updateData });
      imported++;
    }

    // Execute bulk update - process in batches to avoid SQL injection and improve performance
    if (updates.length > 0) {
      // Use transaction for consistency
      await db.transaction(async (tx) => {
        // Process updates in smaller batches
        const BATCH_SIZE = 50;
        
        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
          const batch = updates.slice(i, i + BATCH_SIZE);
          
          // Use Promise.all for parallel updates within each batch
          await Promise.all(
            batch.map(({ id, data }) =>
              tx
                .update(repUsers)
                .set({
                  isInfluencer: true,
                  dailyQuota: data.dailyQuota,
                  multiplier: data.multiplier,
                  influencerCategories: data.influencerCategories,
                  updated_at: new Date()
                })
                .where(eq(repUsers.id, id))
            )
          );
        }
      });
    }

    // Clear influencer cache so updated data is reflected immediately
    await clearCacheByPrefix('rep:influencers:');
    console.log(`Bulk import completed: ${imported} imported, ${failed} failed`);

    res.json({
      imported,
      failed,
      errors: errors.slice(0, 10), // Limit errors to first 10
      success: true
    });
  } catch (error) {
    console.error("Error in bulk influencer import:", error);
    res.status(500).json({ 
      error: "Failed to import influencers",
      success: false 
    });
  }
});

export type { InfluencerCategory, InsertInfluencerCategory };