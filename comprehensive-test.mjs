const BASE = 'http://localhost:3001/api';
let TOKEN = '';
let USER_ID = '';
let ADMIN_TOKEN = '';
let ADMIN_ID = '';
let results = { passed: 0, failed: 0, errors: [] };

function assert(condition, testName, detail) {
  if (condition) {
    results.passed++;
    console.log('  ✅ ' + testName);
  } else {
    results.failed++;
    const msg = '  ❌ ' + testName + (detail ? ' - ' + detail : '');
    results.errors.push(msg);
    console.log(msg);
  }
}

async function api(method, path, body, headers) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const authH = () => ({ Authorization: 'Bearer ' + TOKEN });
const adminH = () => ({ Authorization: 'Bearer ' + ADMIN_TOKEN });

async function testAuth() {
  console.log('\n=== 1. 认证模块 ===');
  
  // Register admin first, then promote, then login to get proper JWT
  const adminReg = await api('POST', '/auth/register', {
    email: 'admin_' + Date.now() + '@example.com', name: 'AdminUser', password: 'admin123456',
  });
  assert(adminReg.status === 201, '注册管理员用户', 'status=' + adminReg.status);
  ADMIN_ID = adminReg.data.user?.id || '';
  
  // Promote admin via direct DB
  if (ADMIN_ID) {
    const { Pool } = await import('pg');
    const pool = new Pool({ host: 'localhost', port: 5432, database: 'interfacehub', user: 'interfacehub', password: 'interfacehub123' });
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [ADMIN_ID]);
    pool.end();
  }
  
  // Login as admin to get JWT with admin role
  const adminLogin = await api('POST', '/auth/login', { email: adminReg.data.user?.email, password: 'admin123456' });
  assert(adminLogin.status === 200 && adminLogin.data.token, '管理员登录', 'status=' + adminLogin.status);
  ADMIN_TOKEN = adminLogin.data.token;

  // Register normal user
  const reg = await api('POST', '/auth/register', {
    email: 'test_' + Date.now() + '@example.com', name: 'TestUser', password: 'test123456',
  });
  assert(reg.status === 201, '注册新用户', 'status=' + reg.status);
  if (reg.data.token) { TOKEN = reg.data.token; USER_ID = reg.data.user?.id || ''; }

  const regDup = await api('POST', '/auth/register', {
    email: 'test_' + Date.now() + '@example.com', name: 'TestUser', password: '123',
  });
  assert(regDup.status === 400, '注册-密码太短拒绝', 'status=' + regDup.status);

  const login = await api('POST', '/auth/login', { email: 'nonexist@example.com', password: 'nonexist' });
  assert(login.status === 401, '登录-错误凭据拒绝', 'status=' + login.status);

  const loginOk = await api('POST', '/auth/login', { email: reg.data.user?.email, password: 'test123456' });
  assert(loginOk.status === 200 && loginOk.data.token, '登录-正确凭据成功', 'status=' + loginOk.status);
  if (loginOk.data.token) TOKEN = loginOk.data.token;

  const me = await api('GET', '/auth/me', undefined, authH());
  assert(me.status === 200 && me.data.user, '获取当前用户信息', 'status=' + me.status);

  const meNoToken = await api('GET', '/auth/me');
  assert(meNoToken.status === 401, '无token访问受保护接口拒绝', 'status=' + meNoToken.status);

  const profile = await api('PUT', '/auth/profile', { name: 'UpdatedUser' }, authH());
  assert(profile.status === 200, '更新用户资料', 'status=' + profile.status);

  const changePw = await api('PUT', '/auth/change-password', { currentPassword: 'wrong', newPassword: 'newpass123' }, authH());
  assert(changePw.status === 401, '修改密码-旧密码错误拒绝', 'status=' + changePw.status);

  const changePwOk = await api('PUT', '/auth/change-password', { currentPassword: 'test123456', newPassword: 'test123456' }, authH());
  assert(changePwOk.status === 200, '修改密码-正确旧密码成功', 'status=' + changePwOk.status);

  const logout = await api('POST', '/auth/logout');
  assert(logout.status === 200, '登出成功', 'status=' + logout.status);
}

