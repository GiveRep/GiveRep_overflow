import { Router, Request, Response } from 'express';
import { eq, ilike, and, or, gte, lte, desc, asc, count } from 'drizzle-orm';
import { getWriteDatabase, getReadDatabase } from '../../db/index.js';
import { pfpCollections, nfts } from '../../db/reputation_schema.js';
import { isAdmin } from '../middleware/auth.js';
import { tradeportService } from '../services/tradeport-service.js';
import { formatMistToSui, formatNumber } from '@/lib/formatters.js';

const router = Router();

// Middleware to require admin authentication
router.use(isAdmin);

// GET /api/admin/nft-collections/search-tradeport - Search collections from Tradeport API
router.get('/search-tradeport', async (req: Request, res: Response) => {
  try {
    const { query, limit = '10' } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    if (query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    const limitNum = Math.min(Math.max(parseInt(limit as string, 10), 1), 50);
    
    // Search collections from Tradeport
    const collections = await tradeportService.searchCollections(query, limitNum);
    
    // Check which collections already exist in our database
    const db = getReadDatabase();
    const existingSlugs = collections.length > 0 
      ? await db
          .select({ nftType: pfpCollections.nftType })
          .from(pfpCollections)
          .where(
            or(...collections.map(c => eq(pfpCollections.nftType, c.slug)))
          )
      : [];
    
    const existingSlugSet = new Set(existingSlugs.map(e => e.nftType));

    console.log(collections);
    
    // Add exists flag to each collection
    const collectionsWithStatus = collections.map(collection => ({
      ...collection,
      exists: existingSlugSet.has(collection.slug),
      formattedFloor: collection.floor ? `${formatMistToSui(collection.floor)} SUI` : null,
      formattedVolume: collection.volume ? formatMistToSui(collection.volume) : null
    }));
    
    res.json({
      results: collectionsWithStatus,
      total: collectionsWithStatus.length
    });
  } catch (error) {
    console.error('Error searching Tradeport collections:', error);
    res.status(500).json({ 
      error: 'Failed to search collections',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/admin/nft-collections - List collections with pagination, search, and filtering
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getReadDatabase();
    
    // Parse query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string;
    const nftType = req.query.nftType as string;
    const minMindshareScore = req.query.minMindshareScore ? parseFloat(req.query.minMindshareScore as string) : undefined;
    const maxMindshareScore = req.query.maxMindshareScore ? parseFloat(req.query.maxMindshareScore as string) : undefined;
    const sortBy = req.query.sortBy as string || 'id';
    const sortOrder = req.query.sortOrder as string || 'desc';
    
    const offset = (page - 1) * limit;
    
    // Build where conditions
    const conditions = [];
    
    if (search) {
      conditions.push(
        or(
          ilike(pfpCollections.nftName, `%${search}%`),
          ilike(pfpCollections.nftType, `%${search}%`),
          ilike(pfpCollections.twitterHandle, `%${search}%`)
        )
      );
    }
    
    if (nftType) {
      conditions.push(eq(pfpCollections.nftType, nftType));
    }
    
    if (minMindshareScore !== undefined) {
      conditions.push(gte(pfpCollections.mindshareScore, minMindshareScore.toString()));
    }
    
    if (maxMindshareScore !== undefined) {
      conditions.push(lte(pfpCollections.mindshareScore, maxMindshareScore.toString()));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    // Build sort order
    let orderByColumn;
    switch (sortBy) {
      case 'id':
        orderByColumn = pfpCollections.id;
        break;
      case 'nftName':
        orderByColumn = pfpCollections.nftName;
        break;
      case 'nftType':
        orderByColumn = pfpCollections.nftType;
        break;
      case 'count':
        orderByColumn = count(nfts.id);
        break;
      case 'mindshareScore':
        orderByColumn = pfpCollections.mindshareScore;
        break;
      case 'ranking':
        orderByColumn = pfpCollections.ranking;
        break;
      default:
        orderByColumn = pfpCollections.id;
    }
    
    const orderBy = sortOrder === 'asc' ? asc(orderByColumn) : desc(orderByColumn);
    
    // Get total count
    const totalCountResult = await db
      .select({ count: pfpCollections.id })
      .from(pfpCollections)
      .where(whereClause);
    
    const totalCount = totalCountResult.length;
    
    // Get paginated results with NFT counts from the nfts table
    const collections = await db
      .select({
        id: pfpCollections.id,
        nftName: pfpCollections.nftName,
        nftType: pfpCollections.nftType,
        twitterHandle: pfpCollections.twitterHandle,
        count: count(nfts.id).as('count'),
        totalSupply: pfpCollections.totalSupply,
        price: pfpCollections.price,
        mindshareScore: pfpCollections.mindshareScore,
        ranking: pfpCollections.ranking,
        active: pfpCollections.active
      })
      .from(pfpCollections)
      .leftJoin(nfts, eq(nfts.objectType, pfpCollections.nftType))
      .where(whereClause)
      .groupBy(
        pfpCollections.id,
        pfpCollections.nftName,
        pfpCollections.nftType,
        pfpCollections.twitterHandle,
        pfpCollections.totalSupply,
        pfpCollections.price,
        pfpCollections.mindshareScore,
        pfpCollections.ranking,
        pfpCollections.active
      )
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);
    
    res.json({
      data: collections,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching NFT collections:', error);
    res.status(500).json({ error: 'Failed to fetch NFT collections' });
  }
});

// POST /api/admin/nft-collections - Create new collection
router.post('/', async (req: Request, res: Response) => {
  try {
    const db = getWriteDatabase();
    
    const {
      nftName,
      nftType,
      twitterHandle,
      count,
      totalSupply,
      price,
      mindshareScore,
      ranking,
      active,
      // New field to indicate if this is from Tradeport
      tradeportSlug
    } = req.body;
    
    // Validate required fields
    if (!nftName || !nftType) {
      return res.status(400).json({ error: 'nftName and nftType are required' });
    }
    
    // If tradeportSlug is provided, fetch additional data from Tradeport
    let tradeportData = null;
    if (tradeportSlug) {
      try {
        tradeportData = await tradeportService.getCollectionBySlug(tradeportSlug);
        if (!tradeportData) {
          console.warn(`Tradeport collection not found for slug: ${tradeportSlug}`);
        }
      } catch (error) {
        console.error('Error fetching Tradeport data:', error);
        // Continue without Tradeport data
      }
    }
    
    // Use Tradeport data to enhance the collection info if available
    const collectionData = {
      nftName: nftName || (tradeportData?.title || nftType),
      nftType: nftType || tradeportSlug,
      twitterHandle: twitterHandle || tradeportData?.twitter || null,
      count: count || 0,
      totalSupply: totalSupply || tradeportData?.supply || null,
      price: price ? price.toString() : 
             tradeportData?.floor ? tradeportData.floor.toString() : 
             undefined,
      mindshareScore: mindshareScore ? mindshareScore.toString() : undefined,
      ranking,
      active: active !== undefined ? active : true
    };
    
    const newCollection = await db
      .insert(pfpCollections)
      .values(collectionData)
      .returning();
    
    res.status(201).json({
      ...newCollection[0],
      tradeportData: tradeportData // Include Tradeport data in response for reference
    });
  } catch (error) {
    console.error('Error creating NFT collection:', error);
    res.status(500).json({ error: 'Failed to create NFT collection' });
  }
});

// PUT /api/admin/nft-collections/:id - Update existing collection
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const db = getWriteDatabase();
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }
    
    const {
      nftName,
      nftType,
      twitterHandle,
      count,
      totalSupply,
      price,
      mindshareScore,
      ranking,
      active
    } = req.body;
    
    const updatedCollection = await db
      .update(pfpCollections)
      .set({
        nftName,
        nftType,
        twitterHandle,
        count,
        totalSupply,
        price: price ? price.toString() : undefined,
        mindshareScore: mindshareScore ? mindshareScore.toString() : undefined,
        ranking,
        active
      })
      .where(eq(pfpCollections.id, id))
      .returning();
    
    if (updatedCollection.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    
    res.json(updatedCollection[0]);
  } catch (error) {
    console.error('Error updating NFT collection:', error);
    res.status(500).json({ error: 'Failed to update NFT collection' });
  }
});

// DELETE /api/admin/nft-collections/:id - Delete collection
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const db = getWriteDatabase();
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }
    
    const deletedCollection = await db
      .delete(pfpCollections)
      .where(eq(pfpCollections.id, id))
      .returning();
    
    if (deletedCollection.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    
    res.json({ message: 'Collection deleted successfully' });
  } catch (error) {
    console.error('Error deleting NFT collection:', error);
    res.status(500).json({ error: 'Failed to delete NFT collection' });
  }
});

