export interface Interface {
  id: string;
  name: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  description: string;
  category: string;
  tags: string[];
  status: 'draft' | 'published' | 'deprecated';
  version: string;
  requestSchema?: RequestSchema;
  responseSchema?: ResponseSchema;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Parameter {
  id: string;
  interfaceId: string;
  name: string;
  location: 'query' | 'path' | 'header' | 'body';
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  example?: any;
}

export interface RequestSchema {
  contentType: string;
  schema: object;
  example?: object;
}

export interface ResponseSchema {
  statusCode: number;
  contentType: string;
  schema: object;
  example?: object;
}

export interface DataModel {
  name: string;
  tableName: string;
  description: string;
  fields: Field[];
  createdAt: string;
  updatedAt: string;
}

export interface Field {
  id: string;
  modelName: string;
  name: string;
  columnName: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: any;
  comment?: string;
}

export interface FieldMapping {
  id: string;
  interfaceId: string;
  interfaceField: string;
  modelName: string;
  modelField: string;
  createdAt: string;
}

export interface ApiLog {
  id: string;
  interfaceId: string;
  method: string;
  path: string;
  requestBody?: string;
  responseBody?: string;
  statusCode: number;
  responseTime: number;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'developer' | 'viewer';
  avatar?: string;
  createdAt: string;
}

export interface GraphNode {
  id: string;
  type: 'frontend' | 'interface' | 'backend' | 'database';
  label: string;
  data: any;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'calls' | 'maps_to' | 'depends_on';
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Stats {
  totalInterfaces: number;
  totalModels: number;
  totalMappings: number;
  publishedInterfaces: number;
  draftInterfaces: number;
  deprecatedInterfaces: number;
  recentLogs: ApiLog[];
}
