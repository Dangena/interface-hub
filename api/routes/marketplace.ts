import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database.js';

const router = Router();

router.get('/apis', (req: Request, res: Response) => {
  try {
    const {
      search = '',
      category,
      tags,
      sort = 'recent',
      page = '1',
      pageSize = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const pageSizeNum = Math.max(1, Math.min(100, parseInt(pageSize as string, 10) || 20));
    const offset = (pageNum - 1) * pageSizeNum;

    let where = "WHERE i.status = 'published'";
    const params: any[] = [];

    if (search) {
      where += " AND (i.name LIKE ? OR i.description LIKE ? OR i.path LIKE ?)";
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (category) {
      where += ' AND i.category = ?';
      params.push(category);
    }

    if (tags) {
      const tagList = (tags as string).split(',').map(t => t.trim()).filter(Boolean);
      for (const tag of tagList) {
        where += ' AND i.tags LIKE ?';
        params.push(`%"${tag}"%`);
      }
    }

    let orderBy = 'i.created_at DESC';
    if (sort === 'popular') {
      orderBy = 'call_count DESC';
    } else if (sort === 'name') {
      orderBy = 'i.name ASC';
    }

    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM interfaces i ${where}`
    ).get(...params) as { total: number };

    const rows = db.prepare(
      `SELECT i.*, COUNT(l.id) as call_count
       FROM interfaces i
       LEFT JOIN api_logs l ON l.interface_id = i.id
       ${where}
       GROUP BY i.id
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    ).all(...params, pageSizeNum, offset) as any[];

    const apis = rows.map(row => {
      let parsedTags: string[] = [];
      try {
        parsedTags = JSON.parse(row.tags || '[]');
      } catch {
        parsedTags = [];
      }
      return {
        id: row.id,
        name: row.name,
        path: row.path,
        method: row.method,
        description: row.description,
        category: row.category,
        tags: parsedTags,
        status: row.status,
        version: row.version,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        callCount: row.call_count,
      };
    });

    res.json({
      data: apis,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total: countRow.total,
        totalPages: Math.ceil(countRow.total / pageSizeNum),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch APIs' });
  }
});

router.get('/apis/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId as string;

    const row = db.prepare(
      `SELECT i.* FROM interfaces i WHERE i.id = ? AND i.status = 'published'`
    ).get(id) as any;

    if (!row) {
      return res.status(404).json({ error: 'API not found' });
    }

    let parsedTags: string[] = [];
    try {
      parsedTags = JSON.parse(row.tags || '[]');
    } catch {
      parsedTags = [];
    }

    const usageStats = db.prepare(
      `SELECT
         COUNT(*) as totalCalls,
         AVG(response_time) as avgResponseTime,
         SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errorCount,
         MAX(created_at) as lastCalledAt
       FROM api_logs WHERE interface_id = ?`
    ).get(id) as any;

    const relatedApis = db.prepare(
      `SELECT i.id, i.name, i.path, i.method, i.description, i.category
       FROM interfaces i
       WHERE i.category = ? AND i.id != ? AND i.status = 'published'
       LIMIT 5`
    ).all(row.category, id) as any[];

    const reviewStats = db.prepare(
      `SELECT
         COALESCE(AVG(rating), 0) as avgRating,
         COUNT(*) as reviewCount
       FROM api_reviews WHERE interface_id = ?`
    ).get(id) as { avgRating: number; reviewCount: number };

    let isFavorited = false;
    if (userId) {
      const fav = db.prepare(
        `SELECT id FROM api_favorites WHERE user_id = ? AND interface_id = ?`
      ).get(userId, id);
      isFavorited = !!fav;
    }

    res.json({
      id: row.id,
      name: row.name,
      path: row.path,
      method: row.method,
      description: row.description,
      category: row.category,
      tags: parsedTags,
      status: row.status,
      version: row.version,
      requestSchema: row.request_schema,
      responseSchema: row.response_schema,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      usageStats: {
        totalCalls: usageStats?.totalCalls || 0,
        avgResponseTime: usageStats?.avgResponseTime || 0,
        errorCount: usageStats?.errorCount || 0,
        lastCalledAt: usageStats?.lastCalledAt || null,
      },
      avgRating: Math.round(reviewStats.avgRating * 10) / 10,
      reviewCount: reviewStats.reviewCount,
      isFavorited,
      relatedApis,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch API detail' });
  }
});

router.post('/apis/:id/favorite', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const api = db.prepare(
      `SELECT id FROM interfaces WHERE id = ? AND status = 'published'`
    ).get(id);

    if (!api) {
      return res.status(404).json({ error: 'API not found' });
    }

    const existing = db.prepare(
      `SELECT id FROM api_favorites WHERE user_id = ? AND interface_id = ?`
    ).get(userId, id);

    if (existing) {
      db.prepare(
        `DELETE FROM api_favorites WHERE user_id = ? AND interface_id = ?`
      ).run(userId, id);
      res.json({ favorited: false });
    } else {
      db.prepare(
        `INSERT INTO api_favorites (id, user_id, interface_id) VALUES (?, ?, ?)`
      ).run(uuidv4(), userId, id);
      res.json({ favorited: true });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

router.get('/categories', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare(
      `SELECT category, COUNT(*) as api_count
       FROM interfaces
       WHERE status = 'published' AND category IS NOT NULL AND category != ''
       GROUP BY category
       ORDER BY api_count DESC`
    ).all() as any[];

    res.json(rows.map(row => ({
      category: row.category,
      apiCount: row.api_count,
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.get('/tags', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare(
      `SELECT tags FROM interfaces WHERE status = 'published' AND tags IS NOT NULL`
    ).all() as any[];

    const tagCounts = new Map<string, number>();
    for (const row of rows) {
      try {
        const parsed: string[] = JSON.parse(row.tags || '[]');
        for (const tag of parsed) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      } catch {
        continue;
      }
    }

    const result = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, apiCount: count }))
      .sort((a, b) => b.apiCount - a.apiCount);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

router.get('/trending', (req: Request, res: Response) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));

    const rows = db.prepare(
      `SELECT i.*, COUNT(l.id) as call_count
       FROM interfaces i
       INNER JOIN api_logs l ON l.interface_id = i.id
       WHERE i.status = 'published'
         AND l.created_at >= datetime('now', '-7 days')
       GROUP BY i.id
       ORDER BY call_count DESC
       LIMIT ?`
    ).all(limit) as any[];

    const trending = rows.map(row => {
      let parsedTags: string[] = [];
      try {
        parsedTags = JSON.parse(row.tags || '[]');
      } catch {
        parsedTags = [];
      }
      return {
        id: row.id,
        name: row.name,
        path: row.path,
        method: row.method,
        description: row.description,
        category: row.category,
        tags: parsedTags,
        callCount: row.call_count,
      };
    });

    res.json(trending);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trending APIs' });
  }
});

router.get('/recommended', (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));

    if (!userId) {
      const rows = db.prepare(
        `SELECT i.* FROM interfaces i
         WHERE i.status = 'published'
         ORDER BY i.created_at DESC
         LIMIT ?`
      ).all(limit) as any[];

      const apis = rows.map(row => {
        let parsedTags: string[] = [];
        try {
          parsedTags = JSON.parse(row.tags || '[]');
        } catch {
          parsedTags = [];
        }
        return {
          id: row.id,
          name: row.name,
          path: row.path,
          method: row.method,
          description: row.description,
          category: row.category,
          tags: parsedTags,
        };
      });

      return res.json(apis);
    }

    const userLogs = db.prepare(
      `SELECT DISTINCT l.interface_id, i.category, i.tags
       FROM api_logs l
       INNER JOIN interfaces i ON i.id = l.interface_id
       WHERE l.interface_id IN (
         SELECT interface_id FROM api_logs
         WHERE interface_id IS NOT NULL
         GROUP BY interface_id
         ORDER BY COUNT(*) DESC
         LIMIT 50
       )
       AND i.status = 'published'`
    ).all() as any[];

    const usedCategories = new Set<string>();
    const usedTags = new Set<string>();
    const usedApiIds = new Set<string>();

    for (const log of userLogs) {
      if (log.category) usedCategories.add(log.category);
      if (log.interface_id) usedApiIds.add(log.interface_id);
      try {
        const parsed: string[] = JSON.parse(log.tags || '[]');
        for (const tag of parsed) usedTags.add(tag);
      } catch {
        continue;
      }
    }

    const rows = db.prepare(
      `SELECT i.* FROM interfaces i
       WHERE i.status = 'published'`
    ).all() as any[];

    const scored = rows
      .filter(row => !usedApiIds.has(row.id))
      .map(row => {
        let score = 0;
        if (row.category && usedCategories.has(row.category)) score += 3;
        try {
          const parsed: string[] = JSON.parse(row.tags || '[]');
          for (const tag of parsed) {
            if (usedTags.has(tag)) score += 1;
          }
        } catch {
          // no score from tags
        }
        return { row, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const recommended = scored.map(({ row }) => {
      let parsedTags: string[] = [];
      try {
        parsedTags = JSON.parse(row.tags || '[]');
      } catch {
        parsedTags = [];
      }
      return {
        id: row.id,
        name: row.name,
        path: row.path,
        method: row.method,
        description: row.description,
        category: row.category,
        tags: parsedTags,
      };
    });

    res.json(recommended);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recommended APIs' });
  }
});

router.post('/apis/:id/review', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, userName, rating, comment } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be between 1 and 5' });
    }

    const api = db.prepare(
      `SELECT id FROM interfaces WHERE id = ? AND status = 'published'`
    ).get(id);

    if (!api) {
      return res.status(404).json({ error: 'API not found' });
    }

    const reviewId = uuidv4();
    const roundedRating = Math.round(rating);

    db.prepare(
      `INSERT INTO api_reviews (id, interface_id, user_id, user_name, rating, comment)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(reviewId, id, userId, userName || null, roundedRating, comment || null);

    res.status(201).json({
      id: reviewId,
      apiId: id,
      userId,
      userName: userName || null,
      rating: roundedRating,
      comment: comment || null,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

router.get('/apis/:id/reviews', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const apiReviews = db.prepare(
      `SELECT id, interface_id, user_id, user_name, rating, comment, created_at
       FROM api_reviews
       WHERE interface_id = ?
       ORDER BY created_at DESC`
    ).all(id) as any[];

    const summaryRow = db.prepare(
      `SELECT
         COUNT(*) as totalReviews,
         COALESCE(AVG(rating), 0) as avgRating,
         SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as r5,
         SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as r4,
         SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as r3,
         SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as r2,
         SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as r1
       FROM api_reviews
       WHERE interface_id = ?`
    ).get(id) as any;

    const reviewsList = apiReviews.map(r => ({
      id: r.id,
      apiId: r.interface_id,
      userId: r.user_id,
      userName: r.user_name,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.created_at,
    }));

    res.json({
      reviews: reviewsList,
      summary: {
        totalReviews: summaryRow?.totalReviews || 0,
        avgRating: Math.round((summaryRow?.avgRating || 0) * 10) / 10,
        ratingDistribution: {
          5: summaryRow?.r5 || 0,
          4: summaryRow?.r4 || 0,
          3: summaryRow?.r3 || 0,
          2: summaryRow?.r2 || 0,
          1: summaryRow?.r1 || 0,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

export default router;
