import { useState, useRef, useEffect, useCallback } from 'react';
import { FolderOpen, Code, Database, Link2, Upload, Check, X, ChevronDown, ChevronRight, Download, Trash2, AlertCircle, CheckCircle, Eye, Network, GitBranch, Table, BarChart3, PieChart, GitMerge } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface ParsedInterface {
  name: string;
  path: string;
  method: string;
  description: string;
  parameters: Array<{ name: string; location: string; type: string; required: boolean }>;
  tags: string[];
  source: 'frontend' | 'backend';
}

interface ParsedModel {
  name: string;
  fields: Array<{ name: string; type: string; nullable: boolean; primaryKey?: boolean; comment?: string }>;
  source: 'code' | 'database';
}

interface ParsedTable {
  name: string;
  columns: Array<{ name: string; type: string; nullable: boolean; primaryKey: boolean; default?: string; comment?: string }>;
  source: 'sql' | 'connection';
}

interface Association {
  frontend?: string;
  backend?: string;
  table?: string;
  model?: string;
  modelFields?: string[];
  tableFields?: string[];
  confidence: number;
  matchType: 'exact' | 'path' | 'semantic' | 'field' | 'inferred';
  reasoning: string;
}

interface ParseResult {
  interfaces: ParsedInterface[];
  models: ParsedModel[];
  tables: ParsedTable[];
  associations: Association[];
  parseStats: {
    frontendFiles: number;
    backendFiles: number;
    sqlFiles: number;
    parseTime: number;
    totalLines: number;
  };
}

interface GraphNode {
  id: string;
  type: 'frontend' | 'backend' | 'model' | 'table';
  label: string;
  x: number;
  y: number;
  connections: string[];
}

interface GraphEdge {
  from: string;
  to: string;
  type: 'fe-be' | 'be-model' | 'model-table';
  confidence: number;
}

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
};

const typeColors = {
  frontend: { bg: 'bg-orange-500', text: 'text-orange-500', light: 'bg-orange-100 dark:bg-orange-900/20' },
  backend: { bg: 'bg-green-500', text: 'text-green-500', light: 'bg-green-100 dark:bg-green-900/20' },
  model: { bg: 'bg-blue-500', text: 'text-blue-500', light: 'bg-blue-100 dark:bg-blue-900/20' },
  table: { bg: 'bg-purple-500', text: 'text-purple-500', light: 'bg-purple-100 dark:bg-purple-900/20' },
};