let createdInterfaceId = '';
async function testInterfaces() {
  console.log('\n=== 2. 接口管理模块 ===');

  const create = await api('POST', '/interfaces', {
    name: '测试用户API', path: '/api/test-users', method: 'GET',
    description: '获取测试用户列表', category: '用户管理',
    tags: ['用户', '列表'], status: 'published', version: '1.0.0',
    requestSchema: { type: 'object', properties: { page: { type: 'integer' } } },
    responseSchema: { type: 'object', properties: { data: { type: 'array' } } },
    parameters: [
      { name: 'page', location: 'query', type: 'integer', required: true, description: '页码', example: '1' },
      { name: 'limit', location: 'query', type: 'integer', required: false, description: '每页数量', example: '20' },
    ],
    createdBy: 'test',
  });
  assert(create.status === 201 && create.data.id, '创建接口', 'status=' + create.status);
  createdInterfaceId = create.data.id;

  const list = await api('GET', '/interfaces');
  assert(list.status === 200 && Array.isArray(list.data.data), '获取接口列表', 'status=' + list.status);

  const listFilter = await api('GET', '/interfaces?status=published&limit=5');
  assert(listFilter.status === 200, '接口列表-筛选', 'status=' + listFilter.status);

  const listSearch = await api('GET', '/interfaces?search=用户');
  assert(listSearch.status === 200, '接口列表-搜索', 'status=' + listSearch.status);

  const detail = await api('GET', '/interfaces/' + createdInterfaceId);
  assert(detail.status === 200 && detail.data.name === '测试用户API', '获取接口详情', 'status=' + detail.status);

  const detailParams = detail.data.parameters;
  assert(Array.isArray(detailParams) && detailParams.length === 2, '接口详情包含参数', 'params=' + (detailParams?.length || 0));

  const update = await api('PUT', '/interfaces/' + createdInterfaceId, {
    name: '测试用户API-V2', description: '获取测试用户列表V2', tags: ['用户', '列表', 'V2'],
  });
  assert(update.status === 200 && update.data.name === '测试用户API-V2', '更新接口', 'status=' + update.status);

  const addParam = await api('POST', '/interfaces/' + createdInterfaceId + '/parameters', {
    name: 'sort', location: 'query', type: 'string', required: false, description: '排序字段', example: 'name',
  });
  assert(addParam.status === 201, '添加参数', 'status=' + addParam.status);

  const history = await api('GET', '/interfaces/' + createdInterfaceId + '/history');
  assert(history.status === 200, '获取变更历史', 'status=' + history.status);

  const version = await api('POST', '/interfaces/' + createdInterfaceId + '/versions', { description: 'V2版本快照', operator: 'test' });
  assert(version.status === 201, '创建版本快照', 'status=' + version.status);

  const versions = await api('GET', '/interfaces/' + createdInterfaceId + '/versions');
  assert(versions.status === 200 && Array.isArray(versions.data), '获取版本列表', 'status=' + versions.status);

  const notFound = await api('GET', '/interfaces/nonexistent-id');
  assert(notFound.status === 404, '获取不存在的接口返回404', 'status=' + notFound.status);
}

let createdModelName = '';
async function testModels() {
  console.log('\n=== 3. 数据模型模块 ===');

  const create = await api('POST', '/models', {
    name: 'UserModel', tableName: 'users', description: '用户数据模型',
    fields: [
      { name: 'id', columnName: 'id', type: 'integer', nullable: false, primaryKey: true, comment: '主键' },
      { name: 'name', columnName: 'name', type: 'varchar', nullable: false, primaryKey: false, comment: '姓名' },
      { name: 'email', columnName: 'email', type: 'varchar', nullable: false, primaryKey: false, comment: '邮箱' },
      { name: 'age', columnName: 'age', type: 'integer', nullable: true, primaryKey: false, comment: '年龄' },
    ],
  });
  assert(create.status === 201 && create.data.fields?.length === 4, '创建数据模型', 'status=' + create.status);
  createdModelName = 'UserModel';

  const dup = await api('POST', '/models', { name: 'UserModel', tableName: 'users', description: '' });
  assert(dup.status === 400, '创建重复模型拒绝', 'status=' + dup.status);

  const list = await api('GET', '/models');
  assert(list.status === 200 && Array.isArray(list.data), '获取模型列表', 'status=' + list.status);

  const detail = await api('GET', '/models/' + createdModelName);
  assert(detail.status === 200 && detail.data.fields?.length === 4, '获取模型详情', 'status=' + detail.status);

  const update = await api('PUT', '/models/' + createdModelName, {
    tableName: 'users', description: '用户数据模型V2',
    fields: [
      { name: 'id', columnName: 'id', type: 'integer', nullable: false, primaryKey: true, comment: '主键' },
      { name: 'name', columnName: 'name', type: 'varchar', nullable: false, primaryKey: false, comment: '姓名' },
      { name: 'email', columnName: 'email', type: 'varchar', nullable: false, primaryKey: false, comment: '邮箱' },
      { name: 'phone', columnName: 'phone', type: 'varchar', nullable: true, primaryKey: false, comment: '手机号' },
    ],
  });
  assert(update.status === 200 && update.data.fields?.length === 4, '更新模型', 'status=' + update.status);

  const notFound = await api('GET', '/models/NonExistent');
  assert(notFound.status === 404, '获取不存在的模型返回404', 'status=' + notFound.status);
}

