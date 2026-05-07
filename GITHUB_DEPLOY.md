# Interface Hub - GitHub 部署指南

## 方案一：使用 GitHub CLI（需要认证）

### 1. 生成 GitHub Personal Access Token

1. 访问 GitHub → Settings → Developer settings
2. Personal access tokens → Tokens (classic)
3. 点击 "Generate new token (classic)"
4. 设置：
   - **Note**: `Interface Hub Deploy`
   - **Expiration**: 选择 30 days
   - **Scopes**: 勾选 `repo` (Full control of private repositories)
5. 点击 "Generate token"
6. **重要**：立即复制并保存 token（只会显示一次）

### 2. 认证 GitHub CLI

在项目目录执行：

```bash
cd /workspace/interface-hub
echo "你的GitHub_TOKEN" | gh auth login --with-token
```

### 3. 创建仓库并推送

```bash
# 创建仓库
gh repo create interface-hub --public --source=. --push

# 或者交互式创建
gh repo create interface-hub
```

---

## 方案二：手动操作（无需CLI）

### 1. 在 GitHub 创建仓库

1. 访问 https://github.com/new
2. 设置：
   - **Repository name**: `interface-hub`
   - **Description**: `前后端接口关系可视化管理系统`
   - **Public** ✅
   - **不要**勾选 "Add a README file"（我们已经有了）
3. 点击 "Create repository"

### 2. 推送代码

在项目目录执行：

```bash
cd /workspace/interface-hub

# 添加远程仓库（将 YOUR_USERNAME 替换为你的 GitHub 用户名）
git remote add origin https://github.com/YOUR_USERNAME/interface-hub.git

# 推送代码
git branch -M main
git push -u origin main
```

---

## 验证部署

无论使用哪种方案，部署成功后访问：
```
https://github.com/你的用户名/interface-hub
```

你应该能看到：
- ✅ 完整的代码文件
- ✅ README.md 说明文档
- ✅ PRD.md 需求文档
- ✅ ARCHITECTURE.md 架构文档

---

## 下一步

创建仓库后，我可以帮你：
1. 配置 GitHub Pages 托管前端
2. 添加更多功能（Mock服务、接口测试等）
3. 集成 CI/CD 自动化部署
4. 添加 GitHub Actions 自动化测试

---

## 当前项目状态

✅ **已完成**
- 接口管理（CRUD）
- 数据模型管理
- 关系图谱可视化
- Dashboard 统计页面
- 完整的 RESTful API
- SQLite 数据库

🔄 **待完成**
- Mock 服务功能
- 接口测试工具
- 用户权限管理
- 导入导出功能

💡 **扩展建议**
- 添加 GraphQL 支持
- 集成 Swagger/OpenAPI
- WebSocket 实时更新
- Docker 容器化部署
