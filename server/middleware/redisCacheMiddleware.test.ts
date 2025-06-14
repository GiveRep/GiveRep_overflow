/**
 * Tests for the Redis Cache Middleware
 */
import { Request, Response } from 'express';
import { redisCacheMiddleware, CacheDuration } from './redisCacheMiddleware';
import * as cacheUtils from '../utils/cache';

// Mock cache utility functions
jest.mock('../utils/cache', () => ({
  getCachedValue: jest.fn(),
  setCachedValue: jest.fn().mockResolvedValue(true),
}));

// Mock zlib module
jest.mock('zlib', () => ({
  gzip: jest.fn((data, callback) => callback(null, Buffer.from('mocked-compressed'))),
  gunzip: jest.fn((data, callback) => callback(null, Buffer.from('{"test":"data"}'))),
}));

describe('Redis Cache Middleware', () => {
  // Mock Express request and response
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup request mock
    req = {
      method: 'GET',
      path: '/api/test',
      query: {},
      get: jest.fn().mockReturnValue(null),
    };
    
    // Setup response mock
    res = {
      json: jest.fn(),
      setHeader: jest.fn(),
    };
    
    // Setup next function mock
    next = jest.fn();
  });

  it('should bypass cache for non-GET requests', async () => {
    // Setup
    req.method = 'POST';
    const middleware = redisCacheMiddleware();
    
    // Execute
    await middleware(req as Request, res as Response, next);
    
    // Assert
    expect(next).toHaveBeenCalled();
    expect(cacheUtils.getCachedValue).not.toHaveBeenCalled();
  });

  it('should bypass cache when specified header is present', async () => {
    // Setup
    req.get = jest.fn().mockReturnValue('true');
    const middleware = redisCacheMiddleware();
    
    // Execute
    await middleware(req as Request, res as Response, next);
    
    // Assert
    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'BYPASS');
    expect(cacheUtils.getCachedValue).not.toHaveBeenCalled();
  });

  it('should return cached data when available', async () => {
    // Setup
    const cachedData = { foo: 'bar' };
    (cacheUtils.getCachedValue as jest.Mock).mockResolvedValue(cachedData);
    const middleware = redisCacheMiddleware();
    
    // Execute
    await middleware(req as Request, res as Response, next);
    
    // Assert
    expect(cacheUtils.getCachedValue).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(cachedData);
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
    expect(next).not.toHaveBeenCalled();
  });

  it('should decompress cached data when compression is enabled', async () => {
    // Setup
    const compressedData = {
      compressed: true,
      data: 'base64data',
    };
    (cacheUtils.getCachedValue as jest.Mock).mockResolvedValue(compressedData);
    const middleware = redisCacheMiddleware({ compress: true });
    
    // Execute
    await middleware(req as Request, res as Response, next);
    
    // Assert
    expect(cacheUtils.getCachedValue).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ test: 'data' });
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
  });

  it('should process request normally on cache miss', async () => {
    // Setup
    (cacheUtils.getCachedValue as jest.Mock).mockResolvedValue(null);
    const middleware = redisCacheMiddleware();
    
    // Execute
    await middleware(req as Request, res as Response, next);
    
    // Assert
    expect(cacheUtils.getCachedValue).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'MISS');
    expect(next).toHaveBeenCalled();
    
    // Check if res.json was replaced
    expect(res.json).not.toBe(undefined);
    expect(typeof res.json).toBe('function');
  });

  it('should cache the response when intercepting res.json', async () => {
    // Setup
    (cacheUtils.getCachedValue as jest.Mock).mockResolvedValue(null);
    const middleware = redisCacheMiddleware();
    const responseData = { result: 'success' };
    
    // Mock the original res.json function
    const originalJson = jest.fn().mockReturnValue('original-return');
    res.json = originalJson;
    
    // Execute
    await middleware(req as Request, res as Response, next);
    
    // Simulate the route handler calling res.json
    const modifiedJson = res.json as jest.Mock;
    const result = await modifiedJson(responseData);
    
    // Assert
    expect(cacheUtils.setCachedValue).toHaveBeenCalled();
    expect(originalJson).toHaveBeenCalledWith(responseData);
    expect(result).toBe('original-return');
  });

  it('should apply compression when saving to cache', async () => {
    // Setup
    (cacheUtils.getCachedValue as jest.Mock).mockResolvedValue(null);
    const middleware = redisCacheMiddleware({ compress: true });
    const responseData = { result: 'success' };
    
    // Mock the original res.json function
    const originalJson = jest.fn();
    res.json = originalJson;
    
    // Execute
    await middleware(req as Request, res as Response, next);
    
    // Simulate the route handler calling res.json
    const modifiedJson = res.json as jest.Mock;
    await modifiedJson(responseData);
    
    // Assert
    expect(cacheUtils.setCachedValue).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        compressed: true,
        data: expect.any(String),
      }),
      expect.any(Number)
    );
  });

  it('should generate correct cache key with query parameters', async () => {
    // Setup
    req.query = { page: '1', limit: '10' };
    (cacheUtils.getCachedValue as jest.Mock).mockResolvedValue(null);
    const middleware = redisCacheMiddleware();
    
    // Execute
    await middleware(req as Request, res as Response, next);
    
    // Assert
    expect(cacheUtils.getCachedValue).toHaveBeenCalledWith(
      'api:/api/test:{"page":"1","limit":"10"}',
      expect.any(Number)
    );
  });

  it('should exclude blacklisted parameters from cache key', async () => {
    // Setup
    req.query = { page: '1', _t: '12345', limit: '10' };
    (cacheUtils.getCachedValue as jest.Mock).mockResolvedValue(null);
    const middleware = redisCacheMiddleware({ paramBlacklist: ['_t'] });
    
    // Execute
    await middleware(req as Request, res as Response, next);
    
    // Assert
    expect(cacheUtils.getCachedValue).toHaveBeenCalledWith(
      'api:/api/test:{"page":"1","limit":"10"}',
      expect.any(Number)
    );
  });

  it('should set appropriate cache headers', async () => {
    // Setup
    (cacheUtils.getCachedValue as jest.Mock).mockResolvedValue(null);
    const middleware = redisCacheMiddleware({ 
      duration: CacheDuration.MEDIUM, 
      setCacheHeaders: true 
    });
    
    // Prepare the test data
    const responseData = { test: 'data' };
    
    // Mock the original res.json function
    const originalJson = jest.fn();
    res.json = originalJson;
    
    // Execute
    await middleware(req as Request, res as Response, next);
    
    // Simulate the route handler calling res.json
    const modifiedJson = res.json as jest.Mock;
    await modifiedJson(responseData);
    
    // Assert
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('public, max-age=900'));
    expect(res.setHeader).toHaveBeenCalledWith('Expires', expect.any(String));
    expect(res.setHeader).toHaveBeenCalledWith('CDN-Cache-Control', expect.stringContaining('public, max-age=900'));
  });

  it('should handle errors gracefully', async () => {
    // Setup
    (cacheUtils.getCachedValue as jest.Mock).mockRejectedValue(new Error('Test error'));
    const errorCallback = jest.fn();
    const middleware = redisCacheMiddleware({ errorCallback });
    
    // Execute
    await middleware(req as Request, res as Response, next);
    
    // Assert
    expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
    expect(next).toHaveBeenCalled();
  });

  it('should try to serve stale content on error if configured', async () => {
    // Setup - first call errors, second call returns stale data
    (cacheUtils.getCachedValue as jest.Mock)
      .mockRejectedValueOnce(new Error('Test error'))
      .mockResolvedValueOnce({ stale: 'data' });
      
    const middleware = redisCacheMiddleware({ 
      serveStaleOnError: true,
      staleIfError: CacheDuration.SHORT
    });
    
    // Execute
    await middleware(req as Request, res as Response, next);
    
    // Assert
    expect(cacheUtils.getCachedValue).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith({ stale: 'data' });
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'STALE');
    expect(next).not.toHaveBeenCalled();
  });

  it('should not cache null values when cacheNullValues is false', async () => {
    // Setup
    (cacheUtils.getCachedValue as jest.Mock).mockResolvedValue(null);
    const middleware = redisCacheMiddleware({ cacheNullValues: false });
    
    // Prepare response mocks
    const originalJson = jest.fn();
    res.json = originalJson;
    
    // Execute
    await middleware(req as Request, res as Response, next);
    
    // Simulate the route handler returning null
    const modifiedJson = res.json as jest.Mock;
    await modifiedJson(null);
    
    // Assert
    expect(cacheUtils.setCachedValue).not.toHaveBeenCalled();
    expect(originalJson).toHaveBeenCalledWith(null);
  });
});