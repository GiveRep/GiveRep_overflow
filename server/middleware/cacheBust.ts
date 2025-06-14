import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';

/**
 * Middleware to set appropriate cache control headers for static assets
 * and add cache busting parameters to JS/CSS files
 */
export function cacheBustMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only apply to HTML requests or the root URL
  if (!req.path.endsWith('.html') && req.path !== '/' && req.path !== '') {
    return next();
  }

  // Store the original send function
  const originalSend = res.send;

  // Override the send function to modify HTML content
  res.send = function(this: Response, body: any): Response {
    // Only process HTML responses
    if (typeof body === 'string' && res.getHeader('Content-Type')?.toString().includes('text/html')) {
      // Process HTML to add cache busting tokens
      const modifiedHtml = injectCacheBustTokens(body);
      return originalSend.call(this, modifiedHtml);
    }
    
    // For non-HTML responses, proceed as normal
    // Use explicit typecasting to handle the arguments array
    return originalSend.apply(this, [body]);
  } as typeof res.send;

  next();
}

/**
 * Middleware to modify the HTML content to add cache busting parameters
 * to script and style tags
 */
export function injectCacheBustTokens(htmlContent: string): string {
  // Generate a cache-busting token based on current timestamp
  const cacheBuster = Date.now().toString(36);
  
  // Try to read build-info.json for a consistent build ID if available
  let buildId = cacheBuster;
  try {
    const buildInfoPath = path.resolve(process.cwd(), 'dist/public/build-info.json');
    if (fs.existsSync(buildInfoPath)) {
      const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
      buildId = buildInfo.buildId || cacheBuster;
    }
  } catch (error) {
    console.error('Error reading build info for cache busting:', error);
  }

  // Add cache-busting parameter to script src attributes
  htmlContent = htmlContent.replace(
    /<script([^>]*)src=["']([^"'?]+)(\\?[^"']*)?["']([^>]*)>/gi,
    (match, attrsBefore, src, query, attrsAfter) => {
      // Skip if already has cachebuster or is an external URL
      if ((query && query.includes('v=')) || src.startsWith('http') || src.startsWith('//')) {
        return match;
      }
      const separator = query ? '&' : '?';
      return `<script${attrsBefore}src="${src}${query || ''}${separator}v=${buildId}"${attrsAfter}>`;
    }
  );

  // Add cache-busting parameter to link href attributes (for CSS)
  // First regex pattern focused on stylesheets where rel comes after href
  htmlContent = htmlContent.replace(
    /<link([^>]*)href=["']([^"'?]+)(\\?[^"']*)?["']([^>]*rel=["']stylesheet["'][^>]*)>/gi,
    (match, attrsBefore, href, query, attrsAfter) => {
      // Skip if already has cachebuster or is an external URL
      if ((query && query.includes('v=')) || href.startsWith('http') || href.startsWith('//')) {
        return match;
      }
      const separator = query ? '&' : '?';
      return `<link${attrsBefore}href="${href}${query || ''}${separator}v=${buildId}"${attrsAfter}>`;
    }
  );
  
  // Second regex pattern focused on stylesheets where rel comes before href
  htmlContent = htmlContent.replace(
    /<link([^>]*)rel=["']stylesheet["']([^>]*)href=["']([^"'?]+)(\\?[^"']*)?["']([^>]*)>/gi,
    (match, attrsBefore, middleAttrs, href, query, attrsAfter) => {
      // Skip if already has cachebuster or is an external URL
      if ((query && query.includes('v=')) || href.startsWith('http') || href.startsWith('//')) {
        return match;
      }
      const separator = query ? '&' : '?';
      return `<link${attrsBefore}rel="stylesheet"${middleAttrs}href="${href}${query || ''}${separator}v=${buildId}"${attrsAfter}>`;
    }
  );

  return htmlContent;
}