// GET /api/admin/nft-collections/export - Export collections to CSV
router.get('/export', async (_req: Request, res: Response) => {
  try {
    const db = getReadDatabase();
    
    const collections = await db
      .select({
        id: pfpCollections.id,
        nftName: pfpCollections.nftName,
        nftType: pfpCollections.nftType,
        twitterHandle: pfpCollections.twitterHandle,
        count: count(nfts.id).as('count'),
        totalSupply: pfpCollections.totalSupply,
        price: pfpCollections.price,
        mindshareScore: pfpCollections.mindshareScore,
        ranking: pfpCollections.ranking,
        active: pfpCollections.active
      })
      .from(pfpCollections)
      .leftJoin(nfts, eq(nfts.objectType, pfpCollections.nftType))
      .groupBy(
        pfpCollections.id,
        pfpCollections.nftName,
        pfpCollections.nftType,
        pfpCollections.twitterHandle,
        pfpCollections.totalSupply,
        pfpCollections.price,
        pfpCollections.mindshareScore,
        pfpCollections.ranking,
        pfpCollections.active
      )
      .orderBy(desc(pfpCollections.id));
    
    // Convert to CSV format
    const csvHeader = 'id,nft_name,nft_type,twitter_handle,count,total_supply,price,mindshare_score,ranking\n';
    const csvRows = collections.map(collection => 
      `${collection.id},"${collection.nftName}","${collection.nftType}","${collection.twitterHandle || ''}",${collection.count || 0},${collection.totalSupply || ''},${collection.price || ''},${collection.mindshareScore || ''},${collection.ranking || ''}`
    ).join('\n');
    
    const csvContent = csvHeader + csvRows;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="nft-collections.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting NFT collections:', error);
    res.status(500).json({ error: 'Failed to export NFT collections' });
  }
});

