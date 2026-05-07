import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import InterfaceList from './pages/InterfaceList';
import InterfaceCreate from './pages/InterfaceCreate';
import InterfaceDetail from './pages/InterfaceDetail';
import ModelList from './pages/ModelList';
import ModelCreate from './pages/ModelCreate';
import ModelDetail from './pages/ModelDetail';
import RelationGraph from './pages/RelationGraph';
import MockServer from './pages/MockServer';
import ApiTester from './pages/ApiTester';
import { useAppStore } from './stores/appStore';

function App() {
  const { sidebarCollapsed } = useAppStore();

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <main
          className={`transition-all duration-300 ${
            sidebarCollapsed ? 'ml-20' : 'ml-64'
          }`}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/interfaces" element={<InterfaceList />} />
            <Route path="/interfaces/new" element={<InterfaceCreate />} />
            <Route path="/interfaces/:id" element={<InterfaceDetail />} />
            <Route path="/interfaces/:id/edit" element={<InterfaceDetail />} />
            <Route path="/models" element={<ModelList />} />
            <Route path="/models/new" element={<ModelCreate />} />
            <Route path="/models/:name" element={<ModelDetail />} />
            <Route path="/models/:name/edit" element={<ModelCreate />} />
            <Route path="/graph" element={<RelationGraph />} />
            <Route path="/mock" element={<MockServer />} />
            <Route path="/testing" element={<ApiTester />} />
            <Route
              path="/settings"
              element={
                <div className="p-8">
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    设置
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 mt-2">
                    系统设置页面 - 即将推出
                  </p>
                </div>
              }
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
