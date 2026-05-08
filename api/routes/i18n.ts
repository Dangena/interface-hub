import { Router, type Request, type Response } from 'express';
import db from '../database.js';
import { randomUUID } from 'crypto';

const router = Router();

type TranslationValue = string | { [key: string]: TranslationValue };
type Translations = Record<string, TranslationValue>;

const builtinLocales: Record<string, Translations> = {
  'zh-CN': {
    common: {
      save: '保存',
      cancel: '取消',
      delete: '删除',
      edit: '编辑',
      create: '创建',
      search: '搜索',
      filter: '筛选',
      export: '导出',
      import: '导入',
      confirm: '确认',
      back: '返回',
      next: '下一步',
      loading: '加载中...',
      noData: '暂无数据',
      success: '操作成功',
      error: '操作失败',
      warning: '警告',
    },
    nav: {
      dashboard: '仪表盘',
      interfaces: '接口管理',
      models: '数据模型',
      graph: '关系图谱',
      mock: 'Mock服务',
      testing: '接口测试',
      import: '导入',
      parser: '解析器',
      docs: '文档生成',
      settings: '系统设置',
      projects: '项目管理',
      team: '团队管理',
      approvals: '审批中心',
      tracing: '链路追踪',
      cicd: 'CI/CD',
      dataSimulator: '数据模拟',
      dataSource: '数据源',
      projectParser: '项目解析',
    },
    interface: {
      list: '接口列表',
      create: '创建接口',
      detail: '接口详情',
      edit: '编辑接口',
      method: '请求方法',
      path: '请求路径',
      status: '状态',
      category: '分类',
      version: '版本',
    },
    model: {
      list: '模型列表',
      create: '创建模型',
      detail: '模型详情',
      fields: '字段定义',
      mappings: '映射配置',
    },
  },
  'en-US': {
    common: {
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      create: 'Create',
      search: 'Search',
      filter: 'Filter',
      export: 'Export',
      import: 'Import',
      confirm: 'Confirm',
      back: 'Back',
      next: 'Next',
      loading: 'Loading...',
      noData: 'No Data',
      success: 'Success',
      error: 'Error',
      warning: 'Warning',
    },
    nav: {
      dashboard: 'Dashboard',
      interfaces: 'Interfaces',
      models: 'Models',
      graph: 'Graph',
      mock: 'Mock',
      testing: 'Testing',
      import: 'Import',
      parser: 'Parser',
      docs: 'Docs',
      settings: 'Settings',
      projects: 'Projects',
      team: 'Team',
      approvals: 'Approvals',
      tracing: 'Tracing',
      cicd: 'CI/CD',
      dataSimulator: 'Data Simulator',
      dataSource: 'Data Source',
      projectParser: 'Project Parser',
    },
    interface: {
      list: 'Interface List',
      create: 'Create Interface',
      detail: 'Interface Detail',
      edit: 'Edit Interface',
      method: 'Method',
      path: 'Path',
      status: 'Status',
      category: 'Category',
      version: 'Version',
    },
    model: {
      list: 'Model List',
      create: 'Create Model',
      detail: 'Model Detail',
      fields: 'Fields',
      mappings: 'Mappings',
    },
  },
  'ja-JP': {
    common: {
      save: '保存',
      cancel: 'キャンセル',
      delete: '削除',
      edit: '編集',
      create: '作成',
      search: '検索',
      filter: 'フィルター',
      export: 'エクスポート',
      import: 'インポート',
      confirm: '確認',
      back: '戻る',
      next: '次へ',
      loading: '読み込み中...',
      noData: 'データなし',
      success: '成功',
      error: 'エラー',
      warning: '警告',
    },
    nav: {
      dashboard: 'ダッシュボード',
      interfaces: 'インターフェース',
      models: 'データモデル',
      graph: '関係グラフ',
      mock: 'モック',
      testing: 'テスト',
      import: 'インポート',
      parser: 'パーサー',
      docs: 'ドキュメント',
      settings: '設定',
      projects: 'プロジェクト',
      team: 'チーム',
      approvals: '承認',
      tracing: 'トレーシング',
      cicd: 'CI/CD',
      dataSimulator: 'データシミュレーター',
      dataSource: 'データソース',
      projectParser: 'プロジェクトパーサー',
    },
    interface: {
      list: 'インターフェース一覧',
      create: 'インターフェース作成',
      detail: 'インターフェース詳細',
      edit: 'インターフェース編集',
      method: 'メソッド',
      path: 'パス',
      status: 'ステータス',
      category: 'カテゴリ',
      version: 'バージョン',
    },
    model: {
      list: 'モデル一覧',
      create: 'モデル作成',
      detail: 'モデル詳細',
      fields: 'フィールド',
      mappings: 'マッピング',
    },
  },
  'ko-KR': {
    common: {
      save: '저장',
      cancel: '취소',
      delete: '삭제',
      edit: '편집',
      create: '생성',
      search: '검색',
      filter: '필터',
      export: '내보내기',
      import: '가져오기',
      confirm: '확인',
      back: '뒤로',
      next: '다음',
      loading: '로딩 중...',
      noData: '데이터 없음',
      success: '성공',
      error: '오류',
      warning: '경고',
    },
    nav: {
      dashboard: '대시보드',
      interfaces: '인터페이스',
      models: '데이터 모델',
      graph: '관계 그래프',
      mock: 'Mock',
      testing: '테스트',
      import: '가져오기',
      parser: '파서',
      docs: '문서',
      settings: '설정',
      projects: '프로젝트',
      team: '팀',
      approvals: '승인',
      tracing: '트레이싱',
      cicd: 'CI/CD',
      dataSimulator: '데이터 시뮬레이터',
      dataSource: '데이터 소스',
      projectParser: '프로젝트 파서',
    },
    interface: {
      list: '인터페이스 목록',
      create: '인터페이스 생성',
      detail: '인터페이스 상세',
      edit: '인터페이스 편집',
      method: '메서드',
      path: '경로',
      status: '상태',
      category: '카테고리',
      version: '버전',
    },
    model: {
      list: '모델 목록',
      create: '모델 생성',
      detail: '모델 상세',
      fields: '필드',
      mappings: '매핑',
    },
  },
};

