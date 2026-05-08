interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class CacheManager {
  private cache: Map<string, CacheItem<any>> = new Map();
  private defaultTTL: number = 5 * 60 * 1000;

  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data as T;
  }

  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;
    
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  invalidate(pattern: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  getStats() {
    let validCount = 0;
    let expiredCount = 0;
    const now = Date.now();

    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        expiredCount++;
        this.cache.delete(key);
      } else {
        validCount++;
      }
    }

    return {
      total: this.cache.size,
      valid: validCount,
      expired: expiredCount,
    };
  }

  setDefaultTTL(ttl: number): void {
    this.defaultTTL = ttl;
  }
}

export const cacheManager = new CacheManager();

export function createCacheMiddleware(ttl?: number) {
  return (req: any, res: any, next: any) => {
    const cacheKey = `${req.method}:${req.originalUrl}`;
    
    if (req.method === 'GET') {
      const cached = cacheManager.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
      
      const originalJson = res.json.bind(res);
      res.json = (data: any) => {
        if (res.statusCode === 200) {
          cacheManager.set(cacheKey, data, ttl);
        }
        return originalJson(data);
      };
    }
    
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      const paths = req.originalUrl.split('/').filter(Boolean);
      paths.forEach(() => cacheManager.invalidate(req.originalUrl));
    }
    
    next();
  };
}

export function withCache<T extends (...args: any[]) => any>(
  fn: T,
  getCacheKey: (...args: Parameters<T>) => string,
  ttl?: number
): T {
  return ((...args: Parameters<T>) => {
    const cacheKey = getCacheKey(...args);
    const cached = cacheManager.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    const result = fn(...args);
    
    if (result instanceof Promise) {
      return result.then((data: any) => {
        cacheManager.set(cacheKey, data, ttl);
        return data;
      });
    }
    
    cacheManager.set(cacheKey, result, ttl);
    return result;
  }) as T;
}