// POST /api/admin/nft-collections/bulk-import - Import collections from CSV
router.post('/bulk-import', async (req: Request, res: Response) => {
  try {
    const db = getWriteDatabase();
    const { collections, conflictResolution = 'skip', keyField = 'id' } = req.body;
    
    if (!Array.isArray(collections) || collections.length === 0) {
      return res.status(400).json({ error: 'Collections array is required' });
    }
    
    const results = {
      total: collections.length,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[]
    };
    
    for (let index = 0; index < collections.length; index++) {
      const collection = collections[index];
      try {
        const {
          nftName,
          nftType,
          twitterHandle,
          count,
          totalSupply,
          price,
          mindshareScore,
          ranking,
          active
        } = collection;
        
        // Validate required fields
        if (!nftName || !nftType) {
          results.errors.push(`Row ${index + 1}: nftName and nftType are required`);
          continue;
        }
        
        // Check if collection already exists based on keyField
        let existing: any[] = [];
        
        if (keyField === 'nftType') {
          existing = await db
            .select()
            .from(pfpCollections)
            .where(eq(pfpCollections.nftType, nftType))
            .limit(1);
        } else {
          // Default behavior: check both nftName and nftType
          existing = await db
            .select()
            .from(pfpCollections)
            .where(and(
              eq(pfpCollections.nftName, nftName),
              eq(pfpCollections.nftType, nftType)
            ))
            .limit(1);
        }
        
        if (existing.length > 0) {
          if (conflictResolution === 'upsert' || conflictResolution === 'update') {
            // Update existing record with new data
            await db
              .update(pfpCollections)
              .set({
                nftName, // Update name too when using nftType as key
                twitterHandle,
                count: count || 0,
                totalSupply,
                price: price ? price.toString() : undefined,
                mindshareScore: mindshareScore ? mindshareScore.toString() : undefined,
                ranking,
                active: active !== undefined ? active : true
              })
              .where(eq(pfpCollections.id, existing[0].id));
            results.updated++;
          } else {
            results.skipped++;
          }
        } else {
          await db
            .insert(pfpCollections)
            .values({
              nftName,
              nftType,
              twitterHandle,
              count: count || 0,
              totalSupply,
              price: price ? price.toString() : undefined,
              mindshareScore: mindshareScore ? mindshareScore.toString() : undefined,
              ranking,
              active: active !== undefined ? active : true
            });
          results.imported++;
        }
      } catch (error) {
        results.errors.push(`Row ${index + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    res.json(results);
  } catch (error) {
    console.error('Error importing NFT collections:', error);
    res.status(500).json({ error: 'Failed to import NFT collections' });
  }
});

// POST /api/admin/nft-collections/bulk-delete - Delete multiple collections
router.post('/bulk-delete', async (req: Request, res: Response) => {
  try {
    const db = getWriteDatabase();
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs array is required' });
    }
    
    const deletedCollections = await db
      .delete(pfpCollections)
      .where(
        or(...ids.map(id => eq(pfpCollections.id, parseInt(id))))
      )
      .returning();
    
    res.json({ 
      message: `${deletedCollections.length} collections deleted successfully`,
      deletedCount: deletedCollections.length
    });
  } catch (error) {
    console.error('Error bulk deleting NFT collections:', error);
    res.status(500).json({ error: 'Failed to delete NFT collections' });
  }
});

// POST /api/admin/nft-collections/bulk-toggle-active - Toggle active status for multiple collections
router.post('/bulk-toggle-active', async (req: Request, res: Response) => {
  try {
    const db = getWriteDatabase();
    const { ids, active } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs array is required' });
    }
    
    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'Active status must be a boolean' });
    }
    
    const updatedCollections = await db
      .update(pfpCollections)
      .set({ active })
      .where(
        or(...ids.map(id => eq(pfpCollections.id, parseInt(id))))
      )
      .returning();
    
    res.json({ 
      message: `${updatedCollections.length} collections ${active ? 'activated' : 'deactivated'} successfully`,
      updatedCount: updatedCollections.length,
      active
    });
  } catch (error) {
    console.error('Error bulk toggling NFT collections active status:', error);
    res.status(500).json({ error: 'Failed to toggle NFT collections active status' });
  }
});

export default router;