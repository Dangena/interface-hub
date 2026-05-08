# Interface Hub

**接口管理平台** — 全栈 API 生命周期管理解决方案

[English](./README_EN.md) | 中文

---

<p align="center">
  <img src="https://img.shields.io/badge/React-18-blue" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5-green" alt="TypeScript">
  <img src="https://img.shields.io/badge/PostgreSQL-16-blue" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Node.js-20+-green" alt="Node.js">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

---

## 特性

### 核心功能

| 模块 | 功能 | 状态 |
|------|------|------|
| **接口管理** | CRUD、版本管理、变更追踪、审批流程 | ✅ |
| **数据模型** | 模型定义、字段映射、Schema 管理 | ✅ |
| **Mock 服务** | 自动 Mock、变量替换、响应延迟 | ✅ |
| **接口测试** | 在线调试、测试历史、参数保存 | ✅ |
| **文档生成** | OpenAPI、Markdown、HTML 文档导出 | ✅ |
| **代码解析** | 17 种前端 + 11 种后端框架自动识别 | ✅ |
| **项目解析** | 前端+后端+数据库一键解析导入 | ✅ |
| **数据模拟** | 22 种数据生成器，支持推送到 DB/API | ✅ |
| **链路追踪** | 请求追踪、性能监控、错误定位 | ✅ |

### 融合架构

| 模块 | 功能 | 状态 |
|------|------|------|
| **数据源** | PostgreSQL / Supabase 直连 | ✅ |
| **自动 API** | 建表即生成 CRUD RESTful API | ✅ |
| **GraphQL** | 自动生成 Schema 和 Resolver | ✅ |
| **实时推送** | SSE 频道订阅/发布 | ✅ |
| **Teable** | 对接 Teable 电子表格 | ✅ |
| **API 网关** | 路由转发、负载统计 | ✅ |
| **环境管理** | Dev/Staging/Prod 多环境 | ✅ |
| **流量控制** | 固定窗口/滑动窗口/令牌桶限流 | ✅ |
| **gRPC** | Protobuf 解析、REST/OpenAPI 生成 | ✅ |
| **SDK 生成** | TypeScript / Python / Go / Java / Rust | ✅ |
| **接口对比** | 版本 Diff、变更影响分析 | ✅ |
| **测试套件** | 自动化回归测试、定时执行 | ✅ |
| **监控告警** | 健康检查、指标监控、告警规则 | ✅ |
| **API 市场** | 接口发现、评分、收藏、趋势 | ✅ |
| **工作流** | 可视化编排 API 调用流程 | ✅ |
| **AI 助手** | 文档/测试/Mock 生成、API 分析 | ✅ |
| **国际化** | 中/英/日/韩 四语支持 | ✅ |

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (React)                         │
│  React 18 + TypeScript + TailwindCSS + Zustand + React Router │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP / SSE
┌─────────────────────▼───────────────────────────────────────┐
│                      后端 (Node.js)                          │
│  Express + TypeScript + PostgreSQL + JWT + pg              │
│                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ 接口管理  │ │ 数据模型  │ │ Mock    │ │ 测试    │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ 代码解析  │ │ 数据模拟  │ │ 链路追踪  │ │ CI/CD   │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ GraphQL  │ │ API网关  │ │ 流量控制  │ │ 监控告警  │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                    数据层 (PostgreSQL)                      │
│  接口定义 │ 数据模型 │ 用户 │ 日志 │ 配置 │ 工作流 │ 实时消息 │
└─────────────────────────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                    外部数据源 (可选)                         │
│  PostgreSQL │ Supabase │ Teable │ 外部 API                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 快速开始

### 前置要求

- Node.js >= 20
- PostgreSQL >= 14
- npm >= 9

### 安装

```bash
# 克隆项目
git clone https://github.com/Dangena/interface-hub.git
cd interface-hub

# 安装依赖
npm install

# 配置数据库
# 创建 PostgreSQL 数据库
createdb interfacehub
# 或
psql -c "CREATE DATABASE interfacehub;"

# 启动服务
npm run dev
```

### 配置

环境变量 (可选，默认值如下):

```bash
# 数据库
PGHOST=localhost
PGPORT=5432
PGDATABASE=interfacehub
PGUSER=postgres
PGASSWORD=your_password

# JWT
JWT_SECRET=your-secret-key

# 服务
PORT=3001
```

### 访问

- 前端: http://localhost:5173
- 后端 API: http://localhost:3001/api
- 默认账号: admin / admin123

---

## 部署

### Docker

```bash
# 构建镜像
docker build -t interface-hub .

# 运行
docker run -d \
  -p 3001:3001 \
  -p 5173:80 \
  -e PGHOST=your-postgres-host \
  -e PGPASSWORD=your-password \
  interface-hub
```

### Docker Compose

```bash
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3001:3001"
      - "5173:80"
    environment:
      - PGHOST=postgres
      - PGPORT=5432
      - PGDATABASE=interfacehub
      - PGUSER=postgres
      - PGPASSWORD=postgres123
      - JWT_SECRET=your-secret-key
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=interfacehub
      - POSTGRES_PASSWORD=postgres123
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## 功能详解

### 接口管理

- 创建、编辑、删除 API 接口
- 支持 RESTful 方法: GET / POST / PUT / DELETE / PATCH
- 请求参数定义 (path / query / header / body)
- 响应 Schema 定义
- 接口版本管理
- 变更审批流程

### Mock 服务

```javascript
// 自动生成 Mock 响应
GET /api/users/:id → 200
{
  "id": "{{id}}",
  "name": "{{name}}",
  "email": "{{email}}",
  "created_at": "{{timestamp}}"
}
```

支持的 Mock 变量:
- `{{id}}` - 随机 ID
- `{{name}}` - 随机姓名
- `{{email}}` - 随机邮箱
- `{{phone}}` - 随机手机号
- `{{timestamp}}` - 当前时间戳
- `{{uuid}}` - UUID

### 代码解析

```typescript
// 前端代码
axios.get('/api/users');           // ✅
fetch('/api/products');            // ✅
useQuery(['user', id], ...);      // ✅

