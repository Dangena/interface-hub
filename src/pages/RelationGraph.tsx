import { useEffect, useState, useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RefreshCw } from 'lucide-react';
import api from '../services/api';

interface GraphNode {
  id: string;
  type: 'interface' | 'database';
  label: string;
  data: any;
  x?: number;
  y?: number;
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
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    loadGraphData();
  }, []);

  useEffect(() => {
    if (graphData.nodes.length > 0) {
      initializeLayout();
      drawGraph();
    }
  }, [graphData, transform]);

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

  const initializeLayout = () => {
    const nodes = graphData.nodes.map((node, index) => {
      const angle = (2 * Math.PI * index) / graphData.nodes.length;
      const radius = 250;
      return {
        ...node,
        x: 400 + radius * Math.cos(angle),
        y: 300 + radius * Math.sin(angle),
      };
    });
    setGraphData((prev) => ({ ...prev, nodes }));
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

    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 2 / transform.scale;

    graphData.edges.forEach((edge) => {
      const sourceNode = graphData.nodes.find((n) => n.id === edge.source);
      const targetNode = graphData.nodes.find((n) => n.id === edge.target);

      if (sourceNode && targetNode && sourceNode.x && sourceNode.y && targetNode.x && targetNode.y) {
        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.stroke();

        const midX = (sourceNode.x + targetNode.x) / 2;
        const midY = (sourceNode.y + targetNode.y) / 2;
        ctx.fillStyle = '#2563EB';
        ctx.beginPath();
        ctx.arc(midX, midY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    graphData.nodes.forEach((node) => {
      if (!node.x || !node.y) return;

      const isHovered = hoveredNode === node.id;
      const isSelected = selectedNode?.id === node.id;

      const radius = isHovered || isSelected ? 45 : 40;

      if (node.type === 'interface') {
        ctx.fillStyle = isHovered ? '#3B82F6' : isSelected ? '#2563EB' : '#1D4ED8';
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const method = node.data?.method || '';
        ctx.fillText(method, node.x, node.y);
      } else {
        ctx.fillStyle = isHovered ? '#10B981' : isSelected ? '#059669' : '#047857';
        ctx.fillRect(node.x - radius, node.y - radius / 2, radius * 2, radius);

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.strokeRect(node.x - radius, node.y - radius / 2, radius * 2, radius);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('DB', node.x, node.y);
      }

      ctx.fillStyle = isHovered || isSelected ? '#1E293B' : '#334155';
      ctx.font = '12px Inter';
      ctx.fillText(node.label, node.x, node.y + radius + 15);
    });

    ctx.restore();
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - transform.x) / transform.scale;
    const y = (e.clientY - rect.top - transform.y) / transform.scale;

    const clickedNode = graphData.nodes.find((node) => {
      if (!node.x || !node.y) return false;
      const dx = x - node.x;
      const dy = y - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance < 45;
    });

    setSelectedNode(clickedNode || null);
    drawGraph();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      }));
    } else {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - transform.x) / transform.scale;
      const y = (e.clientY - rect.top - transform.y) / transform.scale;

      const hovered = graphData.nodes.find((node) => {
        if (!node.x || !node.y) return false;
        const dx = x - node.x;
        const dy = y - node.y;
        return Math.sqrt(dx * dx + dy * dy) < 45;
      });

      setHoveredNode(hovered?.id || null);
      canvas.style.cursor = hovered ? 'pointer' : 'grab';
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(0.5, Math.min(2, prev.scale * delta)),
    }));
  };

  const zoomIn = () => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(2, prev.scale * 1.2),
    }));
  };

  const zoomOut = () => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(0.5, prev.scale / 1.2),
    }));
  };

  const resetView = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
  };

  const refresh = () => {
    loadGraphData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="p-8 pb-0">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          关系图谱
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          可视化展示接口与数据模型的映射关系
        </p>
      </div>

      <div className="flex-1 flex gap-6 p-8 pt-4">
        <div
          ref={containerRef}
          className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden relative"
        >
          <div className="absolute top-4 right-4 flex gap-2 z-10">
            <button
              onClick={zoomIn}
              className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              title="放大"
            >
              <ZoomIn className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <button
              onClick={zoomOut}
              className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              title="缩小"
            >
              <ZoomOut className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <button
              onClick={resetView}
              className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              title="重置视图"
            >
              <Maximize2 className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <button
              onClick={refresh}
              className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              title="刷新"
            >
              <RefreshCw className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>

          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="w-full h-full"
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          />

          {graphData.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  暂无数据，请先创建接口和数据模型
                </p>
              </div>
            </div>
          )}
        </div>

        {selectedNode && (
          <div className="w-80 bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              节点详情
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">
                  类型
                </label>
                <p className="text-gray-900 dark:text-white capitalize">
                  {selectedNode.type === 'interface' ? '接口' : '数据模型'}
                </p>
              </div>

              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">
                  名称
                </label>
                <p className="text-gray-900 dark:text-white font-medium">
                  {selectedNode.label}
                </p>
              </div>

              {selectedNode.type === 'interface' && selectedNode.data && (
                <>
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">
                      方法
                    </label>
                    <p className="text-gray-900 dark:text-white">
                      {selectedNode.data.method}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">
                      路径
                    </label>
                    <code className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedNode.data.path}
                    </code>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">
                      状态
                    </label>
                    <p className="text-gray-900 dark:text-white">
                      {selectedNode.data.status === 'published'
                        ? '已发布'
                        : selectedNode.data.status === 'draft'
                        ? '开发中'
                        : '已弃用'}
                    </p>
                  </div>
                </>
              )}

              {selectedNode.type === 'database' && selectedNode.data && (
                <>
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">
                      表名
                    </label>
                    <code className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedNode.data.tableName}
                    </code>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400">
                      描述
                    </label>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      {selectedNode.data.description || '暂无描述'}
                    </p>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setSelectedNode(null)}
              className="mt-6 w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              关闭
            </button>
          </div>
        )}
      </div>

      <div className="px-8 pb-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-600"></div>
              <span className="text-gray-600 dark:text-gray-400">接口</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-600"></div>
              <span className="text-gray-600 dark:text-gray-400">数据模型</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-gray-400"></div>
              <span className="text-gray-600 dark:text-gray-400">映射关系</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