function deepMerge(base: Translations, override: Translations): Translations {
  const result: Translations = { ...base };
  for (const key of Object.keys(override)) {
    if (
      typeof override[key] === 'object' &&
      override[key] !== null &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object' &&
      base[key] !== null &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key] as Translations, override[key] as Translations);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

function flattenTranslations(obj: Translations, prefix: string = ''): Array<{ namespace: string; key: string; value: string }> {
  const rows: Array<{ namespace: string; key: string; value: string }> = [];
  for (const ns of Object.keys(obj)) {
    const nsObj = obj[ns];
    if (typeof nsObj === 'object' && nsObj !== null && !Array.isArray(nsObj)) {
      for (const k of Object.keys(nsObj)) {
        const val = nsObj[k];
        if (typeof val === 'string') {
          rows.push({ namespace: ns, key: k, value: val });
        } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          const nested = flattenTranslations(val as Translations, k);
          for (const n of nested) {
            rows.push({ namespace: ns, key: `${k}.${n.key}`, value: n.value });
          }
        }
      }
    }
  }
  return rows;
}

function buildTranslationsFromRows(rows: Array<{ namespace: string; key: string; value: string }>): Translations {
  const result: Translations = {};
  for (const row of rows) {
    if (!result[row.namespace]) {
      result[row.namespace] = {};
    }
    const parts = row.key.split('.');
    let current: TranslationValue = result[row.namespace];
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
        if (!(parts[i] in (current as Record<string, TranslationValue>))) {
          (current as Record<string, TranslationValue>)[parts[i]] = {};
        }
        current = (current as Record<string, TranslationValue>)[parts[i]];
      }
    }
    if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
      (current as Record<string, TranslationValue>)[parts[parts.length - 1]] = row.value;
    }
  }
  return result;
}

function getDbOverrides(locale: string): Translations {
  const rows = db.prepare(
    'SELECT namespace, key, value FROM i18n_translations WHERE locale = ?'
  ).all(locale) as Array<{ namespace: string; key: string; value: string }>;
  return buildTranslationsFromRows(rows);
}

function getTranslations(locale: string): Translations | null {
  const builtin = builtinLocales[locale];
  const dbOverrides = getDbOverrides(locale);
  if (!builtin && Object.keys(dbOverrides).length === 0) return null;
  if (!builtin) return dbOverrides;
  if (Object.keys(dbOverrides).length > 0) {
    return deepMerge(builtin, dbOverrides);
  }
  return { ...builtin };
}

