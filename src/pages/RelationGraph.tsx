import { useEffect, useState, useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RefreshCw, Database, FileText, Code, Table, GitBranch, Search, Filter, X, ChevronDown } from 'lucide-react';
import api from '../services/api';

interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  interfaceCount: number;
  created_at: string;
  updated_at: string;
}

interface Association {
  frontend: string;
  backend: string;
  model: string;
  table: string;
  modelFields: string[];
  tableFields: string[];
  confidence: number;
  matchType: string;
  reasoning: string;
}

type NodeType = 'frontend' | 'backend' | 'model' | 'table';

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  data: Association;
  x: number;
  y: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  edgeType: 'frontend-backend' | 'backend-model' | 'model-table';
  confidence: number;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
}

const NODE_COLORS: Record<NodeType, { fill: string; fillEnd: string; stroke: string; text: string }> = {
  frontend: { fill: '#3B82F6', fillEnd: '#2563EB', stroke: '#60A5FA', text: '#FFFFFF' },
  backend: { fill: '#8B5CF6', fillEnd: '#7C3AED', stroke: '#A78BFA', text: '#FFFFFF' },
  model: { fill: '#F97316', fillEnd: '#EA580C', stroke: '#FB923C', text: '#FFFFFF' },
  table: { fill: '#10B981', fillEnd: '#059669', stroke: '#34D399', text: '#FFFFFF' },
};

const NODE_LABELS: Record<NodeType, string> = {
  frontend: 'Frontend API',
  backend: 'Backend API',
  model: 'Model',
  table: 'Table',
};

const NODE_ICONS: Record<NodeType, string> = {
  frontend: 'FE',
  backend: 'BE',
  model: 'MD',
  table: 'TB',
};

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.7) return '#22C55E';
  if (confidence >= 0.4) return '#EAB308';
  return '#EF4444';
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.7) return 'High';
  if (confidence >= 0.4) return 'Medium';
  return 'Low';
}

function truncateLabel(label: string, maxLen: number = 18): string {
  if (label.length <= maxLen) return label;
  return label.substring(0, maxLen - 2) + '..';
}