// 后端代码
@GetMapping("/api/users")           // ✅
router.get('/api/users');          // ✅
@app.route("/api/users")           // ✅
```

### 数据模拟

22 种数据生成器:
- 基础: 邮箱、手机号、姓名、地址、URL
- 数字: 整数、浮点数、ID、年龄
- 文本: 单词、句子、段落、公司名
- 特殊: UUID、日期、布尔值、枚举

### GraphQL 自动生成

```sql
-- 从数据库表自动生成 GraphQL Schema
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(255)
);
```

自动生成:
```graphql
type Query {
  users(filter: UserFilter): [User]!
  userById(id: Int!): User
  usersCount: Int!
}

type Mutation {
  createUser(input: UserInput!): User!
  updateUser(id: Int!, input: UserInput!): User!
  deleteUser(id: Int!): Boolean!
}
```

---

## API 文档

### 核心接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/interfaces` | 接口列表 |
| POST | `/api/interfaces` | 创建接口 |
| GET | `/api/interfaces/:id` | 接口详情 |
| PUT | `/api/interfaces/:id` | 更新接口 |
| DELETE | `/api/interfaces/:id` | 删除接口 |
| GET | `/api/models` | 模型列表 |
| POST | `/api/models` | 创建模型 |
| POST | `/api/mock/generate` | 生成 Mock |
| POST | `/api/testing/execute` | 执行测试 |

### 数据源接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/data-source/sources` | 数据源列表 |
| POST | `/api/data-source/sources` | 添加数据源 |
| GET | `/api/data-source/sources/:id/tables` | 表列表 |
| GET | `/api/data-source/sources/:id/crud-apis` | 生成 CRUD API |
| GET | `/api/data-source/sources/:id/graphql-schema` | 生成 GraphQL |

### 高级接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/gateway/routes` | 网关路由 |
| POST | `/api/gateway/proxy/*` | 代理转发 |
| GET | `/api/rate-limit/rules` | 限流规则 |
| GET | `/api/monitoring/health` | 健康检查 |
| POST | `/api/realtime/subscribe` | SSE 订阅 |
| POST | `/api/workflow/execute` | 执行工作流 |

完整 API 文档: http://localhost:3001/api/docs

---

## 技术栈

### 前端
- React 18
- TypeScript 5
- TailwindCSS
- Zustand (状态管理)
- React Router 7
- Vite 6
- Lucide React (图标)
- React Query
- D3.js (关系图)

### 后端
- Node.js 20+
- Express
- TypeScript
- PostgreSQL 16
- JWT (认证)
- pg (数据库驱动)
- uuid (ID 生成)

---

## 目录结构

```
interface-hub/
├── api/                      # 后端
│   ├── routes/              # API 路由
│   │   ├── interfaces.ts     # 接口管理
│   │   ├── models.ts        # 数据模型
│   │   ├── mock.ts          # Mock 服务
│   │   ├── testing.ts       # 接口测试
│   │   ├── dataSource.ts    # 数据源
│   │   ├── gateway.ts       # API 网关
│   │   ├── graphql.ts       # GraphQL
│   │   ├── workflow.ts      # 工作流
│   │   └── ...
│   ├── services/            # 业务服务
│   ├── database.ts          # 数据库连接
│   └── server.ts           # 服务入口
├── src/                     # 前端
│   ├── pages/               # 页面组件
│   ├── components/          # 通用组件
│   ├── stores/              # Zustand 状态
│   ├── services/           # API 服务
│   └── App.tsx             # 应用入口
├── public/                  # 静态资源
├── data/                    # 数据目录 (SQLite 备份)
├── package.json
└── README.md
```

---

## 开发

```bash
# 开发模式 (前端 + 后端)
npm run dev

# 后端开发 (热重载)
npm run server:dev

# 前端开发 (热重载)
npm run client:dev

# 构建生产版本
npm run build

# 类型检查
npm run typecheck

# 代码检查
npm run lint
```

---

## 数据库

### 主要表结构

```sql
-- 接口定义
interfaces (id, name, path, method, description, category, tags,
             status, version, request_schema, response_schema,
             created_by, created_at, updated_at)

-- 数据模型
data_models (name, table_name, description, schema,
             created_at, updated_at)

-- 模型字段
fields (id, model_name, name, column_name, type,
        nullable, primary_key, default_value, comment)

-- 用户
users (id, email, name, password_hash, role,
       avatar, created_at, updated_at)

-- 接口日志
api_logs (id, interface_id, method, path, request_body,
          response_body, status_code, response_time,
          ip_address, user_agent, created_at)

-- Mock 配置
mock_configs (id, interface_id, path, method, status_code,
              delay, response_config, enabled, created_at)

-- 数据库连接
database_connections (id, name, type, host, port,
                       database_name, username, password, path)

-- 工作流
workflows (id, name, description, steps, status,
           created_at, updated_at)

-- 告警规则
alert_rules (id, name, type, threshold, window,
             enabled, last_triggered, created_at)

-- 实时频道
realtime_channels (id, channel, created_at)
realtime_messages (id, channel, event, data, created_at)
```

---

## 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add AmazingFeature'`)
4. 推送分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

---

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

## 致谢

- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [PostgreSQL](https://www.postgresql.org/)
- [TailwindCSS](https://tailwindcss.com/)
- [Vite](https://vitejs.dev/)
