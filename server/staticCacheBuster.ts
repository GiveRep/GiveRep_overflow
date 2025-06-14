import express from 'express';
import path from 'path';
import fs from 'fs';

/**
 * Configure static file serving with cache control headers for production
 * 
 * @param app Express application instance
 * @param distPath Path to the static files directory
 */
export function setupCacheBustedStatic(app: express.Express, distPath: string) {
  // First check if the build-info.json file exists, which contains the build ID
  const buildInfoPath = path.join(distPath, 'build-info.json');
  let buildId: string | null = null;
  
  try {
    if (fs.existsSync(buildInfoPath)) {
      const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
      buildId = buildInfo.buildId;
      console.log(`Serving static files with build ID: ${buildId}`);
    }
  } catch (error) {
    console.error('Error reading build info:', error);
  }
  
  // Serve static files with appropriate cache headers
  app.use(express.static(distPath, {
    // Set Cache-Control headers based on file type
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        // HTML files - short cache with revalidation
        res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
      } else if (filePath.match(/\.(js|css)$/)) {
        // JS/CSS files - long cache with immutability for hashed files
        if (buildId && (filePath.includes(buildId) || filePath.includes('chunk-'))) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
        } else {
          res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
        }
      } else if (filePath.match(/\.(jpg|jpeg|png|gif|ico|svg)$/)) {
        // Images - medium cache
        res.setHeader('Cache-Control', 'public, max-age=604800'); // 1 week
      } else if (filePath.match(/\.(woff|woff2|ttf|otf|eot)$/)) {
        // Fonts - long cache
        res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days
      } else {
        // Other files - moderate cache
        res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
      }
    }
  }));
  
  // Serve index.html for all non-file routes to support client-side routing
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) {
      return next();
    }
    
    // Skip requests for specific file extensions
    if (req.path.match(/\.(js|css|ico|jpg|jpeg|png|gif|svg|woff|woff2|ttf|otf|eot)$/)) {
      return next();
    }
    
    res.sendFile(path.join(distPath, 'index.html'));
  });
}