function collectKeys(obj: Translations, prefix: string = ''): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys.push(...collectKeys(obj[key] as Translations, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

router.get('/locales', (req: Request, res: Response): void => {
  const builtinCodes = Object.keys(builtinLocales);
  const customRows = db.prepare(
    'SELECT DISTINCT locale FROM i18n_translations'
  ).all() as Array<{ locale: string }>;
  const customCodes = customRows.map((r) => r.locale).filter((c) => !builtinCodes.includes(c));
  const allCodes = [...builtinCodes, ...customCodes];
  const locales = allCodes.map((code) => ({
    code,
    name: getLocaleName(code),
  }));
  res.json({ locales });
});

router.get('/locales/:locale', (req: Request, res: Response): void => {
  const { locale } = req.params;
  const translations = getTranslations(locale);
  if (!translations) {
    res.status(404).json({ error: `Locale '${locale}' not found` });
    return;
  }
  res.json({ locale, translations });
});

router.post('/locales', (req: Request, res: Response): void => {
  const { locale, translations } = req.body;
  if (!locale || !translations || typeof translations !== 'object') {
    res.status(400).json({ error: 'locale and translations are required' });
    return;
  }
  const rows = flattenTranslations(translations);
  const upsert = db.prepare(`
    INSERT INTO i18n_translations (id, locale, namespace, key, value, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(locale, namespace, key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `);
  const transaction = db.transaction(() => {
    for (const row of rows) {
      upsert.run(randomUUID(), locale, row.namespace, row.key, row.value);
    }
  });
  transaction();
  const result = getTranslations(locale);
  res.json({ locale, translations: result });
});

router.get('/detect', (req: Request, res: Response): void => {
  const acceptLanguage = req.headers['accept-language'] || '';
  const builtinCodes = Object.keys(builtinLocales);
  const customRows = db.prepare(
    'SELECT DISTINCT locale FROM i18n_translations'
  ).all() as Array<{ locale: string }>;
  const customCodes = customRows.map((r) => r.locale);
  const supportedLocales = [...builtinCodes, ...customCodes];
  const parsed = parseAcceptLanguage(acceptLanguage);
  let detected = 'en-US';
  for (const { locale } of parsed) {
    const exact = supportedLocales.find((s) => s.toLowerCase() === locale.toLowerCase());
    if (exact) {
      detected = exact;
      break;
    }
    const lang = locale.split('-')[0].toLowerCase();
    const partial = supportedLocales.find((s) => s.toLowerCase().startsWith(lang));
    if (partial) {
      detected = partial;
      break;
    }
  }
  res.json({ locale: detected, supportedLocales });
});

router.get('/locales/:locale/missing', (req: Request, res: Response): void => {
  const { locale } = req.params;
  if (locale === 'zh-CN') {
    res.json({ locale, missingKeys: [] });
    return;
  }
  const targetTranslations = getTranslations(locale);
  if (!targetTranslations) {
    res.status(404).json({ error: `Locale '${locale}' not found` });
    return;
  }
  const baseTranslations = builtinLocales['zh-CN'];
  const baseKeys = new Set(collectKeys(baseTranslations));
  const targetKeys = new Set(collectKeys(targetTranslations));
  const missingKeys: string[] = [];
  for (const key of baseKeys) {
    if (!targetKeys.has(key)) {
      missingKeys.push(key);
    }
  }
  res.json({ locale, missingKeys });
});

function parseAcceptLanguage(header: string): Array<{ locale: string; quality: number }> {
  return header
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [locale, qPart] = part.split(';');
      let quality = 1.0;
      if (qPart) {
        const match = qPart.match(/q\s*=\s*([\d.]+)/);
        if (match) {
          quality = parseFloat(match[1]);
        }
      }
      return { locale: locale.trim(), quality };
    })
    .sort((a, b) => b.quality - a.quality);
}

function getLocaleName(code: string): string {
  const names: Record<string, string> = {
    'zh-CN': '简体中文',
    'en-US': 'English',
    'ja-JP': '日本語',
    'ko-KR': '한국어',
  };
  return names[code] || code;
}

export default router;