async function testProjects() {
  console.log('\n=== 4. 项目管理模块 ===');
  const create = await api('POST', '/projects', { name: '测试项目', description: '用于测试的项目', color: '#FF5733' });
  assert(create.status === 201 && create.data.id, '创建项目', 'status=' + create.status);
  const projectId = create.data.id;

  const list = await api('GET', '/projects');
  assert(list.status === 200 && Array.isArray(list.data), '获取项目列表', 'status=' + list.status);

  const update = await api('PUT', '/projects/' + projectId, { name: '测试项目V2', description: '更新后的项目' });
  assert(update.status === 200, '更新项目', 'status=' + update.status);

  const del = await api('DELETE', '/projects/' + projectId);
  assert(del.status === 200, '删除项目', 'status=' + del.status);

  const delAgain = await api('DELETE', '/projects/' + projectId);
  assert(delAgain.status === 404, '删除不存在的项目返回404', 'status=' + delAgain.status);
}

async function testMockServer() {
  console.log('\n=== 5. Mock服务模块 ===');
  const create = await api('POST', '/mock', {
    interfaceId: createdInterfaceId, path: '/api/mock-test', method: 'GET',
    statusCode: 200, delay: 0, responseConfig: { message: 'Hello Mock', data: { id: 1, name: 'Test' } }, enabled: true,
  });
  assert(create.status === 201 && create.data.id, '创建Mock配置', 'status=' + create.status);
  const mockId = create.data.id;

  const list = await api('GET', '/mock');
  assert(list.status === 200 && Array.isArray(list.data), '获取Mock列表', 'status=' + list.status);

  const update = await api('PUT', '/mock/' + mockId, {
    path: '/api/mock-test', method: 'GET', statusCode: 200, delay: 100, responseConfig: { message: 'Updated Mock' }, enabled: true,
  });
  assert(update.status === 200, '更新Mock配置', 'status=' + update.status);

  const proxy = await api('GET', '/mock/proxy/api/mock-test');
  assert(proxy.status === 200 && proxy.data?.message === 'Updated Mock', 'Mock代理请求', 'status=' + proxy.status);

  const generate = await api('POST', '/mock/generate', { interfaceId: createdInterfaceId, count: 3 });
  assert(generate.status === 200, 'Mock数据生成-基于接口', 'status=' + generate.status);

  const generateModel = await api('POST', '/mock/generate-from-model', { modelName: createdModelName, count: 5 });
  assert(generateModel.status === 200 && generateModel.data?.generated?.length === 5, 'Mock数据生成-基于模型', 'status=' + generateModel.status);

  const del = await api('DELETE', '/mock/' + mockId);
  assert(del.status === 200, '删除Mock配置', 'status=' + del.status);
}

async function testEnvironments() {
  console.log('\n=== 6. 环境管理模块 ===');
  const create = await api('POST', '/environments', {
    name: '开发环境', type: 'dev', baseUrl: 'http://localhost:3001',
    variables: { API_KEY: 'dev-key-123' }, headers: { 'X-Env': 'dev' }, authType: 'bearer', authConfig: { token: 'dev-token' },
  });
  assert(create.status === 201 && create.data.id, '创建环境', 'status=' + create.status);
  const envId = create.data.id;

  const list = await api('GET', '/environments');
  assert(list.status === 200 && Array.isArray(list.data), '获取环境列表', 'status=' + list.status);

  const update = await api('PUT', '/environments/' + envId, { name: '开发环境V2', variables: { API_KEY: 'new-key' } });
  assert(update.status === 200, '更新环境', 'status=' + update.status);

  const clone = await api('POST', '/environments/' + envId + '/clone');
  assert(clone.status === 201 && clone.data.id !== envId, '克隆环境', 'status=' + clone.status);

  const switchEnv = await api('POST', '/environments/' + envId + '/switch');
  assert(switchEnv.status === 200, '切换环境', 'status=' + switchEnv.status);

  const active = await api('GET', '/environments/active');
  assert(active.status === 200, '获取当前环境', 'status=' + active.status);

  const testConn = await api('GET', '/environments/' + envId + '/test');
  assert(testConn.status === 200, '测试环境连接', 'status=' + testConn.status);

  const invalidType = await api('POST', '/environments', { name: 'X', type: 'invalid' });
  assert(invalidType.status === 400, '创建环境-无效类型拒绝', 'status=' + invalidType.status);

  const del = await api('DELETE', '/environments/' + envId);
  assert(del.status === 200, '删除环境', 'status=' + del.status);
}

