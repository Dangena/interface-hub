import { useEffect, useState, useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RefreshCw, Link2, Database, FileText, X, Search, Filter } from 'lucide-react';
import api from '../services/api';

interface GraphNode {
  id: string;
  type: 'interface' | 'database';
  label: string;
  data: any;
  x?: number;
  y?: number;
  category?: string;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export default function RelationGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoveredNodePos, setHoveredNodePos] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'interface' | 'database'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const layoutInitialized = useRef(false);

  useEffect(() => {
    loadGraphData();
  }, []);

  useEffect(() => {
    if (graphData.nodes.length > 0 && !layoutInitialized.current) {
      layoutInitialized.current = true;
      initializeLayeredLayout();
    }
  }, [graphData]);

  useEffect(() => {
    if (graphData.nodes.length > 0) {
      drawGraph();
    }
  }, [graphData, transform, selectedNode, hoveredNode, searchQuery, filterType, filterCategory]);

  const loadGraphData = async () => {
    try {
      const data = await api.get('/graph');
      setGraphData(data);
    } catch (error) {
      console.error('Failed to load graph data:', error);
    } finally {
      setLoading(false);
    }
  };

  const categories = Array.from(
    new Set(
      graphData.nodes
        .filter((n) => n.type === 'interface' && n.data?.category)
        .map((n) => n.data.category)
    )
  );

  const filteredNodes = graphData.nodes.filter((node) => {
    if (filterType !== 'all' && node.type !== filterType) return false;
    if (filterCategory !== 'all') {
      if (node.type === 'interface' && node.data?.category !== filterCategory) return false;
      if (node.type === 'database') {
        const hasConnectedInterface = graphData.edges.some(
          (e) =>
            (e.source === node.id || e.target === node.id) &&
            graphData.nodes.some(
              (n) =>
                n.id === (e.source === node.id ? e.target : e.source) &&
                n.type === 'interface' &&
                n.data?.category === filterCategory
            )
        );
        if (!hasConnectedInterface) return false;
      }
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesName = node.label.toLowerCase().includes(q);
      const matchesPath = node.data?.path?.toLowerCase().includes(q);
      const matchesMethod = node.data?.method?.toLowerCase().includes(q);
      const matchesCategory = node.data?.category?.toLowerCase().includes(q);
      const matchesTableName = node.data?.tableName?.toLowerCase().includes(q);
      if (!matchesName && !matchesPath && !matchesMethod && !matchesCategory && !matchesTableName) return false;
    }
    return true;
  });

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = graphData.edges.filter(
    (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
  );

  const isHighlighted = (nodeId: string) => {
    if (!searchQuery) return false;
    return filteredNodeIds.has(nodeId);
  };

  const initializeLayeredLayout = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.width;
    const height = canvas.height;

    const interfaceNodes = graphData.nodes.filter(n => n.type === 'interface');
    const databaseNodes = graphData.nodes.filter(n => n.type === 'database');

    const interfaceLayers: Record<string, GraphNode[]> = {};
    interfaceNodes.forEach(node => {
      const category = node.data?.category || '其他';
      if (!interfaceLayers[category]) {
        interfaceLayers[category] = [];
      }
      interfaceLayers[category].push(node);
    });

    const layerStartY = 150;
    const layerSpacing = 120;
    const nodeSpacing = 150;
    const layerY = layerStartY;

    const categories = Object.keys(interfaceLayers);
    const totalWidth = categories.length * 300;
    const startX = (width - totalWidth) / 2 + 150;

    const nodesWithPos: GraphNode[] = [];

    categories.forEach((category, catIndex) => {
      const nodesInLayer = interfaceLayers[category];
      const layerX = startX + catIndex * 300;
      const startY = layerY - (nodesInLayer.length - 1) * nodeSpacing / 2;

      nodesInLayer.forEach((node, nodeIndex) => {
        nodesWithPos.push({
          ...node,
          x: layerX,
          y: startY + nodeIndex * nodeSpacing,
        });
      });
    });

    const dbStartX = width - 200;
    const dbStartY = height / 2;
    const dbSpacing = 120;

    databaseNodes.forEach((node, index) => {
      nodesWithPos.push({
        ...node,
        x: dbStartX,
        y: dbStartY + index * dbSpacing - (databaseNodes.length - 1) * dbSpacing / 2,
      });
    });

    setGraphData(prev => ({ ...prev, nodes: nodesWithPos }));
  };

  const drawGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2 / transform.scale;
    ctx.setLineDash([5, 5]);

    filteredEdges.forEach((edge) => {
      const sourceNode = graphData.nodes.find((n) => n.id === edge.source);
      const targetNode = graphData.nodes.find((n) => n.id === edge.target);

      if (sourceNode && targetNode && sourceNode.x && sourceNode.y && targetNode.x && targetNode.y) {
        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.stroke();

        const midX = (sourceNode.x + targetNode.x) / 2;
        const midY = (sourceNode.y + targetNode.y) / 2;
        ctx.fillStyle = '#3B82F6';
        ctx.beginPath();
        ctx.arc(midX, midY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    ctx.setLineDash([]);

    filteredNodes.forEach((node) => {
      if (!node.x || !node.y) return;

      const isHovered = hoveredNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;
      const isSearchMatch = isHighlighted(node.id);
      const isDimmed = searchQuery && !isSearchMatch;

      const radius = (isHovered || isSelected) ? 50 : 40;

      if (isDimmed) {
        ctx.globalAlpha = 0.2;
      }

      if (node.type === 'interface') {
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius);
        if (isSearchMatch) {
          gradient.addColorStop(0, '#F59E0B');
          gradient.addColorStop(1, '#D97706');
        } else {
          gradient.addColorStop(0, '#3B82F6');
          gradient.addColorStop(1, '#2563EB');
        }
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isHovered ? '#60A5FA' : '#FFFFFF';
        ctx.lineWidth = isHovered ? 4 : 3;
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const method = node.data?.method || '';
        ctx.fillText(method.substring(0, 3), node.x, node.y);
      } else {
        const gradient = ctx.createLinearGradient(node.x - radius, node.y - radius, node.x + radius, node.y + radius);
        if (isSearchMatch) {
          gradient.addColorStop(0, '#F59E0B');
          gradient.addColorStop(1, '#D97706');
        } else {
          gradient.addColorStop(0, '#10B981');
          gradient.addColorStop(1, '#059669');
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(node.x - radius, node.y - radius / 2, radius * 2, radius);

        ctx.strokeStyle = isHovered ? '#34D399' : '#FFFFFF';
        ctx.lineWidth = isHovered ? 4 : 3;
        ctx.strokeRect(node.x - radius, node.y - radius / 2, radius * 2, radius);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('DB', node.x, node.y);
      }

      ctx.globalAlpha = 1;

      ctx.fillStyle = isHovered || isSelected ? '#1E293B' : '#334155';
      ctx.font = '13px Inter';
      ctx.fillText(node.label.substring(0, 20), node.x, node.y + radius + 20);
    });

    ctx.restore();
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left - transform.x) / transform.scale;
    const y = (e.clientY - rect.top - transform.y) / transform.scale;

    let foundNode: GraphNode | null = null;
    for (const node of graphData.nodes) {
      if (!node.x || !node.y) continue;
      const radius = 45;
      const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
      if (distance <= radius) {
        foundNode = node;
        break;
      }
    }

    if (foundNode) {
      setSelectedNode(foundNode);
      setIsDragging(true);
      setDragStart({
        x: e.clientX,
        y: e.clientY,
      });
    } else {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - transform.x,
        y: e.clientY - transform.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = (e.clientX - rect.left - transform.x) / transform.scale;
      const y = (e.clientY - rect.top - transform.y) / transform.scale;

      let foundNode: GraphNode | null = null;
      for (const node of graphData.nodes) {
        if (!node.x || !node.y) continue;
        const radius = 45;
        const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
        if (distance <= radius) {
          foundNode = node;
          break;
        }
      }
      setHoveredNode(foundNode);
      if (foundNode) {
        setHoveredNodePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
      return;
    }

    if (selectedNode) {
      const dx = (e.clientX - dragStart.x) / transform.scale;
      const dy = (e.clientY - dragStart.y) / transform.scale;

      setGraphData(prev => ({
        ...prev,
        nodes: prev.nodes.map(node =>
          node.id === selectedNode.id
            ? { ...node, x: (node.x || 0) + dx, y: (node.y || 0) + dy }
            : node
        )
      }));

      setDragStart({ x: e.clientX, y: e.clientY });
    } else {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scaleDelta = -e.deltaY * 0.001;
    const newScale = Math.min(Math.max(transform.scale + scaleDelta, 0.5), 3);
    setTransform(prev => ({ ...prev, scale: newScale }));
  };

  const resetView = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
    if (graphData.nodes.length > 0) {
      initializeLayeredLayout();
    }
  };

  const zoomIn = () => {
    setTransform(prev => ({ ...prev, scale: Math.min(prev.scale + 0.2, 3) }));
  };

  const zoomOut = () => {
    setTransform(prev => ({ ...prev, scale: Math.max(prev.scale - 0.2, 0.5) }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8" ref={containerRef}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">关系图谱</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          可视化展示接口与数据库表之间的关联关系
        </p>
      </div>

      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        <div className="absolute top-4 left-4 right-4 flex items-center gap-2 z-10">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索接口名称、路径、方法..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
              showFilters || filterType !== 'all' || filterCategory !== 'all'
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-400'
                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
            }`}
          >
            <Filter className="w-4 h-4" />
            筛选
            {(filterType !== 'all' || filterCategory !== 'all') && (
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            )}
          </button>

          <div className="flex-1"></div>

          <button
            onClick={zoomIn}
            className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors border border-gray-200 dark:border-gray-600"
            title="放大"
          >
            <ZoomIn className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <button
            onClick={zoomOut}
            className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors border border-gray-200 dark:border-gray-600"
            title="缩小"
          >
            <ZoomOut className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <button
            onClick={resetView}
            className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors border border-gray-200 dark:border-gray-600"
            title="重置视图"
          >
            <Maximize2 className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <button
            onClick={loadGraphData}
            className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors border border-gray-200 dark:border-gray-600"
            title="刷新"
          >
            <RefreshCw className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
        </div>

        {showFilters && (
          <div className="absolute top-14 left-4 z-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 w-72">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase">
                  节点类型
                </label>
                <div className="flex gap-2">
                  {[
                    { value: 'all', label: '全部' },
                    { value: 'interface', label: '接口' },
                    { value: 'database', label: '数据库' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFilterType(opt.value as any)}
                      className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                        filterType === opt.value
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {categories.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase">
                    接口分类
                  </label>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="all">全部分类</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  显示 {filteredNodes.length} / {graphData.nodes.length} 个节点
                </span>
                <button
                  onClick={() => {
                    setFilterType('all');
                    setFilterCategory('all');
                    setSearchQuery('');
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  重置筛选
                </button>
              </div>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={1400}
          height={800}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="w-full cursor-grab active:cursor-grabbing"
        />

        {hoveredNode && (
          <div
            className="absolute z-20 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 w-72"
            style={{
              left: Math.min(hoveredNodePos.x + 20, 1100),
              top: Math.min(hoveredNodePos.y + 20, 700),
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                {hoveredNode.type === 'interface' ? (
                  <FileText className="w-5 h-5 text-blue-600" />
                ) : (
                  <Database className="w-5 h-5 text-green-600" />
                )}
                <h4 className="font-semibold text-gray-900 dark:text-white">
                  {hoveredNode.label}
                </h4>
              </div>
              <button
                onClick={() => setHoveredNode(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {hoveredNode.type === 'interface' ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">方法</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {hoveredNode.data?.method}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">路径</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {hoveredNode.data?.path}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">状态</span>
                  <span className={`font-medium ${
                    hoveredNode.data?.status === 'published'
                      ? 'text-green-600'
                      : 'text-yellow-600'
                  }`}>
                    {hoveredNode.data?.status === 'published' ? '已发布' : '开发中'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">表名</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {hoveredNode.data?.tableName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">描述</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {hoveredNode.data?.description || '-'}
                  </span>
                </div>
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">关联</h5>
              <div className="space-y-1">
                {graphData.edges.filter(e => e.source === hoveredNode.id || e.target === hoveredNode.id).map(edge => {
                  const otherNodeId = edge.source === hoveredNode.id ? edge.target : edge.source;
                  const otherNode = graphData.nodes.find(n => n.id === otherNodeId);
                  return (
                    <div key={edge.id} className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                      <Link2 className="w-3 h-3" />
                      <span>{otherNode?.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-600"></div>
          <span>API 接口</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-600"></div>
          <span>数据模型</span>
        </div>
        <div className="flex items-center gap-2">
          <span>🖱️ 拖动节点调整位置</span>
        </div>
        <div className="flex items-center gap-2">
          <span>🔍 滚动放大缩小</span>
        </div>
      </div>
    </div>
  );
}
