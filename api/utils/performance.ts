interface PerformanceMetric {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics: number = 1000;

  record(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  getMetrics(path?: string, method?: string): PerformanceMetric[] {
    let filtered = this.metrics;
    
    if (path) {
      filtered = filtered.filter(m => m.path.includes(path));
    }
    
    if (method) {
      filtered = filtered.filter(m => m.method === method);
    }
    
    return filtered;
  }

  getStats(path?: string) {
    const metrics = this.getMetrics(path);
    
    if (metrics.length === 0) {
      return {
        count: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        successRate: 0,
      };
    }

    const durations = metrics.map(m => m.duration);
    const successful = metrics.filter(m => m.statusCode >= 200 && m.statusCode < 400);

    return {
      count: metrics.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: (successful.length / metrics.length) * 100,
    };
  }

  getSlowestEndpoints(limit: number = 10) {
    const pathStats: Record<string, { total: number; count: number; avg: number }> = {};
    
    for (const metric of this.metrics) {
      if (!pathStats[metric.path]) {
        pathStats[metric.path] = { total: 0, count: 0, avg: 0 };
      }
      pathStats[metric.path].total += metric.duration;
      pathStats[metric.path].count++;
    }
    
    for (const path in pathStats) {
      pathStats[path].avg = pathStats[path].total / pathStats[path].count;
    }
    
    return Object.entries(pathStats)
      .sort((a, b) => b[1].avg - a[1].avg)
      .slice(0, limit)
      .map(([path, stats]) => ({
        path,
        avgDuration: stats.avg,
        count: stats.count,
      }));
  }

  clear(): void {
    this.metrics = [];
  }

  getSummary() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const recentMetrics = this.metrics.filter(m => m.timestamp > oneHourAgo);
    
    return {
      totalMetrics: this.metrics.length,
      lastHourMetrics: recentMetrics.length,
      slowestEndpoints: this.getSlowestEndpoints(5),
      overallStats: this.getStats(),
    };
  }
}

export const performanceMonitor = new PerformanceMonitor();

export function performanceMiddleware(req: any, res: any, next: any) {
  const startTime = Date.now();
  
  const originalSend = res.send.bind(res);
  res.send = function(data: any) {
    const duration = Date.now() - startTime;
    
    performanceMonitor.record({
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      timestamp: Date.now(),
    });
    
    return originalSend(data);
  };
  
  next();
}

export function getCacheStats() {
  return performanceMonitor.getSummary();
}