async function testMonitoring() {
  console.log('\n=== 7. 监控模块 ===');
  const health = await api('GET', '/monitoring/health');
  assert(health.status === 200 && health.data.status === 'healthy', '健康检查', 'status=' + health.status);

  const metrics = await api('GET', '/monitoring/metrics');
  assert(metrics.status === 200 && metrics.data.totalRequests !== undefined, '获取指标', 'status=' + metrics.status);

  const dashboard = await api('GET', '/monitoring/dashboard');
  assert(dashboard.status === 200 && dashboard.data.health && dashboard.data.metrics, '监控仪表盘', 'status=' + dashboard.status);

  const alertCreate = await api('POST', '/monitoring/alerts', { name: '高响应时间告警', type: 'response_time', threshold: 5000, window: 5, enabled: true });
  assert(alertCreate.status === 201 && alertCreate.data.id, '创建告警规则', 'status=' + alertCreate.status);
  const alertId = alertCreate.data.id;

  const alertList = await api('GET', '/monitoring/alerts');
  assert(alertList.status === 200 && Array.isArray(alertList.data), '获取告警规则列表', 'status=' + alertList.status);

  const alertCheck = await api('POST', '/monitoring/alerts/check');
  assert(alertCheck.status === 200, '检查告警', 'status=' + alertCheck.status);

  const alertHistory = await api('GET', '/monitoring/alerts/' + alertId + '/history');
  assert(alertHistory.status === 200, '获取告警历史', 'status=' + alertHistory.status);

  const alertUpdate = await api('PUT', '/monitoring/alerts/' + alertId, { threshold: 10000 });
  assert(alertUpdate.status === 200, '更新告警规则', 'status=' + alertUpdate.status);

  const alertDel = await api('DELETE', '/monitoring/alerts/' + alertId);
  assert(alertDel.status === 200, '删除告警规则', 'status=' + alertDel.status);

  const endpoints = await api('GET', '/monitoring/metrics/endpoints');
  assert(endpoints.status === 200, '获取端点指标', 'status=' + endpoints.status);

  const timeline = await api('GET', '/monitoring/metrics/timeline');
  assert(timeline.status === 200, '获取时间线指标', 'status=' + timeline.status);
}

async function testMarketplace() {
  console.log('\n=== 8. API市场模块 ===');
  const apis = await api('GET', '/marketplace/apis');
  assert(apis.status === 200, '获取市场API列表', 'status=' + apis.status);

  const categories = await api('GET', '/marketplace/categories');
  assert(categories.status === 200, '获取市场分类', 'status=' + categories.status);

  const tags = await api('GET', '/marketplace/tags');
  assert(tags.status === 200, '获取市场标签', 'status=' + tags.status);

  const trending = await api('GET', '/marketplace/trending');
  assert(trending.status === 200, '获取热门API', 'status=' + trending.status);

  const recommended = await api('GET', '/marketplace/recommended');
  assert(recommended.status === 200, '获取推荐API', 'status=' + recommended.status);

  if (createdInterfaceId) {
    const detail = await api('GET', '/marketplace/apis/' + createdInterfaceId);
    assert(detail.status === 200, '获取市场API详情', 'status=' + detail.status);

    const favorite = await api('POST', '/marketplace/apis/' + createdInterfaceId + '/favorite', { userId: USER_ID });
    assert(favorite.status === 200, '收藏API', 'status=' + favorite.status);

    const unfavorite = await api('POST', '/marketplace/apis/' + createdInterfaceId + '/favorite', { userId: USER_ID });
    assert(unfavorite.status === 200, '取消收藏API', 'status=' + unfavorite.status);

    const review = await api('POST', '/marketplace/apis/' + createdInterfaceId + '/review', { userId: USER_ID, userName: 'TestUser', rating: 5, comment: 'Very useful!' });
    assert(review.status === 201, '提交API评价', 'status=' + review.status);

    const reviews = await api('GET', '/marketplace/apis/' + createdInterfaceId + '/reviews');
    assert(reviews.status === 200, '获取API评价列表', 'status=' + reviews.status);
  }
}

