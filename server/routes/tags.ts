import { Router, Request, Response } from "express";
import { db } from "../../db/index";
import { projectTags } from "../../db/loyalty_schema";
import { 
  insertProjectTagSchema,
  selectProjectTagSchema 
} from "../../db/loyalty_schema";
import { eq, desc } from "drizzle-orm";
import { isAdmin } from "../middleware/auth";
import { clearCacheByPrefix } from "../utils/cache";

export const tagsRouter = Router();

// GET all project tags
tagsRouter.get("/", async (req: Request, res: Response) => {
  try {
    // Check for visible-only flag (default to true for regular users)
    const visibleOnly = req.query.visibleOnly !== "false";
    const isAdmin = !!req.session.adminPassword; // Check if user is admin

    let tags;
    
    // Apply conditional filter for visibility
    if (visibleOnly && !isAdmin) {
      tags = await db.select()
        .from(projectTags)
        .where(eq(projectTags.visible, true))
        .orderBy(desc(projectTags.id));
    } else {
      tags = await db.select()
        .from(projectTags)
        .orderBy(desc(projectTags.id));
    }
    
    res.json(tags);
  } catch (error) {
    console.error("Error fetching project tags:", error);
    res.status(500).json({ error: "Failed to fetch project tags" });
  }
});

// GET a specific project tag by ID
tagsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const tagId = parseInt(req.params.id);
    
    if (isNaN(tagId)) {
      return res.status(400).json({ error: "Invalid tag ID" });
    }
    
    const [tag] = await db.select().from(projectTags).where(eq(projectTags.id, tagId));
    
    if (!tag) {
      return res.status(404).json({ error: "Tag not found" });
    }
    
    res.json(tag);
  } catch (error) {
    console.error(`Error fetching project tag ${req.params.id}:`, error);
    res.status(500).json({ error: "Failed to fetch project tag" });
  }
});

// POST create a new project tag (admin only)
tagsRouter.post("/", isAdmin, async (req: Request, res: Response) => {
  try {
    const parseResult = insertProjectTagSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Invalid tag data", 
        details: parseResult.error.errors 
      });
    }
    
    const [tag] = await db.insert(projectTags).values(parseResult.data).returning();
    
    // Clear cache for tags
    try {
      await clearCacheByPrefix('/giverep/tags');
      await clearCacheByPrefix('/loyalty/tags');
      await clearCacheByPrefix('/loyalty/projects'); // Since projects include tags
      console.log('Cleared tags cache after creating new tag');
    } catch (cacheError) {
      console.error('Error clearing cache after creating new tag:', cacheError);
    }
    
    res.status(201).json(tag);
  } catch (error) {
    console.error("Error creating project tag:", error);
    res.status(500).json({ error: "Failed to create project tag" });
  }
});

// PUT update an existing project tag (admin only)
tagsRouter.put("/:id", isAdmin, async (req: Request, res: Response) => {
  try {
    const tagId = parseInt(req.params.id);
    
    if (isNaN(tagId)) {
      return res.status(400).json({ error: "Invalid tag ID" });
    }
    
    const parseResult = insertProjectTagSchema.partial().safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Invalid tag data", 
        details: parseResult.error.errors 
      });
    }
    
    const [updatedTag] = await db
      .update(projectTags)
      .set({
        ...parseResult.data,
        updated_at: new Date()
      })
      .where(eq(projectTags.id, tagId))
      .returning();
    
    if (!updatedTag) {
      return res.status(404).json({ error: "Tag not found" });
    }
    
    // Clear cache for tags
    try {
      await clearCacheByPrefix('/giverep/tags');
      await clearCacheByPrefix('/loyalty/tags');
      await clearCacheByPrefix('/loyalty/projects'); // Since projects include tags
      console.log(`Cleared cache for updated tag ${tagId}`);
    } catch (cacheError) {
      console.error(`Error clearing cache for tag ${tagId}:`, cacheError);
    }
    
    res.json(updatedTag);
  } catch (error) {
    console.error(`Error updating project tag ${req.params.id}:`, error);
    res.status(500).json({ error: "Failed to update project tag" });
  }
});

// DELETE a project tag (admin only)
tagsRouter.delete("/:id", isAdmin, async (req: Request, res: Response) => {
  try {
    const tagId = parseInt(req.params.id);
    
    if (isNaN(tagId)) {
      return res.status(400).json({ error: "Invalid tag ID" });
    }
    
    // First check if the tag exists
    const [existingTag] = await db.select().from(projectTags).where(eq(projectTags.id, tagId));
    
    if (!existingTag) {
      return res.status(404).json({ error: "Tag not found" });
    }
    
    // Delete the tag
    await db.delete(projectTags).where(eq(projectTags.id, tagId));
    
    // Clear cache for tags
    try {
      await clearCacheByPrefix('/giverep/tags');
      await clearCacheByPrefix('/loyalty/tags');
      await clearCacheByPrefix('/loyalty/projects'); // Since projects include tags
      console.log(`Cleared cache after deleting tag ${tagId}`);
    } catch (cacheError) {
      console.error(`Error clearing cache after deleting tag ${tagId}:`, cacheError);
    }
    
    res.json({ success: true, message: `Tag "${existingTag.name}" deleted successfully` });
  } catch (error) {
    console.error(`Error deleting project tag ${req.params.id}:`, error);
    res.status(500).json({ error: "Failed to delete project tag" });
  }
});