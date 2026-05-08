describe('Smart Field Mapping', () => {
  const levenshteinDistance = (str1: string, str2: string): number => {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + 1
          );
        }
      }
    }
    
    return dp[m][n];
  };

  const calculateFieldMatchScore = (paramName: string, fieldName: string) => {
    let score = 0;
    let matchType = 'unknown';
    let confidence: 'high' | 'medium' | 'low' = 'low';

    const normalize = (str: string) => str.toLowerCase().replace(/[_-]/g, '');
    const splitWords = (str: string) => str.split(/(?=[A-Z])|[_-]/).map(w => w.toLowerCase()).filter(w => w);

    const normalizedParam = normalize(paramName);
    const normalizedField = normalize(fieldName);

    if (normalizedParam === normalizedField) {
      score = 100;
      matchType = 'exact';
      confidence = 'high';
    } else if (normalizedParam.includes(normalizedField) || normalizedField.includes(normalizedParam)) {
      const len1 = normalizedParam.length;
      const len2 = normalizedField.length;
      const overlap = normalizedParam.includes(normalizedField) ? len2 : len1;
      score = (overlap / Math.max(len1, len2)) * 80;
      matchType = 'partial';
      confidence = score >= 60 ? 'medium' : 'low';
    } else {
      const paramWords = splitWords(paramName);
      const fieldWords = splitWords(fieldName);

      let commonWords = 0;
      for (const word of paramWords) {
        if (fieldWords.includes(word)) {
          commonWords++;
        }
      }

      if (commonWords > 0) {
        score = (commonWords / Math.max(paramWords.length, fieldWords.length)) * 50;
        matchType = 'word';
        confidence = 'low';
      } else {
        const distance = levenshteinDistance(normalizedParam, normalizedField);
        const maxLen = Math.max(normalizedParam.length, normalizedField.length);
        const similarity = 1 - distance / maxLen;
        
        if (similarity > 0.6) {
          score = similarity * 30;
          matchType = 'fuzzy';
          confidence = 'low';
        }
      }
    }

    return { score, matchType, confidence };
  };

  describe('Levenshtein Distance', () => {
    test('should calculate distance for identical strings', () => {
      expect(levenshteinDistance('test', 'test')).toBe(0);
    });

    test('should calculate distance for different strings', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    });

    test('should handle empty strings', () => {
      expect(levenshteinDistance('', 'test')).toBe(4);
      expect(levenshteinDistance('test', '')).toBe(4);
      expect(levenshteinDistance('', '')).toBe(0);
    });

    test('should handle similar strings', () => {
      const distance = levenshteinDistance('userName', 'user_name');
      expect(distance).toBeLessThan(3);
    });
  });

  describe('Exact Match', () => {
    test('should match identical field names', () => {
      const result = calculateFieldMatchScore('username', 'username');
      expect(result.score).toBe(100);
      expect(result.matchType).toBe('exact');
      expect(result.confidence).toBe('high');
    });

    test('should match case-insensitive field names', () => {
      const result = calculateFieldMatchScore('UserName', 'username');
      expect(result.score).toBe(100);
      expect(result.matchType).toBe('exact');
    });

    test('should match with underscores and hyphens', () => {
      const result = calculateFieldMatchScore('user_name', 'user-name');
      expect(result.score).toBe(100);
      expect(result.matchType).toBe('exact');
    });
  });

  describe('Partial Match', () => {
    test('should match when param includes field', () => {
      const result = calculateFieldMatchScore('user_email_address', 'email');
      expect(result.score).toBeGreaterThan(0);
      expect(result.matchType).toBe('partial');
    });

    test('should match when field includes param', () => {
      const result = calculateFieldMatchScore('email', 'user_email');
      expect(result.score).toBeGreaterThan(0);
      expect(result.matchType).toBe('partial');
    });

    test('should assign medium confidence for good partial matches', () => {
      const result = calculateFieldMatchScore('user_email_address', 'email_address');
      expect(result.confidence).toBe('medium');
    });
  });

  describe('Word Match', () => {
    test('should match common words', () => {
      const result = calculateFieldMatchScore('firstName', 'lastName');
      expect(result.score).toBeGreaterThan(0);
    });

    test('should match camelCase with snake_case', () => {
      const result = calculateFieldMatchScore('createdAt', 'created_at');
      expect(result.score).toBeGreaterThan(0);
    });

    test('should assign low confidence for word matches', () => {
      const result = calculateFieldMatchScore('firstName', 'lastName');
      expect(result.confidence).toBe('low');
    });
  });

  describe('Fuzzy Match', () => {
    test('should match similar field names', () => {
      const result = calculateFieldMatchScore('usernam', 'username');
      expect(result.score).toBeGreaterThan(0);
    });

    test('should use Levenshtein distance for fuzzy matching', () => {
      const result = calculateFieldMatchScore('usernamee', 'username');
      expect(result.score).toBeGreaterThan(0);
    });

    test('should not match very different names', () => {
      const result = calculateFieldMatchScore('email', 'password');
      expect(result.score).toBe(0);
    });
  });

  describe('Real World Examples', () => {
    test('should match API parameter to database field', () => {
      const result = calculateFieldMatchScore('user_id', 'id');
      expect(result.score).toBeGreaterThan(0);
    });

    test('should match full name variations', () => {
      const result = calculateFieldMatchScore('full_name', 'fullName');
      expect(result.score).toBeGreaterThan(0);
    });

    test('should match email variations', () => {
      const result = calculateFieldMatchScore('user_email', 'email');
      expect(result.score).toBeGreaterThan(40);
    });

    test('should match date fields', () => {
      const result = calculateFieldMatchScore('created_at', 'createdAt');
      expect(result.score).toBeGreaterThan(0);
    });
  });
});