async function testWorkflow() {
  console.log('\n=== 9. 工作流模块 ===');
  const templates = await api('GET', '/workflow/templates');
  assert(templates.status === 200 && templates.data?.data?.length > 0, '获取工作流模板', 'status=' + templates.status);

  const create = await api('POST', '/workflow/workflows', {
    name: '测试工作流', description: '自动化测试',
    steps: [
      { id: 'step1', type: 'api-call', config: { url: 'http://localhost:3001/api/monitoring/health', method: 'GET', headers: {} }, nextStep: 'step2' },
      { id: 'step2', type: 'condition', config: { expression: 'data.status === "healthy"' }, nextStep: null },
    ],
    status: 'active',
  });
  assert(create.status === 201 && create.data.id, '创建工作流', 'status=' + create.status);
  const wfId = create.data.id;

  const list = await api('GET', '/workflow/workflows');
  assert(list.status === 200 && list.data?.data, '获取工作流列表', 'status=' + list.status);

  const execute = await api('POST', '/workflow/workflows/' + wfId + '/execute');
  assert(execute.status === 200 && execute.data.status, '执行工作流', 'status=' + execute.status);

  const executions = await api('GET', '/workflow/workflows/' + wfId + '/executions');
  assert(executions.status === 200, '获取工作流执行历史', 'status=' + executions.status);

  const update = await api('PUT', '/workflow/workflows/' + wfId, { name: '测试工作流V2' });
  assert(update.status === 200, '更新工作流', 'status=' + update.status);

  const del = await api('DELETE', '/workflow/workflows/' + wfId);
  assert(del.status === 200, '删除工作流', 'status=' + del.status);
}

async function testGateway() {
  console.log('\n=== 10. API网关模块 ===');
  const create = await api('POST', '/gateway/routes', {
    name: '测试路由', path: '/api/test-gw', target: 'http://localhost:3001/api/monitoring/health', methods: ['GET'], enabled: true, rateLimit: 100, stripPrefix: false,
  });
  assert(create.status === 201 && create.data.id, '创建网关路由', 'status=' + create.status);
  const routeId = create.data.id;

  const list = await api('GET', '/gateway/routes');
  assert(list.status === 200 && Array.isArray(list.data), '获取网关路由列表', 'status=' + list.status);

  const stats = await api('GET', '/gateway/stats');
  assert(stats.status === 200, '获取网关统计', 'status=' + stats.status);

  const routeStats = await api('GET', '/gateway/routes/' + routeId + '/stats');
  assert(routeStats.status === 200, '获取路由统计', 'status=' + routeStats.status);

  const update = await api('PUT', '/gateway/routes/' + routeId, { name: '测试路由V2' });
  assert(update.status === 200, '更新网关路由', 'status=' + update.status);

  const del = await api('DELETE', '/gateway/routes/' + routeId);
  assert(del.status === 200, '删除网关路由', 'status=' + del.status);
}

async function testI18n() {
  console.log('\n=== 11. 国际化模块 ===');
  const locales = await api('GET', '/i18n/locales');
  assert(locales.status === 200 && locales.data?.locales?.length >= 4, '获取语言列表', 'status=' + locales.status);

  const zhCN = await api('GET', '/i18n/locales/zh-CN');
  assert(zhCN.status === 200 && zhCN.data?.translations?.common?.save === '保存', '获取中文翻译', 'status=' + zhCN.status);

  const enUS = await api('GET', '/i18n/locales/en-US');
  assert(enUS.status === 200 && enUS.data?.translations?.common?.save === 'Save', '获取英文翻译', 'status=' + enUS.status);

  const detect = await api('GET', '/i18n/detect');
  assert(detect.status === 200 && detect.data?.locale, '语言检测', 'status=' + detect.status);

  const missing = await api('GET', '/i18n/locales/en-US/missing');
  assert(missing.status === 200, '获取缺失翻译键', 'status=' + missing.status);

  const save = await api('POST', '/i18n/locales', { locale: 'zh-CN', translations: { custom: { greeting: '你好世界' } } });
  assert(save.status === 200, '保存自定义翻译', 'status=' + save.status);

  const notFound = await api('GET', '/i18n/locales/xx-YY');
  assert(notFound.status === 404, '获取不存在的语言返回404', 'status=' + notFound.status);
}