function RelationGraph({ result, onNodeClick }: { result: ParseResult; onNodeClick?: (node: any) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: Math.max(400, containerRef.current.clientHeight)
        });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!result) return;

    const newNodes: GraphNode[] = [];
    const newEdges: GraphEdge[] = [];
    const nodeMap = new Map<string, GraphNode>();

    const frontendApis = result.interfaces.filter(i => i.source === 'frontend');
    const backendApis = result.interfaces.filter(i => i.source === 'backend');

    const cols = 4;
    const rowHeight = 120;
    const startY = 80;

    frontendApis.forEach((api, i) => {
      const id = `fe-${i}`;
      const row = Math.floor(i / Math.ceil(frontendApis.length / 2));
      const col = i % Math.ceil(frontendApis.length / 2);
      newNodes.push({
        id,
        type: 'frontend',
        label: `${api.method} ${api.path.split('/').pop() || api.path}`,
        x: 50 + col * 200,
        y: startY + row * rowHeight,
        connections: []
      });
      nodeMap.set(id, newNodes[newNodes.length - 1]);
    });

    const beOffset = (dimensions.width - 200) / 2;
    backendApis.forEach((api, i) => {
      const id = `be-${i}`;
      newNodes.push({
        id,
        type: 'backend',
        label: `${api.method} ${api.path.split('/').pop() || api.path}`,
        x: beOffset,
        y: startY + i * 60,
        connections: []
      });
      nodeMap.set(id, newNodes[newNodes.length - 1]);
    });

    result.models.forEach((model, i) => {
      const id = `model-${i}`;
      newNodes.push({
        id,
        type: 'model',
        label: model.name,
        x: dimensions.width - 200,
        y: startY + i * 60,
        connections: []
      });
      nodeMap.set(id, newNodes[newNodes.length - 1]);
    });

    result.tables.forEach((table, i) => {
      const id = `table-${i}`;
      newNodes.push({
        id,
        type: 'table',
        label: table.name,
        x: dimensions.width - 100,
        y: startY + i * 60,
        connections: []
      });
      nodeMap.set(id, newNodes[newNodes.length - 1]);
    });

    result.associations.forEach((assoc) => {
      if (assoc.frontend && assoc.backend) {
        const feNode = newNodes.find(n => assoc.frontend!.includes(n.label.split(' ')[1]));
        const beNode = newNodes.find(n => assoc.backend!.includes(n.label.split(' ')[1]));
        if (feNode && beNode) {
          newEdges.push({
            from: feNode.id,
            to: beNode.id,
            type: 'fe-be',
            confidence: assoc.confidence
          });
          feNode.connections.push(beNode.id);
          beNode.connections.push(feNode.id);
        }
      }
      if (assoc.backend && assoc.model) {
        const beNode = newNodes.find(n => n.type === 'backend' && assoc.backend!.includes(n.label.split(' ')[1]));
        const modelNode = newNodes.find(n => n.type === 'model' && n.label === assoc.model);
        if (beNode && modelNode) {
          newEdges.push({
            from: beNode.id,
            to: modelNode.id,
            type: 'be-model',
            confidence: assoc.confidence
          });
          beNode.connections.push(modelNode.id);
          modelNode.connections.push(beNode.id);
        }
      }
      if (assoc.model && assoc.table) {
        const modelNode = newNodes.find(n => n.type === 'model' && n.label === assoc.model);
        const tableNode = newNodes.find(n => n.type === 'table' && n.label === assoc.table);
        if (modelNode && tableNode) {
          newEdges.push({
            from: modelNode.id,
            to: tableNode.id,
            type: 'model-table',
            confidence: assoc.confidence
          });
          modelNode.connections.push(tableNode.id);
          tableNode.connections.push(modelNode.id);
        }
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [result, dimensions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    edges.forEach(edge => {
      const fromNode = nodes.find(n => n.id === edge.from);
      const toNode = nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return;

      ctx.beginPath();
      ctx.moveTo(fromNode.x + 60, fromNode.y + 15);
      ctx.lineTo(toNode.x, toNode.y + 15);
      ctx.stroke();

      const alpha = Math.min(1, edge.confidence + 0.3);
      ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`;
      const midX = (fromNode.x + 60 + toNode.x) / 2;
      const midY = (fromNode.y + 15 + toNode.y + 15) / 2;
      ctx.beginPath();
      ctx.arc(midX, midY, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    nodes.forEach(node => {
      const isHovered = hoveredNode === node.id;
      const colors = typeColors[node.type];

      ctx.fillStyle = isHovered ? colors.bg : '#64748b';
      ctx.beginPath();
      ctx.roundRect(node.x, node.y, 120, 30, 6);
      ctx.fill();

      ctx.fillStyle = 'white';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = node.label.length > 18 ? node.label.slice(0, 16) + '..' : node.label;
      ctx.fillText(label, node.x + 60, node.y + 15);

      const typeLabel = node.type === 'frontend' ? 'FE' : node.type === 'backend' ? 'BE' : node.type === 'model' ? 'M' : 'DB';
      ctx.fillStyle = colors.bg;
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.fillText(typeLabel, node.x + 12, node.y + 15);
    });
  }, [nodes, edges, hoveredNode, dimensions]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hovered = nodes.find(n => x >= n.x && x <= n.x + 120 && y >= n.y && y <= n.y + 30);
    setHoveredNode(hovered?.id || null);
  }, [nodes]);

  return (
    <div ref={containerRef} className="relative bg-slate-50 dark:bg-slate-900 rounded-lg overflow-hidden" style={{ height: 400 }}>
      <canvas
        ref={canvasRef}
        style={{ width: dimensions.width, height: dimensions.height }}
        className="cursor-pointer"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredNode(null)}
        onClick={() => {
          if (hoveredNode) {
            const node = nodes.find(n => n.id === hoveredNode);
            if (node && onNodeClick) onNodeClick(node);
          }
        }}
      />
      <div className="absolute bottom-2 left-2 flex gap-4 text-xs">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-orange-500" /> 前端接口</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500" /> 后端接口</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-500" /> 数据模型</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-purple-500" /> 数据库表</div>
      </div>
    </div>
  );
}

function SankeyDiagram({ result }: { result: ParseResult }) {
  const frontendCount = result.interfaces.filter(i => i.source === 'frontend').length;
  const backendCount = result.interfaces.filter(i => i.source === 'backend').length;
  const modelCount = result.models.length;
  const tableCount = result.tables.length;

  const maxWidth = 800;
  const height = 200;
  const sectionWidth = maxWidth / 4;

  return (
    <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
      <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-4">数据流向</h4>
      <svg width="100%" height={height} viewBox={`0 0 ${maxWidth} ${height}`}>
        <defs>
          <linearGradient id="grad-fe" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <linearGradient id="grad-be" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="grad-model" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>

        <rect x="10" y="20" width={80} height={frontendCount * 15 + 40} rx="4" fill="#f97316" fillOpacity="0.2" stroke="#f97316" strokeWidth="2">
          <title>前端接口: {frontendCount}</title>
        </rect>
        <text x="50" y="50" textAnchor="middle" className="fill-orange-600 dark:fill-orange-400" fontSize="12" fontWeight="bold">
          前端
        </text>
        <text x="50" y="70" textAnchor="middle" className="fill-orange-600 dark:fill-orange-400" fontSize="20">
          {frontendCount}
        </text>
        <text x="50" y="90" textAnchor="middle" className="fill-orange-500" fontSize="10">
          接口
        </text>

        <rect x={sectionWidth + 10} y="40" width={80} height={backendCount * 12 + 40} rx="4" fill="#22c55e" fillOpacity="0.2" stroke="#22c55e" strokeWidth="2">
          <title>后端接口: {backendCount}</title>
        </rect>
        <text x={sectionWidth + 50} y="70" textAnchor="middle" className="fill-green-600 dark:fill-green-400" fontSize="12" fontWeight="bold">
          后端
        </text>
        <text x={sectionWidth + 50} y="90" textAnchor="middle" className="fill-green-600 dark:fill-green-400" fontSize="20">
          {backendCount}
        </text>
        <text x={sectionWidth + 50} y="110" textAnchor="middle" className="fill-green-500" fontSize="10">
          接口
        </text>

        <rect x={sectionWidth * 2 + 10} y="60" width={80} height={modelCount * 12 + 40} rx="4" fill="#3b82f6" fillOpacity="0.2" stroke="#3b82f6" strokeWidth="2">
          <title>数据模型: {modelCount}</title>
        </rect>
        <text x={sectionWidth * 2 + 50} y="90" textAnchor="middle" className="fill-blue-600 dark:fill-blue-400" fontSize="12" fontWeight="bold">
          模型
        </text>
        <text x={sectionWidth * 2 + 50} y="110" textAnchor="middle" className="fill-blue-600 dark:fill-blue-400" fontSize="20">
          {modelCount}
        </text>
        <text x={sectionWidth * 2 + 50} y="130" textAnchor="middle" className="fill-blue-500" fontSize="10">
          模型
        </text>

        <rect x={sectionWidth * 3 + 10} y="60" width={80} height={tableCount * 12 + 40} rx="4" fill="#a855f7" fillOpacity="0.2" stroke="#a855f7" strokeWidth="2">
          <title>数据库表: {tableCount}</title>
        </rect>
        <text x={sectionWidth * 3 + 50} y="90" textAnchor="middle" className="fill-purple-600 dark:fill-purple-400" fontSize="12" fontWeight="bold">
          数据库
        </text>
        <text x={sectionWidth * 3 + 50} y="110" textAnchor="middle" className="fill-purple-600 dark:fill-purple-400" fontSize="20">
          {tableCount}
        </text>
        <text x={sectionWidth * 3 + 50} y="130" textAnchor="middle" className="fill-purple-500" fontSize="10">
          表
        </text>

        <path d={`M 90 40 C 200 40, ${sectionWidth} 50, ${sectionWidth + 10} 50`} fill="none" stroke="url(#grad-fe)" strokeWidth="2" strokeDasharray="4" />
        <path d={`M ${sectionWidth + 90} 60 C ${sectionWidth * 2 + 50} 60, ${sectionWidth * 2} 70, ${sectionWidth * 2 + 10} 70`} fill="none" stroke="url(#grad-be)" strokeWidth="2" strokeDasharray="4" />
        <path d={`M ${sectionWidth * 2 + 90} 80 C ${sectionWidth * 3 + 50} 80, ${sectionWidth * 3} 80, ${sectionWidth * 3 + 10} 80`} fill="none" stroke="url(#grad-model)" strokeWidth="2" strokeDasharray="4" />
      </svg>
    </div>
  );
}

function InterfaceFlowChart({ associations }: { associations: Association[] }) {
  const flows = associations.slice(0, 8);

  return (
    <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
      <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-4">接口调用链路</h4>
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {flows.map((flow, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs">
            {flow.frontend && (
              <>
                <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded font-mono">
                  {flow.frontend.split(' ')[0]}
                </span>
                <span className="text-gray-500 truncate max-w-24">{flow.frontend.split(' ').slice(1).join(' ')}</span>
                <GitMerge className="w-3 h-3 text-gray-400" />
              </>
            )}
            {flow.backend && (
              <>
                <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded font-mono">
                  {flow.backend.split(' ')[0]}
                </span>
                <span className="text-gray-500 truncate max-w-20">{flow.backend.split(' ').slice(1).join(' ')}</span>
                <Database className="w-3 h-3 text-gray-400" />
              </>
            )}
            {flow.table && (
              <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded">
                {flow.table}
              </span>
            )}
            {flow.confidence && (
              <span className={`ml-auto px-1.5 py-0.5 rounded text-xs ${
                flow.confidence >= 0.8 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                flow.confidence >= 0.5 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              }`}>
                {Math.round(flow.confidence * 100)}%
              </span>
            )}
          </div>
        ))}
        {flows.length === 0 && (
          <p className="text-center text-gray-400 py-4">暂无关联数据</p>
        )}
      </div>
    </div>
  );
}

function StatisticsPanel({ result }: { result: ParseResult }) {
  const stats = [
    { label: '总接口', value: result.interfaces.length, color: 'bg-blue-500' },
    { label: '前端', value: result.interfaces.filter(i => i.source === 'frontend').length, color: 'bg-orange-500' },
    { label: '后端', value: result.interfaces.filter(i => i.source === 'backend').length, color: 'bg-green-500' },
    { label: '模型', value: result.models.length, color: 'bg-cyan-500' },
    { label: '数据表', value: result.tables.length, color: 'bg-purple-500' },
    { label: '关联', value: result.associations.length, color: 'bg-indigo-500' },
  ];

  const methodStats = ['GET', 'POST', 'PUT', 'DELETE'].map(method => ({
    method,
    count: result.interfaces.filter(i => i.method === method).length,
    percentage: result.interfaces.length > 0 ? Math.round((result.interfaces.filter(i => i.method === method).length / result.interfaces.length) * 100) : 0
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center shadow-sm">
            <div className={`w-8 h-8 ${stat.color} rounded-lg mx-auto mb-2 flex items-center justify-center`}>
              <span className="text-white text-sm font-bold">{stat.value}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
        <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">HTTP 方法分布</h4>
        <div className="space-y-2">
          {methodStats.map(({ method, count, percentage }) => (
            <div key={method} className="flex items-center gap-3">
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${methodColors[method]}`}>{method}</span>
              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    method === 'GET' ? 'bg-green-500' :
                    method === 'POST' ? 'bg-blue-500' :
                    method === 'PUT' ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-12 text-right">{count} ({percentage}%)</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
        <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">解析性能</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500 dark:text-gray-400">解析耗时</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">{result.parseStats?.parseTime || 0}ms</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">代码行数</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">{result.parseStats?.totalLines || 0}</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">前端文件</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">{result.parseStats?.frontendFiles || 0}</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">后端文件</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">{result.parseStats?.backendFiles || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProjectParser() {
  const [activeTab, setActiveTab] = useState<'upload' | 'preview' | 'visualize' | 'import'>('upload');
  const [viewMode, setViewMode] = useState<'graph' | 'flow' | 'stats'>('graph');
  const [frontendCode, setFrontendCode] = useState('');
  const [backendCode, setBackendCode] = useState('');
  const [sqlCode, setSqlCode] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedInterfaces, setSelectedInterfaces] = useState<Set<string>>(new Set());
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    frontend: true,
    backend: true,
    models: true,
    tables: true,
    associations: true,
  });

  const frontendInputRef = useRef<HTMLTextAreaElement>(null);
  const backendInputRef = useRef<HTMLTextAreaElement>(null);
  const sqlInputRef = useRef<HTMLTextAreaElement>(null);

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setter((event.target?.result as string) || '');
    };
    reader.readAsText(file);
  };

  const handleParse = async () => {
    if (!frontendCode.trim() && !backendCode.trim() && !sqlCode.trim()) {
      toast('error', '请至少上传一个代码文件');
      return;
    }

    setLoading(true);
    try {
      const result = await api.post('/project-parser/parse/project', {
        frontendCode: frontendCode || undefined,
        backendCode: backendCode || undefined,
        sqlStatements: sqlCode || undefined,
        options: { enableAutoAssociation: true }
      });

      setParseResult(result);
      setSelectedInterfaces(new Set(result.interfaces.map((i: any) => `${i.source}-${i.path}-${i.method}`)));
      setSelectedModels(new Set(result.models.map((m: any) => `${m.source}-${m.name}`)));
      setSelectedTables(new Set(result.tables.map((t: any) => t.name)));
      setActiveTab('preview');
      toast('success', `解析完成: ${result.interfaces.length} 个接口, ${result.models.length} 个模型, ${result.tables.length} 个表`);
    } catch (error: any) {
      toast('error', error.message || '解析失败');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!parseResult) return;

    const interfacesToImport = parseResult.interfaces.filter(
      (i) => selectedInterfaces.has(`${i.source}-${i.path}-${i.method}`)
    );
    const modelsToImport = parseResult.models.filter(
      (m) => selectedModels.has(`${m.source}-${m.name}`)
    );
    const tablesToImport = parseResult.tables.filter((t) => selectedTables.has(t.name));

    if (interfacesToImport.length === 0 && modelsToImport.length === 0 && tablesToImport.length === 0) {
      toast('error', '请至少选择一项导入');
      return;
    }

    setImporting(true);
    try {
      const result = await api.post('/project-parser/import/project', {
        interfaces: interfacesToImport,
        models: modelsToImport,
        tables: tablesToImport,
        options: { overwrite },
      });

      toast('success', `导入成功: ${result.imported.interfaces} 接口, ${result.imported.models} 模型, ${result.imported.tables} 表`);
      setActiveTab('import');
    } catch (error: any) {
      toast('error', error.message || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const toggleInterface = (key: string) => {
    setSelectedInterfaces((prev) => {
      const newSet = new Set(prev);
      newSet.has(key) ? newSet.delete(key) : newSet.add(key);
      return newSet;
    });
  };

  const toggleModel = (key: string) => {
    setSelectedModels((prev) => {
      const newSet = new Set(prev);
      newSet.has(key) ? newSet.delete(key) : newSet.add(key);
      return newSet;
    });
  };

  const toggleTable = (name: string) => {
    setSelectedTables((prev) => {
      const newSet = new Set(prev);
      newSet.has(name) ? newSet.delete(name) : newSet.add(name);
      return newSet;
    });
  };

  const selectAllInCategory = (
    category: 'frontend' | 'backend' | 'models' | 'tables',
    select: boolean
  ) => {
    if (!parseResult) return;

    if (category === 'frontend') {
      const frontendKeys = parseResult.interfaces
        .filter((i) => i.source === 'frontend')
        .map((i) => `${i.source}-${i.path}-${i.method}`);
      setSelectedInterfaces((prev) => {
        const newSet = new Set(prev);
        frontendKeys.forEach((k) => (select ? newSet.add(k) : newSet.delete(k)));
        return newSet;
      });
    } else if (category === 'backend') {
      const backendKeys = parseResult.interfaces
        .filter((i) => i.source === 'backend')
        .map((i) => `${i.source}-${i.path}-${i.method}`);
      setSelectedInterfaces((prev) => {
        const newSet = new Set(prev);
        backendKeys.forEach((k) => (select ? newSet.add(k) : newSet.delete(k)));
        return newSet;
      });
    } else if (category === 'models') {
      const modelKeys = parseResult.models.map((m) => `${m.source}-${m.name}`);
      setSelectedModels((prev) => {
        const newSet = new Set(prev);
        modelKeys.forEach((k) => (select ? newSet.add(k) : newSet.delete(k)));
        return newSet;
      });
    } else if (category === 'tables') {
      const tableNames = parseResult.tables.map((t) => t.name);
      setSelectedTables((prev) => {
        const newSet = new Set(prev);
        tableNames.forEach((n) => (select ? newSet.add(n) : newSet.delete(n)));
        return newSet;
      });
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const frontendInterfaces = parseResult?.interfaces.filter((i) => i.source === 'frontend') || [];
  const backendInterfaces = parseResult?.interfaces.filter((i) => i.source === 'backend') || [];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">项目解析器</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          解析前后端代码和数据库结构，智能关联前后端接口，可视化分析数据流向
        </p>
      </div>

      <div className="flex items-center gap-4 mb-8">
        {(['upload', 'preview', 'visualize'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            disabled={tab === 'preview' && !parseResult}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            } ${tab === 'preview' && !parseResult ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {tab === 'upload' && <Upload className="w-4 h-4" />}
            {tab === 'preview' && <Eye className="w-4 h-4" />}
            {tab === 'visualize' && <Network className="w-4 h-4" />}
            {tab === 'upload' ? '上传代码' : tab === 'preview' ? '预览选择' : '可视化分析'}
          </button>
        ))}
      </div>

      {activeTab === 'upload' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Code className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">前端代码</h3>
                  <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 rounded">
                    React/Vue
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                解析 axios.get(), fetch(), useQuery() 等 API 调用
              </p>
              <input
                type="file"
                accept=".ts,.tsx,.js,.jsx,.vue"
                onChange={(e) => handleFileUpload(e, setFrontendCode)}
                className="hidden"
                id="frontend-file"
              />
              <label
                htmlFor="frontend-file"
                className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 transition-colors mb-4"
              >
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-gray-500 dark:text-gray-400">上传前端代码文件</span>
              </label>
              <textarea
                ref={frontendInputRef}
                value={frontendCode}
                onChange={(e) => setFrontendCode(e.target.value)}
                rows={10}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
                placeholder={`// 示例: axios.get('/api/users')\n// 示例: fetch('/api/products', { method: 'POST' })\n// 示例: useQuery(['user', id], () => api.get(\`/api/users/\${id}\`))`}
              />
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Code className="w-5 h-5 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">后端代码</h3>
                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 rounded">
                    Java/Node/Python/Go
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                解析 @GetMapping, router.get(), @app.route() 等路由定义
              </p>
              <input
                type="file"
                accept=".java,.ts,.js,.py,.go"
                onChange={(e) => handleFileUpload(e, setBackendCode)}
                className="hidden"
                id="backend-file"
              />
              <label
                htmlFor="backend-file"
                className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-green-500 transition-colors mb-4"
              >
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-gray-500 dark:text-gray-400">上传后端代码文件</span>
              </label>
              <textarea
                ref={backendInputRef}
                value={backendCode}
                onChange={(e) => setBackendCode(e.target.value)}
                rows={10}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
                placeholder={`// 示例: @RestController\nclass UserController {\n    @GetMapping("/api/users")\n    public List<User> getUsers() {}\n}\n\n// 示例: router.get('/api/users', ...)\n// 示例: @app.route("/api/users")`}
              />
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-purple-600" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">数据库 SQL</h3>
                  <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 rounded">
                    MySQL/PostgreSQL
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                解析 CREATE TABLE 语句，提取表结构和字段
              </p>
              <input
                type="file"
                accept=".sql"
                onChange={(e) => handleFileUpload(e, setSqlCode)}
                className="hidden"
                id="sql-file"
              />
              <label
                htmlFor="sql-file"
                className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-purple-500 transition-colors mb-4"
              >
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-gray-500 dark:text-gray-400">上传 SQL 文件</span>
              </label>
              <textarea
                ref={sqlInputRef}
                value={sqlCode}
                onChange={(e) => setSqlCode(e.target.value)}
                rows={10}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
                placeholder={`CREATE TABLE users (\n  id INT PRIMARY KEY AUTO_INCREMENT,\n  name VARCHAR(100) NOT NULL,\n  email VARCHAR(255) UNIQUE,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);`}
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                覆盖已存在的同名数据
              </label>
            </div>
            <button
              onClick={handleParse}
              disabled={loading || (!frontendCode.trim() && !backendCode.trim() && !sqlCode.trim())}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <FolderOpen className="w-5 h-5" />
              {loading ? '解析中...' : '开始解析'}
            </button>
          </div>
        </>
      )}

      {activeTab === 'preview' && parseResult && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-orange-600">{frontendInterfaces.length}</p>
                <p className="text-sm text-orange-600/70">前端接口</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{backendInterfaces.length}</p>
                <p className="text-sm text-green-600/70">后端接口</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{parseResult.models.length}</p>
                <p className="text-sm text-blue-600/70">数据模型</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-purple-600">{parseResult.tables.length}</p>
                <p className="text-sm text-purple-600/70">数据库表</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <button
                onClick={() => toggleSection('frontend')}
                className="w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-2">
                  <Code className="w-5 h-5 text-orange-600" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">前端接口 ({frontendInterfaces.length})</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); selectAllInCategory('frontend', true); }} className="text-xs text-blue-600 hover:text-blue-700">全选</button>
                  <span className="text-xs text-gray-500">|</span>
                  <button onClick={(e) => { e.stopPropagation(); selectAllInCategory('frontend', false); }} className="text-xs text-gray-500 hover:text-gray-600">取消</button>
                  {expandedSections.frontend ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                </div>
              </button>
              {expandedSections.frontend && (
                <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                  {frontendInterfaces.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">未检测到前端接口</p>
                  )}
                  {frontendInterfaces.map((iface) => (
                    <label key={`frontend-${iface.path}-${iface.method}`} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedInterfaces.has(`frontend-${iface.path}-${iface.method}`) ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                      <input type="checkbox" checked={selectedInterfaces.has(`frontend-${iface.path}-${iface.method}`)} onChange={() => toggleInterface(`frontend-${iface.path}-${iface.method}`)} className="w-4 h-4 text-blue-600" />
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${methodColors[iface.method]}`}>{iface.method}</span>
                      <span className="text-sm font-mono text-gray-900 dark:text-white">{iface.path}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <button
                onClick={() => toggleSection('backend')}
                className="w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-2">
                  <Code className="w-5 h-5 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">后端接口 ({backendInterfaces.length})</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); selectAllInCategory('backend', true); }} className="text-xs text-blue-600 hover:text-blue-700">全选</button>
                  <span className="text-xs text-gray-500">|</span>
                  <button onClick={(e) => { e.stopPropagation(); selectAllInCategory('backend', false); }} className="text-xs text-gray-500 hover:text-gray-600">取消</button>
                  {expandedSections.backend ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                </div>
              </button>
              {expandedSections.backend && (
                <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                  {backendInterfaces.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">未检测到后端接口</p>
                  )}
                  {backendInterfaces.map((iface) => (
                    <label key={`backend-${iface.path}-${iface.method}`} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedInterfaces.has(`backend-${iface.path}-${iface.method}`) ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                      <input type="checkbox" checked={selectedInterfaces.has(`backend-${iface.path}-${iface.method}`)} onChange={() => toggleInterface(`backend-${iface.path}-${iface.method}`)} className="w-4 h-4 text-blue-600" />
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${methodColors[iface.method]}`}>{iface.method}</span>
                      <span className="text-sm font-mono text-gray-900 dark:text-white">{iface.path}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {parseResult.models.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <button
                onClick={() => toggleSection('models')}
                className="w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">数据模型 ({parseResult.models.length})</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); selectAllInCategory('models', true); }} className="text-xs text-blue-600 hover:text-blue-700">全选</button>
                  <span className="text-xs text-gray-500">|</span>
                  <button onClick={(e) => { e.stopPropagation(); selectAllInCategory('models', false); }} className="text-xs text-gray-500 hover:text-gray-600">取消</button>
                  {expandedSections.models ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                </div>
              </button>
              {expandedSections.models && (
                <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                  {parseResult.models.map((model) => (
                    <label key={`${model.source}-${model.name}`} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedModels.has(`${model.source}-${model.name}`) ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                      <input type="checkbox" checked={selectedModels.has(`${model.source}-${model.name}`)} onChange={() => toggleModel(`${model.source}-${model.name}`)} className="w-4 h-4 text-blue-600" />
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${model.source === 'code' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{model.source === 'code' ? '代码' : '数据库'}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{model.name}</span>
                      <span className="text-xs text-gray-500">({model.fields.length} 字段)</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <button
              onClick={() => toggleSection('tables')}
              className="w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">数据库表 ({parseResult.tables.length})</h3>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); selectAllInCategory('tables', true); }} className="text-xs text-blue-600 hover:text-blue-700">全选</button>
                <span className="text-xs text-gray-500">|</span>
                <button onClick={(e) => { e.stopPropagation(); selectAllInCategory('tables', false); }} className="text-xs text-gray-500 hover:text-gray-600">取消</button>
                {expandedSections.tables ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
              </div>
            </button>
            {expandedSections.tables && (
              <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
                {parseResult.tables.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">未检测到数据库表</p>
                )}
                {parseResult.tables.map((table) => (
                  <div key={table.name} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                    <label className={`flex items-start gap-3 cursor-pointer ${selectedTables.has(table.name) ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 -m-1' : ''}`}>
                      <input type="checkbox" checked={selectedTables.has(table.name)} onChange={() => toggleTable(table.name)} className="w-4 h-4 text-blue-600 mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-gray-900 dark:text-white">{table.name}</span>
                          <span className="text-xs text-gray-500">{table.columns.length} 个字段</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {table.columns.map((col) => (
                            <span key={col.name} className={`text-xs px-2 py-1 rounded ${col.primaryKey ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                              {col.name} {col.primaryKey ? '(PK)' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <button
              onClick={() => toggleSection('associations')}
              className="w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">前后端关联 ({parseResult.associations.length})</h3>
              </div>
              {expandedSections.associations ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
            </button>
            {expandedSections.associations && (
              <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
                {parseResult.associations.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">未检测到关联关系</p>
                )}
                {parseResult.associations.map((assoc, index) => (
                  <div key={index} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="flex-1 flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">前端</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">{assoc.frontend || '-'}</span>
                    </div>
                    <Link2 className="w-4 h-4 text-gray-400" />
                    <div className="flex-1 flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">后端</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">{assoc.backend || '-'}</span>
                    </div>
                    {assoc.model && <><Database className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-600 dark:text-gray-400">{assoc.model}</span></>}
                    {assoc.table && <><Table className="w-4 h-4 text-purple-400" /><span className="text-sm text-purple-600 dark:text-purple-400">{assoc.table}</span></>}
                    <div className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${assoc.confidence >= 0.9 ? 'bg-green-500' : assoc.confidence >= 0.7 ? 'bg-yellow-500' : 'bg-gray-400'}`} />
                      <span className="text-xs text-gray-500">{Math.round(assoc.confidence * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button onClick={() => setActiveTab('upload')} className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              返回修改
            </button>
            <div className="flex items-center gap-4">
              <button onClick={() => setActiveTab('visualize')} className="px-6 py-3 border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex items-center gap-2">
                <Network className="w-5 h-5" />
                可视化分析
              </button>
              <button onClick={handleImport} disabled={importing} className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                <Check className="w-5 h-5" />
                {importing ? '导入中...' : `导入`}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'visualize' && parseResult && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            {(['graph', 'flow', 'stats'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                  viewMode === mode
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {mode === 'graph' && <Network className="w-4 h-4" />}
                {mode === 'flow' && <GitBranch className="w-4 h-4" />}
                {mode === 'stats' && <BarChart3 className="w-4 h-4" />}
                {mode === 'graph' ? '关系网络' : mode === 'flow' ? '调用链路' : '统计面板'}
              </button>
            ))}
          </div>

          {viewMode === 'graph' && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">接口关系网络图</h3>
              <RelationGraph result={parseResult} />
            </div>
          )}

          {viewMode === 'flow' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SankeyDiagram result={parseResult} />
              <InterfaceFlowChart associations={parseResult.associations} />
            </div>
          )}

          {viewMode === 'stats' && (
            <StatisticsPanel result={parseResult} />
          )}

          <div className="flex items-center justify-between">
            <button onClick={() => setActiveTab('preview')} className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              返回预览
            </button>
            <button onClick={handleImport} disabled={importing} className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
              <Check className="w-5 h-5" />
              {importing ? '导入中...' : '导入数据'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'import' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">导入完成</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">项目数据已成功导入到系统中</p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => { setActiveTab('upload'); setParseResult(null); setFrontendCode(''); setBackendCode(''); setSqlCode(''); }}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              继续导入
            </button>
            <a href="/interfaces" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              查看接口列表
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
