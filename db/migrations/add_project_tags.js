/**
 * Migration script to create the project_tags table and add tag_ids to loyalty_projects
 */
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function createProjectTagsTable() {
  console.log('Creating project_tags table...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_tags (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        visible BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP
      );
    `);
    
    console.log('✓ project_tags table created successfully');
    
    // Add tag_ids array to loyalty_projects table if it doesn't exist
    const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'loyalty_projects' 
      AND column_name = 'tag_ids';
    `);
    
    if (res.rows.length === 0) {
      console.log('Adding tag_ids column to loyalty_projects table...');
      await pool.query(`
        ALTER TABLE loyalty_projects 
        ADD COLUMN tag_ids INTEGER[] DEFAULT '{}';
      `);
      console.log('✓ tag_ids column added to loyalty_projects table');
    } else {
      console.log('✓ tag_ids column already exists');
    }
    
    // Create some default tags for testing
    console.log('Creating default tags...');
    await pool.query(`
      INSERT INTO project_tags (name, description, visible)
      VALUES 
        ('DeFi', 'Decentralized Finance projects', true),
        ('Gaming', 'Blockchain gaming projects', true),
        ('NFT', 'Non-fungible token related projects', true),
        ('Infrastructure', 'Blockchain infrastructure projects', true),
        ('Community', 'Community-focused projects', true)
      ON CONFLICT DO NOTHING;
    `);
    console.log('✓ Default tags created');
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error in migration:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

createProjectTagsTable()
  .then(() => console.log('All done'))
  .catch(err => {
    console.error('Migration failed', err);
    process.exit(1);
  });