async function testTestSuite() {
  console.log('\n=== 12. 测试套件模块 ===');
  const create = await api('POST', '/test-suite/suites', {
    name: '接口冒烟测试', description: '核心接口冒烟测试', interfaceIds: [createdInterfaceId], schedule: '0 8 * * *', enabled: true,
  });
  assert(create.status === 201 && create.data.id, '创建测试套件', 'status=' + create.status);
  const suiteId = create.data.id;

  const list = await api('GET', '/test-suite/suites');
  assert(list.status === 200 && Array.isArray(list.data), '获取测试套件列表', 'status=' + list.status);

  const run = await api('POST', '/test-suite/suites/' + suiteId + '/run', { baseUrl: 'http://localhost:3001' });
  assert(run.status === 200 && run.data.results, '运行测试套件', 'status=' + run.status);

  const runResults = await api('GET', '/test-suite/suites/' + suiteId + '/results');
  assert(runResults.status === 200, '获取测试结果列表', 'status=' + runResults.status);

  // quick-test sends request to the interface's path, which may not exist as real endpoint
  // The test should return 200 with result data regardless of pass/fail
  const quickTest = await api('POST', '/test-suite/quick-test', { interfaceId: createdInterfaceId, baseUrl: 'http://localhost:3001' });
  assert(quickTest.status === 200, '快速测试', 'status=' + quickTest.status + ' data=' + JSON.stringify(quickTest.data).substring(0, 200));

  const update = await api('PUT', '/test-suite/suites/' + suiteId, { name: '接口冒烟测试V2' });
  assert(update.status === 200, '更新测试套件', 'status=' + update.status);

  const del = await api('DELETE', '/test-suite/suites/' + suiteId);
  assert(del.status === 200, '删除测试套件', 'status=' + del.status);
}

async function testDiffViewer() {
  console.log('\n=== 13. 差异比较模块 ===');
  const compare = await api('POST', '/diff/compare', { sourceId: createdInterfaceId, targetId: createdInterfaceId });
  assert(compare.status === 200, '接口差异比较-ID方式', 'status=' + compare.status);

  const compareObj = await api('POST', '/diff/compare', {
    before: { name: 'API-V1', path: '/v1/api', method: 'GET' }, after: { name: 'API-V2', path: '/v2/api', method: 'POST' },
  });
  assert(compareObj.status === 200 && compareObj.data?.diffs?.length > 0, '接口差异比较-对象方式', 'status=' + compareObj.status);

  const invalidCompare = await api('POST', '/diff/compare', {});
  assert(invalidCompare.status === 400, '差异比较-缺少参数拒绝', 'status=' + invalidCompare.status);
}

async function testApprovals() {
  console.log('\n=== 14. 审批模块 ===');
  const create = await api('POST', '/approvals', {
    type: 'interface_publish', referenceId: createdInterfaceId, title: '发布测试用户API', description: '请审批发布',
  }, authH());
  assert(create.status === 201 && create.data?.id, '创建审批', 'status=' + create.status);
  const approvalId = create.data.id;

  const list = await api('GET', '/approvals', undefined, authH());
  assert(list.status === 200, '获取审批列表', 'status=' + list.status);

  const pending = await api('GET', '/approvals?status=pending', undefined, adminH());
  assert(pending.status === 200, '获取待审批列表', 'status=' + pending.status);

  const approve = await api('PUT', '/approvals/' + approvalId + '/approve', { comment: '同意发布' }, adminH());
  assert(approve.status === 200, '审批通过', 'status=' + approve.status);
}

async function testWebhooks() {
  console.log('\n=== 15. Webhook模块 ===');
  const create = await api('POST', '/webhooks', {
    name: '测试Webhook', url: 'http://localhost:3001/api/monitoring/health', events: ['interface.created', 'interface.updated'], secret: 'wh-secret-123',
  }, adminH());
  assert(create.status === 201 && create.data.id, '创建Webhook', 'status=' + create.status);
  const whId = create.data.id;

  const list = await api('GET', '/webhooks', undefined, authH());
  assert(list.status === 200 && Array.isArray(list.data), '获取Webhook列表', 'status=' + list.status);

  const update = await api('PUT', '/webhooks/' + whId, { name: '测试WebhookV2', enabled: false }, adminH());
  assert(update.status === 200, '更新Webhook', 'status=' + update.status);

  const testWh = await api('POST', '/webhooks/' + whId + '/test', undefined, adminH());
  assert(testWh.status === 200, '测试Webhook', 'status=' + testWh.status);

  const del = await api('DELETE', '/webhooks/' + whId, undefined, adminH());
  assert(del.status === 200, '删除Webhook', 'status=' + del.status);
}

async function testNotifications() {
  console.log('\n=== 16. 通知模块 ===');
  const list = await api('GET', '/notifications', undefined, authH());
  assert(list.status === 200, '获取通知列表', 'status=' + list.status);

  const readAll = await api('PUT', '/notifications/read-all', undefined, authH());
  assert(readAll.status === 200, '标记全部已读', 'status=' + readAll.status);
}