export default function RelationGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [associations, setAssociations] = useState<Association[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoveredNodePos, setHoveredNodePos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<NodeType | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1400, height: 800 });
  const layoutInitialized = useRef(false);
  const dragNodeRef = useRef<GraphNode | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({ width: Math.max(rect.width, 800), height: Math.max(rect.height - 60, 600) });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (associations.length > 0 && !layoutInitialized.current) {
      layoutInitialized.current = true;
      buildGraph();
    }
  }, [associations]);

  useEffect(() => {
    if (nodes.length > 0) {
      drawGraph();
    }
  }, [nodes, edges, transform, selectedNode, hoveredNode, searchQuery, filterType, canvasSize]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showProjectDropdown) {
        const target = e.target as HTMLElement;
        if (!target.closest('.project-dropdown-container')) {
          setShowProjectDropdown(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProjectDropdown]);

  const loadProjects = async () => {
    try {
      const data = await api.get('/projects');
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setProjectsLoading(false);
    }
  };

  const loadProjectDetail = async (projectId: string) => {
    if (!projectId) return;
    setLoading(true);
    layoutInitialized.current = false;
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setHoveredNode(null);
    try {
      const data = await api.get(`/projects/${projectId}`);
      const parsedResult = data.parsed_result || {};
      const assocs = parsedResult.associations || [];
      setAssociations(assocs);
    } catch (error) {
      console.error('Failed to load project detail:', error);
      setAssociations([]);
    } finally {
      setLoading(false);
    }
  };

  const buildGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvasSize.width;
    const height = canvasSize.height;

    const graphNodes: GraphNode[] = [];
    const graphEdges: GraphEdge[] = [];

    const frontendMap = new Map<string, Association[]>();
    const backendMap = new Map<string, Association[]>();
    const modelMap = new Map<string, Association[]>();
    const tableMap = new Map<string, Association[]>();

    associations.forEach((assoc) => {
      if (assoc.frontend) {
        if (!frontendMap.has(assoc.frontend)) frontendMap.set(assoc.frontend, []);
        frontendMap.get(assoc.frontend)!.push(assoc);
      }
      if (assoc.backend) {
        if (!backendMap.has(assoc.backend)) backendMap.set(assoc.backend, []);
        backendMap.get(assoc.backend)!.push(assoc);
      }
      if (assoc.model) {
        if (!modelMap.has(assoc.model)) modelMap.set(assoc.model, []);
        modelMap.get(assoc.model)!.push(assoc);
      }
      if (assoc.table) {
        if (!tableMap.has(assoc.table)) tableMap.set(assoc.table, []);
        tableMap.get(assoc.table)!.push(assoc);
      }
    });

    const layerX = {
      frontend: width * 0.12,
      backend: width * 0.37,
      model: width * 0.62,
      table: width * 0.87,
    };

    const nodeSpacing = 100;
    const startY = 120;

    const frontendKeys = Array.from(frontendMap.keys());
    const backendKeys = Array.from(backendMap.keys());
    const modelKeys = Array.from(modelMap.keys());
    const tableKeys = Array.from(tableMap.keys());

    frontendKeys.forEach((key, i) => {
      graphNodes.push({
        id: `frontend-${key}`,
        type: 'frontend',
        label: key,
        data: frontendMap.get(key)![0],
        x: layerX.frontend,
        y: startY + i * nodeSpacing,
      });
    });

    backendKeys.forEach((key, i) => {
      graphNodes.push({
        id: `backend-${key}`,
        type: 'backend',
        label: key,
        data: backendMap.get(key)![0],
        x: layerX.backend,
        y: startY + i * nodeSpacing,
      });
    });

    modelKeys.forEach((key, i) => {
      graphNodes.push({
        id: `model-${key}`,
        type: 'model',
        label: key,
        data: modelMap.get(key)![0],
        x: layerX.model,
        y: startY + i * nodeSpacing,
      });
    });

    tableKeys.forEach((key, i) => {
      graphNodes.push({
        id: `table-${key}`,
        type: 'table',
        label: key,
        data: tableMap.get(key)![0],
        x: layerX.table,
        y: startY + i * nodeSpacing,
      });
    });

    associations.forEach((assoc, i) => {
      if (assoc.frontend && assoc.backend) {
        const sourceId = `frontend-${assoc.frontend}`;
        const targetId = `backend-${assoc.backend}`;
        if (graphNodes.some((n) => n.id === sourceId) && graphNodes.some((n) => n.id === targetId)) {
          graphEdges.push({
            id: `fe-be-${i}`,
            source: sourceId,
            target: targetId,
            edgeType: 'frontend-backend',
            confidence: assoc.confidence,
          });
        }
      }
      if (assoc.backend && assoc.model) {
        const sourceId = `backend-${assoc.backend}`;
        const targetId = `model-${assoc.model}`;
        if (graphNodes.some((n) => n.id === sourceId) && graphNodes.some((n) => n.id === targetId)) {
          graphEdges.push({
            id: `be-md-${i}`,
            source: sourceId,
            target: targetId,
            edgeType: 'backend-model',
            confidence: assoc.confidence,
          });
        }
      }
      if (assoc.model && assoc.table) {
        const sourceId = `model-${assoc.model}`;
        const targetId = `table-${assoc.table}`;
        if (graphNodes.some((n) => n.id === sourceId) && graphNodes.some((n) => n.id === targetId)) {
          graphEdges.push({
            id: `md-tb-${i}`,
            source: sourceId,
            target: targetId,
            edgeType: 'model-table',
            confidence: assoc.confidence,
          });
        }
      }
    });

    const maxNodesInLayer = Math.max(frontendKeys.length, backendKeys.length, modelKeys.length, tableKeys.length);
    const totalHeight = startY * 2 + maxNodesInLayer * nodeSpacing;
    if (totalHeight > height) {
      setCanvasSize((prev) => ({ ...prev, height: totalHeight }));
    }

    setNodes(graphNodes);
    setEdges(graphEdges);
  };

  const filteredNodes = nodes.filter((node) => {
    if (filterType !== 'all' && node.type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesLabel = node.label.toLowerCase().includes(q);
      const matchesModel = node.data?.model?.toLowerCase().includes(q);
      const matchesTable = node.data?.table?.toLowerCase().includes(q);
      const matchesFrontend = node.data?.frontend?.toLowerCase().includes(q);
      const matchesBackend = node.data?.backend?.toLowerCase().includes(q);
      const matchesFields = [
        ...(node.data?.modelFields || []),
        ...(node.data?.tableFields || []),
      ].some((f) => f.toLowerCase().includes(q));
      if (!matchesLabel && !matchesModel && !matchesTable && !matchesFrontend && !matchesBackend && !matchesFields) return false;
    }
    return true;
  });

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter(
    (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
  );

  const getNodeRadius = (node: GraphNode) => {
    const isHovered = hoveredNode?.id === node.id;
    const isSelected = selectedNode?.id === node.id;
    if (node.type === 'frontend' || node.type === 'backend') {
      return (isHovered || isSelected) ? 42 : 35;
    }
    return (isHovered || isSelected) ? 44 : 36;
  };

  const isNodeHighlighted = (nodeId: string) => {
    if (!searchQuery) return false;
    return filteredNodeIds.has(nodeId);
  };

  const drawGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    ctx.scale(dpr, dpr);

    const isDark = document.documentElement.classList.contains('dark');

    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    const layerLabels = [
      { label: 'Frontend API', x: canvasSize.width * 0.12, color: NODE_COLORS.frontend.fill },
      { label: 'Backend API', x: canvasSize.width * 0.37, color: NODE_COLORS.backend.fill },
      { label: 'Model', x: canvasSize.width * 0.62, color: NODE_COLORS.model.fill },
      { label: 'Table', x: canvasSize.width * 0.87, color: NODE_COLORS.table.fill },
    ];

    layerLabels.forEach(({ label, x, color }) => {
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
      ctx.fillRect(x - 80, 0, 160, canvasSize.height / transform.scale);

      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.25)';
      ctx.font = 'bold 13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, x, 16);

      ctx.fillStyle = color;
      ctx.fillRect(x - 30, 36, 60, 3);
    });

    filteredEdges.forEach((edge) => {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);
      if (!sourceNode || !targetNode) return;

      const sx = sourceNode.x;
      const sy = sourceNode.y;
      const tx = targetNode.x;
      const ty = targetNode.y;

      const isRelatedToSelected = selectedNode?.id === edge.source || selectedNode?.id === edge.target;
      const isRelatedToHovered = hoveredNode?.id === edge.source || hoveredNode?.id === edge.target;
      const isDimmed = (selectedNode && !isRelatedToSelected) || (hoveredNode && !isRelatedToHovered);

      const edgeColor = getConfidenceColor(edge.confidence);

      ctx.globalAlpha = isDimmed ? 0.1 : 0.7;
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = (isRelatedToSelected || isRelatedToHovered) ? 3 : 1.5;
      ctx.setLineDash([]);

      const cpOffset = Math.abs(tx - sx) * 0.4;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(sx + cpOffset, sy, tx - cpOffset, ty, tx, ty);
      ctx.stroke();

      const arrowT = 0.92;
      const t1 = arrowT - 0.01;
      const t2 = arrowT;
      const ax1 = bezierPoint(sx, sx + cpOffset, tx - cpOffset, tx, t1);
      const ay1 = bezierPoint(sy, sy, ty, ty, t1);
      const ax2 = bezierPoint(sx, sx + cpOffset, tx - cpOffset, tx, t2);
      const ay2 = bezierPoint(sy, sy, ty, ty, t2);
      const angle = Math.atan2(ay2 - ay1, ax2 - ax1);
      const arrowLen = 10;
      ctx.fillStyle = edgeColor;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - arrowLen * Math.cos(angle - Math.PI / 6), ty - arrowLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(tx - arrowLen * Math.cos(angle + Math.PI / 6), ty - arrowLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 1;
    });

    ctx.setLineDash([]);

    filteredNodes.forEach((node) => {
      const isHovered = hoveredNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;
      const isSearchMatch = isNodeHighlighted(node.id);
      const isDimmed = searchQuery && !isSearchMatch;
      const isUnrelated = (selectedNode && node.id !== selectedNode?.id && !edges.some(
        (e) => (e.source === selectedNode?.id && e.target === node.id) || (e.target === selectedNode?.id && e.source === node.id)
      )) || (hoveredNode && node.id !== hoveredNode?.id && !edges.some(
        (e) => (e.source === hoveredNode?.id && e.target === node.id) || (e.target === hoveredNode?.id && e.source === node.id)
      ));

      if (isDimmed) {
        ctx.globalAlpha = 0.15;
      } else if (isUnrelated && !searchQuery) {
        ctx.globalAlpha = 0.35;
      } else {
        ctx.globalAlpha = 1;
      }

      const colors = NODE_COLORS[node.type];
      const radius = getNodeRadius(node);

      if (node.type === 'frontend' || node.type === 'backend') {
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius);
        if (isSearchMatch) {
          gradient.addColorStop(0, '#FBBF24');
          gradient.addColorStop(1, '#F59E0B');
        } else {
          gradient.addColorStop(0, colors.fill);
          gradient.addColorStop(1, colors.fillEnd);
        }
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isHovered || isSelected ? colors.stroke : (isDark ? '#374151' : '#FFFFFF');
        ctx.lineWidth = isHovered || isSelected ? 3 : 2;
        ctx.stroke();

        if (isSelected) {
          ctx.strokeStyle = colors.stroke;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.fillStyle = colors.text;
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(NODE_ICONS[node.type], node.x, node.y);
      } else {
        const w = radius * 2;
        const h = radius * 1.1;
        const rx = 6;

        const gradient = ctx.createLinearGradient(node.x - w / 2, node.y - h / 2, node.x + w / 2, node.y + h / 2);
        if (isSearchMatch) {
          gradient.addColorStop(0, '#FBBF24');
          gradient.addColorStop(1, '#F59E0B');
        } else {
          gradient.addColorStop(0, colors.fill);
          gradient.addColorStop(1, colors.fillEnd);
        }
        ctx.fillStyle = gradient;
        roundRect(ctx, node.x - w / 2, node.y - h / 2, w, h, rx);
        ctx.fill();

        ctx.strokeStyle = isHovered || isSelected ? colors.stroke : (isDark ? '#374151' : '#FFFFFF');
        ctx.lineWidth = isHovered || isSelected ? 3 : 2;
        roundRect(ctx, node.x - w / 2, node.y - h / 2, w, h, rx);
        ctx.stroke();

        if (isSelected) {
          ctx.strokeStyle = colors.stroke;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          roundRect(ctx, node.x - w / 2 - 6, node.y - h / 2 - 6, w + 12, h + 12, rx + 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.fillStyle = colors.text;
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(NODE_ICONS[node.type], node.x, node.y);
      }

      ctx.globalAlpha = 1;

      const labelY = node.type === 'frontend' || node.type === 'backend'
        ? node.y + radius + 18
        : node.y + (radius * 1.1) / 2 + 18;

      ctx.fillStyle = isDimmed
        ? (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)')
        : (isDark ? '#CBD5E1' : '#334155');
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(truncateLabel(node.label), node.x, labelY);
    });

    ctx.restore();
  };

  const bezierPoint = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const mt = 1 - t;
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
  };

  const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const hitTestNode = (x: number, y: number): GraphNode | null => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const radius = getNodeRadius(node);
      if (node.type === 'frontend' || node.type === 'backend') {
        const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
        if (distance <= radius) return node;
      } else {
        const w = radius * 2;
        const h = radius * 1.1;
        if (x >= node.x - w / 2 && x <= node.x + w / 2 && y >= node.y - h / 2 && y <= node.y + h / 2) {
          return node;
        }
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left - transform.x) / transform.scale;
    const y = (e.clientY - rect.top - transform.y) / transform.scale;

    const hitNode = hitTestNode(x, y);

    if (hitNode) {
      setSelectedNode(hitNode);
      dragNodeRef.current = hitNode;
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    } else {
      setSelectedNode(null);
      dragNodeRef.current = null;
      setIsDragging(true);
      setDragStart({
        x: e.clientX - transform.x,
        y: e.clientY - transform.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (!isDragging) {
      const x = (e.clientX - rect.left - transform.x) / transform.scale;
      const y = (e.clientY - rect.top - transform.y) / transform.scale;
      const hitNode = hitTestNode(x, y);
      setHoveredNode(hitNode);
      if (hitNode) {
        setHoveredNodePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
      return;
    }

    if (dragNodeRef.current) {
      const dx = (e.clientX - dragStart.x) / transform.scale;
      const dy = (e.clientY - dragStart.y) / transform.scale;

      setNodes((prev) =>
        prev.map((node) =>
          node.id === dragNodeRef.current!.id
            ? { ...node, x: node.x + dx, y: node.y + dy }
            : node
        )
      );
      setDragStart({ x: e.clientX, y: e.clientY });
    } else {
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragNodeRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scaleDelta = -e.deltaY * 0.001;
    const newScale = Math.min(Math.max(transform.scale + scaleDelta, 0.3), 4);
    setTransform((prev) => ({ ...prev, scale: newScale }));
  };

  const resetView = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
    layoutInitialized.current = false;
    if (associations.length > 0) {
      buildGraph();
    }
  };

  const zoomIn = () => {
    setTransform((prev) => ({ ...prev, scale: Math.min(prev.scale + 0.2, 4) }));
  };

  const zoomOut = () => {
    setTransform((prev) => ({ ...prev, scale: Math.max(prev.scale - 0.2, 0.3) }));
  };

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
    setShowProjectDropdown(false);
    setSearchQuery('');
    setFilterType('all');
    if (projectId) {
      loadProjectDetail(projectId);
    } else {
      setAssociations([]);
      setNodes([]);
      setEdges([]);
      setSelectedNode(null);
      setHoveredNode(null);
    }
  };

  const handleRefresh = () => {
    if (selectedProjectId) {
      loadProjectDetail(selectedProjectId);
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const getNodeDetail = (node: GraphNode) => {
    const relatedEdges = edges.filter((e) => e.source === node.id || e.target === node.id);
    const connectedNodes = relatedEdges.map((e) => {
      const otherId = e.source === node.id ? e.target : e.source;
      return nodes.find((n) => n.id === otherId);
    }).filter(Boolean) as GraphNode[];

    return { relatedEdges, connectedNodes };
  };

  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8 h-screen flex flex-col" ref={containerRef}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">关系图谱</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          可视化展示 Frontend API → Backend API → Model → Table 的关联链路
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative project-dropdown-container">
          <button
            onClick={() => setShowProjectDropdown(!showProjectDropdown)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-w-[220px] justify-between"
          >
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span className="truncate">
                {selectedProject ? selectedProject.name : '选择项目...'}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showProjectDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showProjectDropdown && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-30 max-h-80 overflow-auto">
              <div className="p-2">
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="搜索项目..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <button
                  onClick={() => handleProjectSelect('')}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                    !selectedProjectId
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  全部项目
                </button>
                {projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleProjectSelect(project.id)}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center gap-2 ${
                      selectedProjectId === project.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="truncate">{project.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {selectedProject && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: selectedProject.color }}
            />
            <span className="text-sm text-blue-700 dark:text-blue-400">{selectedProject.name}</span>
            <button
              onClick={() => handleProjectSelect('')}
              className="ml-1 text-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex-1" />

        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索 API、Model、Table..."
            disabled={!selectedProjectId}
            className="w-56 pl-9 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
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
          disabled={!selectedProjectId}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            showFilters || filterType !== 'all'
              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-400'
              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
          }`}
        >
          <Filter className="w-4 h-4" />
          筛选
          {filterType !== 'all' && (
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
          )}
        </button>

        <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />

        <button
          onClick={zoomIn}
          className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors border border-gray-200 dark:border-gray-600"
          title="放大"
        >
          <ZoomIn className="w-4 h-4 text-gray-700 dark:text-gray-300" />
        </button>
        <button
          onClick={zoomOut}
          className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors border border-gray-200 dark:border-gray-600"
          title="缩小"
        >
          <ZoomOut className="w-4 h-4 text-gray-700 dark:text-gray-300" />
        </button>
        <button
          onClick={resetView}
          className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors border border-gray-200 dark:border-gray-600"
          title="重置视图"
        >
          <Maximize2 className="w-4 h-4 text-gray-700 dark:text-gray-300" />
        </button>
        <button
          onClick={handleRefresh}
          disabled={!selectedProjectId}
          className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors border border-gray-200 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          title="刷新"
        >
          <RefreshCw className={`w-4 h-4 text-gray-700 dark:text-gray-300 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {showFilters && (
        <div className="mb-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 w-80">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase">
                节点类型
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'all' as const, label: '全部' },
                  { value: 'frontend' as const, label: 'Frontend API', color: NODE_COLORS.frontend.fill },
                  { value: 'backend' as const, label: 'Backend API', color: NODE_COLORS.backend.fill },
                  { value: 'model' as const, label: 'Model', color: NODE_COLORS.model.fill },
                  { value: 'table' as const, label: 'Table', color: NODE_COLORS.table.fill },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFilterType(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors ${
                      filterType === opt.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    {opt.color && (
                      <div
                        className={`w-2 h-2 ${opt.value === 'frontend' || opt.value === 'backend' ? 'rounded-full' : 'rounded-sm'}`}
                        style={{ backgroundColor: opt.color }}
                      />
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                显示 {filteredNodes.length} / {nodes.length} 个节点
              </span>
              <button
                onClick={() => {
                  setFilterType('all');
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

      <div className="relative flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden border border-gray-100 dark:border-gray-700">
        {!selectedProjectId ? (
          <div className="flex flex-col items-center justify-center h-full">
            <GitBranch className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">选择一个项目</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6 text-center max-w-md">
              请从上方下拉菜单中选择一个项目，以查看其 API → Model → Table 的关联图谱
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
              <span className="text-sm text-gray-500 dark:text-gray-400">加载关联数据...</span>
            </div>
          </div>
        ) : associations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Database className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">暂无关联数据</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6 text-center max-w-md">
              该项目尚未解析出 API ↔ Model ↔ Table 的关联关系，请先在项目解析页面上传代码进行分析
            </p>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              className="w-full h-full cursor-grab active:cursor-grabbing"
            />

            {hoveredNode && !isDragging && (
              <div
                className="absolute z-20 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 w-80 pointer-events-auto"
                style={{
                  left: Math.min(hoveredNodePos.x + 20, canvasSize.width - 340),
                  top: Math.min(hoveredNodePos.y + 20, canvasSize.height - 300),
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {hoveredNode.type === 'frontend' || hoveredNode.type === 'backend' ? (
                      <Code className="w-5 h-5" style={{ color: NODE_COLORS[hoveredNode.type].fill }} />
                    ) : hoveredNode.type === 'model' ? (
                      <FileText className="w-5 h-5" style={{ color: NODE_COLORS[hoveredNode.type].fill }} />
                    ) : (
                      <Table className="w-5 h-5" style={{ color: NODE_COLORS[hoveredNode.type].fill }} />
                    )}
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium text-white"
                      style={{ backgroundColor: NODE_COLORS[hoveredNode.type].fill }}
                    >
                      {NODE_LABELS[hoveredNode.type]}
                    </span>
                  </div>
                  <button
                    onClick={() => setHoveredNode(null)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-3 break-all">
                  {hoveredNode.label}
                </h4>

                <div className="space-y-2 text-sm">
                  {hoveredNode.type === 'frontend' && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">路径</span>
                        <span className="font-medium text-gray-900 dark:text-white">{hoveredNode.data.frontend}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">后端接口</span>
                        <span className="font-medium text-gray-900 dark:text-white">{hoveredNode.data.backend}</span>
                      </div>
                    </>
                  )}
                  {hoveredNode.type === 'backend' && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">路径</span>
                        <span className="font-medium text-gray-900 dark:text-white">{hoveredNode.data.backend}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">前端接口</span>
                        <span className="font-medium text-gray-900 dark:text-white">{hoveredNode.data.frontend}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">关联模型</span>
                        <span className="font-medium text-gray-900 dark:text-white">{hoveredNode.data.model}</span>
                      </div>
                    </>
                  )}
                  {hoveredNode.type === 'model' && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">模型名</span>
                        <span className="font-medium text-gray-900 dark:text-white">{hoveredNode.data.model}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">关联表</span>
                        <span className="font-medium text-gray-900 dark:text-white">{hoveredNode.data.table}</span>
                      </div>
                      {hoveredNode.data.modelFields && hoveredNode.data.modelFields.length > 0 && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 block mb-1">字段</span>
                          <div className="flex flex-wrap gap-1">
                            {hoveredNode.data.modelFields.map((field) => (
                              <span
                                key={field}
                                className="px-1.5 py-0.5 text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 rounded"
                              >
                                {field}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {hoveredNode.type === 'table' && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">表名</span>
                        <span className="font-medium text-gray-900 dark:text-white">{hoveredNode.data.table}</span>
                      </div>
                      {hoveredNode.data.tableFields && hoveredNode.data.tableFields.length > 0 && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 block mb-1">字段</span>
                          <div className="flex flex-wrap gap-1">
                            {hoveredNode.data.tableFields.map((field) => (
                              <span
                                key={field}
                                className="px-1.5 py-0.5 text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded"
                              >
                                {field}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">匹配置信度</span>
                    <span className="font-medium" style={{ color: getConfidenceColor(hoveredNode.data.confidence) }}>
                      {(hoveredNode.data.confidence * 100).toFixed(0)}% ({getConfidenceLabel(hoveredNode.data.confidence)})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">匹配类型</span>
                    <span className="font-medium text-gray-900 dark:text-white">{hoveredNode.data.matchType}</span>
                  </div>
                  {hoveredNode.data.reasoning && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400 block mb-1">推理依据</span>
                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                        {hoveredNode.data.reasoning}
                      </p>
                    </div>
                  )}
                </div>

                {(() => {
                  const { connectedNodes } = getNodeDetail(hoveredNode);
                  if (connectedNodes.length > 0) {
                    return (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">关联节点</h5>
                        <div className="space-y-1">
                          {connectedNodes.map((cn) => (
                            <div key={cn.id} className="flex items-center gap-2 text-xs">
                              <div
                                className={`w-2 h-2 ${cn.type === 'frontend' || cn.type === 'backend' ? 'rounded-full' : 'rounded-sm'}`}
                                style={{ backgroundColor: NODE_COLORS[cn.type].fill }}
                              />
                              <span className="text-gray-600 dark:text-gray-400 truncate">{cn.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span>Frontend API</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <span>Backend API</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-orange-500"></div>
            <span>Model</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-500"></div>
            <span>Table</span>
          </div>
        </div>

        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />

        <div className="flex items-center gap-4">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase">置信度:</span>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 bg-green-500 rounded"></div>
            <span>高</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 bg-yellow-500 rounded"></div>
            <span>中</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 bg-red-500 rounded"></div>
            <span>低</span>
          </div>
        </div>

        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />

        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
          <span>🖱️ 拖动节点调整位置</span>
          <span>🔍 滚轮缩放</span>
          <span>✋ 拖动画布平移</span>
        </div>

        {nodes.length > 0 && (
          <>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
            <span className="text-xs text-gray-500 dark:text-gray-500">
              {nodes.length} 个节点 · {edges.length} 条连线 · {associations.length} 组关联
            </span>
          </>
        )}
      </div>
    </div>
  );
}
