import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Database,
  GitBranch,
  Settings,
  ChevronLeft,
  ChevronRight,
  Link2,
  Play,
  Zap,
  Upload,
  Code2,
  BookOpen,
  LogOut,
  User,
  Folder,
  Users,
  CheckCircle,
  Search,
  Activity,
  Rocket,
  Ghost,
  FolderSearch,
  Globe,
  Shield,
  Network,
  Store,
  GitCompare,
  FlaskConical,
  Bell,
  Workflow,
  Sparkles,
  Languages,
  Table2,
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import NotificationBell from '../NotificationBell';
import api from '../../services/api';

const menuItems = [
  { path: '/', label: '仪表盘', icon: LayoutDashboard },
  { path: '/projects', label: '项目空间', icon: Folder },
  { path: '/team', label: '团队管理', icon: Users },
  { path: '/approvals', label: '审批中心', icon: CheckCircle },
  { path: '/interfaces', label: '接口管理', icon: FileText },
  { path: '/models', label: '数据模型', icon: Database },
  { path: '/graph', label: '关系图谱', icon: GitBranch },
  { path: '/parser', label: '代码解析', icon: Code2 },
  { path: '/project-parser', label: '项目解析', icon: FolderSearch },
  { path: '/docs', label: '文档生成', icon: BookOpen },
  { path: '/import', label: '数据导入', icon: Upload },
  { path: '/mock', label: 'Mock服务', icon: Zap },
  { path: '/testing', label: '接口测试', icon: Play },
  { path: '/tracing', label: '链路追踪', icon: Activity },
  { path: '/cicd', label: 'CI/CD', icon: Rocket },
  { path: '/data-simulator', label: '数据模拟', icon: Ghost },
  { path: '/data-source', label: '数据源', icon: Database },
  { path: '/marketplace', label: 'API市场', icon: Store },
  { path: '/gateway', label: 'API网关', icon: Network },
  { path: '/environments', label: '环境管理', icon: Globe },
  { path: '/rate-limit', label: '流量控制', icon: Shield },
  { path: '/grpc', label: 'gRPC', icon: Link2 },
  { path: '/sdk-generator', label: 'SDK生成', icon: Code2 },
  { path: '/diff', label: '接口对比', icon: GitCompare },
  { path: '/test-suite', label: '测试套件', icon: FlaskConical },
  { path: '/monitoring', label: '监控告警', icon: Bell },
  { path: '/workflow', label: '工作流', icon: Workflow },
  { path: '/ai', label: 'AI助手', icon: Sparkles },
  { path: '/i18n', label: '国际化', icon: Languages },
  { path: '/teable', label: 'Teable', icon: Table2 },
  { path: '/settings', label: '设置', icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sidebarCollapsed, toggleSidebar, user, logout } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    if (searchQuery.trim()) {
      const timer = setTimeout(() => doSearch(searchQuery), 300);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const doSearch = async (q: string) => {
    try {
      const data = await api.get(`/interfaces?page=1&limit=5`);
      const interfaces = (data.data || data).filter((i: any) =>
        i.name.toLowerCase().includes(q.toLowerCase()) ||
        i.path.toLowerCase().includes(q.toLowerCase()) ||
        i.method.toLowerCase().includes(q.toLowerCase()) ||
        (i.category && i.category.toLowerCase().includes(q.toLowerCase()))
      );
      setSearchResults(interfaces.slice(0, 5));
    } catch {}
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 z-40 flex flex-col ${
        sidebarCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <Link2 className="w-8 h-8 text-blue-600" />
            <span className="text-xl font-bold text-gray-900 dark:text-white">
              Interface Hub
            </span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          )}
        </button>
      </div>

      {!sidebarCollapsed && (
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(true); }}
              onFocus={() => setShowSearch(true)}
              placeholder="搜索接口..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-600"
            />
            {showSearch && searchQuery && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                {searchResults.map((result) => (
                  <Link
                    key={result.id}
                    to={`/interfaces/${result.id}`}
                    onClick={() => { setSearchQuery(''); setShowSearch(false); }}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                  >
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      result.method === 'GET' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                      result.method === 'POST' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
                      result.method === 'PUT' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
                      result.method === 'DELETE' ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {result.method}
                    </span>
                    <span className="text-gray-900 dark:text-white truncate">{result.name}</span>
                    <span className="text-gray-400 text-xs truncate">{result.path}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Icon className="w-6 h-6 flex-shrink-0" />
              {!sidebarCollapsed && (
                <span className="font-medium">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
        {user ? (
          <div className={`flex items-center ${sidebarCollapsed ? 'flex-col' : 'gap-3'}`}>
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
              </div>
            )}
            <NotificationBell />
            <button
              onClick={handleLogout}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-red-500"
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600"
          >
            <User className="w-4 h-4" />
            {!sidebarCollapsed && <span>登录</span>}
          </Link>
        )}
      </div>
    </aside>
  );
}