async function testCiCd() {
  console.log('\n=== 17. CI/CD模块 ===');
  const configs = await api('GET', '/cicd/configs');
  assert(configs.status === 200, '获取CI/CD配置列表', 'status=' + configs.status);

  const create = await api('POST', '/cicd/configs', {
    name: '测试流水线', type: 'github-actions', config: JSON.stringify({ workflow: 'test.yml', branch: 'main' }),
  });
  assert(create.status === 201 && create.data?.id, '创建CI/CD配置', 'status=' + create.status);
}

async function testRateLimit() {
  console.log('\n=== 18. 限流模块 ===');
  const list = await api('GET', '/rate-limit/rules');
  assert(list.status === 200, '获取限流规则列表', 'status=' + list.status);

  const create = await api('POST', '/rate-limit/rules', {
    name: '测试限流', path: '/api/test-rate', method: 'GET', limit: 100, windowMs: 60000, strategy: 'fixed-window', enabled: true,
  });
  assert(create.status === 201 && create.data?.id, '创建限流规则', 'status=' + create.status);
  const ruleId = create.data.id;

  const ruleStats = await api('GET', '/rate-limit/rules/' + ruleId + '/stats');
  assert(ruleStats.status === 200, '获取限流规则统计', 'status=' + ruleStats.status);

  const del = await api('DELETE', '/rate-limit/rules/' + ruleId);
  assert(del.status === 200, '删除限流规则', 'status=' + del.status);
}

async function testTracing() {
  console.log('\n=== 19. 链路追踪模块 ===');
  const traces = await api('GET', '/tracing');
  assert(traces.status === 200, '获取追踪列表', 'status=' + traces.status);

  const stats = await api('GET', '/tracing/stats/summary');
  assert(stats.status === 200, '获取追踪统计', 'status=' + stats.status);
}

async function testGraph() {
  console.log('\n=== 20. 关系图谱模块 ===');
  const data = await api('GET', '/graph');
  assert(data.status === 200, '获取图谱数据', 'status=' + data.status);
}

