import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import InterfaceList from './pages/InterfaceList';
import InterfaceCreate from './pages/InterfaceCreate';
import InterfaceDetail from './pages/InterfaceDetail';
import InterfaceEdit from './pages/InterfaceEdit';
import ModelList from './pages/ModelList';
import ModelCreate from './pages/ModelCreate';
import ModelDetail from './pages/ModelDetail';
import RelationGraph from './pages/RelationGraph';
import MockServer from './pages/MockServer';
import ApiTester from './pages/ApiTester';
import ImportWizard from './pages/ImportWizard';
import CodeParser from './pages/CodeParser';
import DocsGenerator from './pages/DocsGenerator';
import Login from './pages/Login';
import Settings from './pages/Settings';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Team from './pages/Team';
import Approvals from './pages/Approvals';
import Tracing from './pages/Tracing';
import CiCd from './pages/CiCd';
import DataSimulator from './pages/DataSimulator';
import ProjectParser from './pages/ProjectParser';
import DataSourceManager from './pages/DataSourceManager';
import Marketplace from './pages/Marketplace';
import Gateway from './pages/Gateway';
import Environments from './pages/Environments';
import RateLimit from './pages/RateLimit';
import GrpcManager from './pages/GrpcManager';
import SdkGenerator from './pages/SdkGenerator';
import DiffViewer from './pages/DiffViewer';
import TestSuite from './pages/TestSuite';
import Monitoring from './pages/Monitoring';
import WorkflowEditor from './pages/WorkflowEditor';
import AiAssistant from './pages/AiAssistant';
import I18nManager from './pages/I18nManager';
import TeableManager from './pages/TeableManager';
import { useAppStore } from './stores/appStore';
import { ToastContainer } from './components/Toast';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAppStore((s) => s.token);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useAppStore();
  return (
    <>
      <Sidebar />
      <main
        className={`transition-all duration-300 ${
          sidebarCollapsed ? 'ml-20' : 'ml-64'
        }`}
      >
        {children}
      </main>
    </>
  );
}

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <ToastContainer />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <AppLayout><Dashboard /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/interfaces"
            element={
              <PrivateRoute>
                <AppLayout><InterfaceList /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/interfaces/new"
            element={
              <PrivateRoute>
                <AppLayout><InterfaceCreate /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/interfaces/:id"
            element={
              <PrivateRoute>
                <AppLayout><InterfaceDetail /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/interfaces/:id/edit"
            element={
              <PrivateRoute>
                <AppLayout><InterfaceEdit /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/models"
            element={
              <PrivateRoute>
                <AppLayout><ModelList /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/models/new"
            element={
              <PrivateRoute>
                <AppLayout><ModelCreate /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/models/:name"
            element={
              <PrivateRoute>
                <AppLayout><ModelDetail /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/models/:name/edit"
            element={
              <PrivateRoute>
                <AppLayout><ModelCreate /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/graph"
            element={
              <PrivateRoute>
                <AppLayout><RelationGraph /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/mock"
            element={
              <PrivateRoute>
                <AppLayout><MockServer /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/testing"
            element={
              <PrivateRoute>
                <AppLayout><ApiTester /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/import"
            element={
              <PrivateRoute>
                <AppLayout><ImportWizard /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/parser"
            element={
              <PrivateRoute>
                <AppLayout><CodeParser /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/docs"
            element={
              <PrivateRoute>
                <AppLayout><DocsGenerator /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <PrivateRoute>
                <AppLayout><Settings /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/projects"
            element={
              <PrivateRoute>
                <AppLayout><Projects /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <PrivateRoute>
                <AppLayout><ProjectDetail /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/team"
            element={
              <PrivateRoute>
                <AppLayout><Team /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/approvals"
            element={
              <PrivateRoute>
                <AppLayout><Approvals /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/tracing"
            element={
              <PrivateRoute>
                <AppLayout><Tracing /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/cicd"
            element={
              <PrivateRoute>
                <AppLayout><CiCd /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/data-simulator"
            element={
              <PrivateRoute>
                <AppLayout><DataSimulator /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/project-parser"
            element={
              <PrivateRoute>
                <AppLayout><ProjectParser /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/data-source"
            element={
              <PrivateRoute>
                <AppLayout><DataSourceManager /></AppLayout>
              </PrivateRoute>
            }
          />
          <Route path="/marketplace" element={<PrivateRoute><AppLayout><Marketplace /></AppLayout></PrivateRoute>} />
          <Route path="/gateway" element={<PrivateRoute><AppLayout><Gateway /></AppLayout></PrivateRoute>} />
          <Route path="/environments" element={<PrivateRoute><AppLayout><Environments /></AppLayout></PrivateRoute>} />
          <Route path="/rate-limit" element={<PrivateRoute><AppLayout><RateLimit /></AppLayout></PrivateRoute>} />
          <Route path="/grpc" element={<PrivateRoute><AppLayout><GrpcManager /></AppLayout></PrivateRoute>} />
          <Route path="/sdk-generator" element={<PrivateRoute><AppLayout><SdkGenerator /></AppLayout></PrivateRoute>} />
          <Route path="/diff" element={<PrivateRoute><AppLayout><DiffViewer /></AppLayout></PrivateRoute>} />
          <Route path="/test-suite" element={<PrivateRoute><AppLayout><TestSuite /></AppLayout></PrivateRoute>} />
          <Route path="/monitoring" element={<PrivateRoute><AppLayout><Monitoring /></AppLayout></PrivateRoute>} />
          <Route path="/workflow" element={<PrivateRoute><AppLayout><WorkflowEditor /></AppLayout></PrivateRoute>} />
          <Route path="/ai" element={<PrivateRoute><AppLayout><AiAssistant /></AppLayout></PrivateRoute>} />
          <Route path="/i18n" element={<PrivateRoute><AppLayout><I18nManager /></AppLayout></PrivateRoute>} />
          <Route path="/teable" element={<PrivateRoute><AppLayout><TeableManager /></AppLayout></PrivateRoute>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