async function testOpenAPI() {
  console.log('\n=== 21. OpenAPI模块 ===');
  const spec = await api('POST', '/openapi/parse', { spec: { openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' }, paths: {} } });
  assert(spec.status === 200, '解析OpenAPI规范', 'status=' + spec.status);

  const exportSpec = await api('GET', '/openapi/export');
  assert(exportSpec.status === 200, '导出OpenAPI规范', 'status=' + exportSpec.status);
}

async function testDocs() {
  console.log('\n=== 22. 文档生成模块 ===');
  const generate = await api('GET', '/docs/generate/' + createdInterfaceId);
  assert(generate.status === 200, '生成接口文档', 'status=' + generate.status);
}

async function testBackup() {
  console.log('\n=== 23. 备份模块 ===');
  const backup = await api('GET', '/backup', undefined, adminH());
  assert(backup.status === 200, '创建备份', 'status=' + backup.status);
}

async function testPerformance() {
  console.log('\n=== 24. 性能模块 ===');
  const stats = await api('GET', '/performance/stats');
  assert(stats.status === 200, '获取性能统计', 'status=' + stats.status);

  const slowest = await api('GET', '/performance/slowest');
  assert(slowest.status === 200, '获取最慢端点', 'status=' + slowest.status);

  const metrics = await api('GET', '/performance/metrics');
  assert(metrics.status === 200, '获取性能指标', 'status=' + metrics.status);

  const cache = await api('GET', '/performance/cache');
  assert(cache.status === 200, '获取缓存统计', 'status=' + cache.status);
}

async function testStats() {
  console.log('\n=== 25. 统计模块 ===');
  const overview = await api('GET', '/stats');
  assert(overview.status === 200, '获取统计概览', 'status=' + overview.status);
}

async function testRealtime() {
  console.log('\n=== 26. 实时通信模块 ===');
  const channels = await api('GET', '/realtime/channels');
  assert(channels.status === 200, '获取频道列表', 'status=' + channels.status);
}

async function testMappings() {
  console.log('\n=== 27. 字段映射模块 ===');
  const smartMatch = await api('POST', '/mappings/smart-match', { interfaceId: createdInterfaceId, modelName: createdModelName });
  assert(smartMatch.status === 200, '智能匹配映射', 'status=' + smartMatch.status);
}

async function testSdkGenerator() {
  console.log('\n=== 28. SDK生成模块 ===');
  const templates = await api('GET', '/sdk-generator/templates');
  assert(templates.status === 200, '获取SDK模板列表', 'status=' + templates.status);

  const generate = await api('POST', '/sdk-generator/generate-from-db', { template: 'typescript-axios', interfaceIds: [createdInterfaceId] });
  assert(generate.status === 200 || generate.status === 201, '生成SDK代码', 'status=' + generate.status);
}

async function testDataSource() {
  console.log('\n=== 29. 数据源模块 ===');
  const list = await api('GET', '/data-source/sources');
  assert(list.status === 200, '获取数据源列表', 'status=' + list.status);

  const create = await api('POST', '/data-source/sources', {
    name: '测试数据源', type: 'postgresql', host: 'localhost', port: 5432,
    database: 'interfacehub', username: 'interfacehub', password: 'interfacehub123',
  });
  assert(create.status === 201 && create.data?.id, '创建数据源', 'status=' + create.status);
  const dsId = create.data.id;

  const testConn = await api('POST', '/data-source/sources/' + dsId + '/test');
  assert(testConn.status === 200, '测试数据源连接', 'status=' + testConn.status);

  const tables = await api('GET', '/data-source/sources/' + dsId + '/tables');
  assert(tables.status === 200 && (Array.isArray(tables.data) && tables.data.length > 0 || tables.data?.tables?.length > 0), '获取数据源表列表', 'status=' + tables.status);

  const del = await api('DELETE', '/data-source/sources/' + dsId);
  assert(del.status === 200, '删除数据源', 'status=' + del.status);
}

async function testGrpc() {
  console.log('\n=== 30. gRPC模块 ===');
  const wellKnown = await api('GET', '/grpc/well-known-types');
  assert(wellKnown.status === 200, '获取gRPC已知类型', 'status=' + wellKnown.status);

  const parse = await api('POST', '/grpc/parse', {
    content: 'syntax = "proto3"; service TestService { rpc GetItem(GetItemRequest) returns (GetItemResponse); } message GetItemRequest { string id = 1; } message GetItemResponse { string id = 1; string name = 2; }',
  });
  assert(parse.status === 200, '解析Proto文件', 'status=' + parse.status);

  const generateRest = await api('POST', '/grpc/generate-rest', {
    services: [{ name: 'TestService', methods: [{ name: 'GetItem', inputType: 'GetItemRequest', outputType: 'GetItemResponse' }] }],
    messages: [{ name: 'GetItemRequest', fields: [{ name: 'id', type: 'string', number: 1 }] }, { name: 'GetItemResponse', fields: [{ name: 'id', type: 'string', number: 1 }, { name: 'name', type: 'string', number: 2 }] }],
  });
  assert(generateRest.status === 200, '生成REST映射', 'status=' + generateRest.status);
}

async function testCleanup() {
  console.log('\n=== 清理测试数据 ===');
  if (createdInterfaceId) { await api('DELETE', '/interfaces/' + createdInterfaceId); console.log('  清理测试接口'); }
  if (createdModelName) { await api('DELETE', '/models/' + createdModelName); console.log('  清理测试模型'); }
}

async function main() {
  console.log('🚀 Interface Hub 全面测试开始\n');
  console.log('时间: ' + new Date().toISOString() + '\n');

  try {
    await testAuth();
    await testInterfaces();
    await testModels();
    await testProjects();
    await testMockServer();
    await testEnvironments();
    await testMonitoring();
    await testMarketplace();
    await testWorkflow();
    await testGateway();
    await testI18n();
    await testTestSuite();
    await testDiffViewer();
    await testApprovals();
    await testWebhooks();
    await testNotifications();
    await testCiCd();
    await testRateLimit();
    await testTracing();
    await testGraph();
    await testOpenAPI();
    await testDocs();
    await testBackup();
    await testPerformance();
    await testStats();
    await testRealtime();
    await testMappings();
    await testSdkGenerator();
    await testDataSource();
    await testGrpc();
    await testCleanup();
  } catch (err) {
    console.error('\n💥 测试执行异常:', err.message);
    results.errors.push('执行异常: ' + err.message);
  }

  console.log('\n\n========================================');
  console.log('📊 测试结果汇总');
  console.log('========================================');
  console.log('✅ 通过: ' + results.passed);
  console.log('❌ 失败: ' + results.failed);
  console.log('📝 总计: ' + (results.passed + results.failed));
  const total = results.passed + results.failed;
  console.log('📈 通过率: ' + (total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0) + '%');

  if (results.errors.length > 0) {
    console.log('\n❌ 失败项:');
    results.errors.forEach(function(e) { console.log(e); });
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

main();
