import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

interface ProtoMethod {
  name: string;
  inputType: string;
  outputType: string;
  clientStreaming: boolean;
  serverStreaming: boolean;
}

interface ProtoService {
  name: string;
  methods: ProtoMethod[];
}

interface ProtoField {
  name: string;
  type: string;
  number: number;
  repeated: boolean;
  map: boolean;
  mapKeyType?: string;
  mapValueType?: string;
}

interface ProtoMessage {
  name: string;
  fields: ProtoField[];
  nestedMessages: ProtoMessage[];
  nestedEnums: ProtoEnum[];
}

interface ProtoEnumValue {
  name: string;
  number: number;
}

interface ProtoEnum {
  name: string;
  values: ProtoEnumValue[];
}

interface ParsedProto {
  services: ProtoService[];
  messages: ProtoMessage[];
  enums: ProtoEnum[];
}

interface RestEndpoint {
  method: string;
  path: string;
  serviceName: string;
  rpcName: string;
  inputType: string;
  outputType: string;
}

interface WellKnownType {
  fullName: string;
  shortName: string;
  package: string;
  description: string;
}

router.post('/parse', (req, res) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Proto file content is required' });
      return;
    }
    const result = parseProto(content);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Parse proto error:', error);
    res.status(500).json({ error: 'Failed to parse proto file', details: (error as Error).message });
  }
});

router.post('/parse-file', (req, res) => {
  try {
    const { file } = req.body;
    if (!file || !file.content) {
      res.status(400).json({ error: 'File content is required' });
      return;
    }
    if (file.name && !file.name.endsWith('.proto')) {
      res.status(400).json({ error: 'Only .proto files are supported' });
      return;
    }
    const result = parseProto(file.content);
    res.json({ success: true, data: result, fileName: file.name || 'unknown.proto' });
  } catch (error) {
    console.error('Parse proto file error:', error);
    res.status(500).json({ error: 'Failed to parse proto file', details: (error as Error).message });
  }
});

router.post('/generate-rest', (req, res) => {
  try {
    const { services, messages } = req.body;
    if (!services || !Array.isArray(services)) {
      res.status(400).json({ error: 'Services array is required' });
      return;
    }
    const endpoints = generateRestMapping(services, messages || []);
    res.json({ success: true, data: endpoints });
  } catch (error) {
    console.error('Generate REST error:', error);
    res.status(500).json({ error: 'Failed to generate REST mapping', details: (error as Error).message });
  }
});

router.post('/generate-typescript', (req, res) => {
  try {
    const { services, messages, enums } = req.body;
    if (!services || !Array.isArray(services)) {
      res.status(400).json({ error: 'Services array is required' });
      return;
    }
    const code = generateTypeScriptClient(services, messages || [], enums || []);
    res.json({ success: true, data: { code } });
  } catch (error) {
    console.error('Generate TypeScript error:', error);
    res.status(500).json({ error: 'Failed to generate TypeScript client', details: (error as Error).message });
  }
});

router.post('/generate-openapi', (req, res) => {
  try {
    const { services, messages, enums, title, version } = req.body;
    if (!services || !Array.isArray(services)) {
      res.status(400).json({ error: 'Services array is required' });
      return;
    }
    const spec = generateOpenApiSpec(services, messages || [], enums || [], title || 'gRPC API', version || '1.0.0');
    res.json({ success: true, data: spec });
  } catch (error) {
    console.error('Generate OpenAPI error:', error);
    res.status(500).json({ error: 'Failed to generate OpenAPI spec', details: (error as Error).message });
  }
});

router.get('/well-known-types', (_req, res) => {
  res.json({ success: true, data: getWellKnownTypes() });
});

function parseProto(content: string): ParsedProto {
  const cleaned = removeComments(content);
  const services = parseServices(cleaned);
  const messages = parseMessages(cleaned);
  const enums = parseEnums(cleaned);
  return { services, messages, enums };
}

function removeComments(content: string): string {
  let result = content.replace(/\/\*[\s\S]*?\*\//g, '');
  result = result.replace(/\/\/.*$/gm, '');
  return result;
}

function parseServices(content: string): ProtoService[] {
  const services: ProtoService[] = [];
  const servicePattern = /service\s+(\w+)\s*\{/g;
  let serviceMatch;
  while ((serviceMatch = servicePattern.exec(content)) !== null) {
    const serviceName = serviceMatch[1];
    const serviceBody = extractBlock(content, serviceMatch.index + serviceMatch[0].length - 1);
    const methods = parseServiceMethods(serviceBody);
    services.push({ name: serviceName, methods });
  }
  return services;
}

function parseServiceMethods(body: string): ProtoMethod[] {
  const methods: ProtoMethod[] = [];
  const rpcPattern = /rpc\s+(\w+)\s*\(\s*(stream\s+)?(\w+)\s*\)\s*returns\s*\(\s*(stream\s+)?(\w+)\s*\)/g;
  let match;
  while ((match = rpcPattern.exec(body)) !== null) {
    methods.push({
      name: match[1],
      inputType: match[3],
      outputType: match[5],
      clientStreaming: !!match[2],
      serverStreaming: !!match[4],
    });
  }
  return methods;
}

function parseMessages(content: string): ProtoMessage[] {
  return parseMessagesRecursive(content, 0);
}

function parseMessagesRecursive(content: string, depth: number): ProtoMessage[] {
  const messages: ProtoMessage[] = [];
  const messagePattern = /message\s+(\w+)\s*\{/g;
  let match;
  while ((match = messagePattern.exec(content)) !== null) {
    const messageName = match[1];
    const braceStart = match.index + match[0].length - 1;
    const body = extractBlock(content, braceStart);
    const innerContent = body.slice(1, -1).trim();
    const fields = parseMessageFields(innerContent);
    const nestedMessages = parseMessagesRecursive(innerContent, depth + 1);
    const nestedEnums = parseEnums(innerContent);
    messages.push({
      name: depth > 0 ? messageName : messageName,
      fields,
      nestedMessages,
      nestedEnums,
    });
    const skipLength = match[0].length + body.length - 1;
    messagePattern.lastIndex = match.index + skipLength;
  }
  return messages;
}

function parseMessageFields(content: string): ProtoField[] {
  const fields: ProtoField[] = [];
  const mapPattern = /map\s*<\s*(\w+)\s*,\s*(\w+)\s*>\s+(\w+)\s*=\s*(\d+)/g;
  let mapMatch;
  while ((mapMatch = mapPattern.exec(content)) !== null) {
    fields.push({
      name: mapMatch[3],
      type: `map<${mapMatch[1]}, ${mapMatch[2]}>`,
      number: parseInt(mapMatch[4], 10),
      repeated: false,
      map: true,
      mapKeyType: mapMatch[1],
      mapValueType: mapMatch[2],
    });
  }
  const fieldPattern = /^(?!\s*map\s*<)(?!\s*message\s)(?!\s*enum\s)(?!\s*oneof\s)(?:repeated\s+)?(\w+(?:\.\w+)*)\s+(\w+)\s*=\s*(\d+)/gm;
  let fieldMatch;
  while ((fieldMatch = fieldPattern.exec(content)) !== null) {
    const isRepeated = fieldMatch[0].trim().startsWith('repeated');
    const fieldName = fieldMatch[2];
    if (fields.some(f => f.name === fieldName)) continue;
    fields.push({
      name: fieldName,
      type: fieldMatch[1],
      number: parseInt(fieldMatch[3], 10),
      repeated: isRepeated,
      map: false,
    });
  }
  return fields;
}

function parseEnums(content: string): ProtoEnum[] {
  const enums: ProtoEnum[] = [];
  const enumPattern = /enum\s+(\w+)\s*\{/g;
  let match;
  while ((match = enumPattern.exec(content)) !== null) {
    const enumName = match[1];
    const braceStart = match.index + match[0].length - 1;
    const body = extractBlock(content, braceStart);
    const innerContent = body.slice(1, -1).trim();
    const values = parseEnumValues(innerContent);
    enums.push({ name: enumName, values });
    const skipLength = match[0].length + body.length - 1;
    enumPattern.lastIndex = match.index + skipLength;
  }
  return enums;
}

function parseEnumValues(content: string): ProtoEnumValue[] {
  const values: ProtoEnumValue[] = [];
  const valuePattern = /(\w+)\s*=\s*(-?\d+)/g;
  let match;
  while ((match = valuePattern.exec(content)) !== null) {
    if (match[1] === 'option' || match[1] === 'reserved' || match[1] === 'allow_alias') continue;
    values.push({
      name: match[1],
      number: parseInt(match[2], 10),
    });
  }
  return values;
}

function extractBlock(content: string, startIndex: number): string {
  let depth = 0;
  let i = startIndex;
  for (; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return content.substring(startIndex, i + 1);
}

function generateRestMapping(services: ProtoService[], messages: ProtoMessage[]): RestEndpoint[] {
  const endpoints: RestEndpoint[] = [];
  for (const service of services) {
    const servicePath = '/' + toKebabCase(service.name).replace(/-service$/, '');
    for (const method of service.methods) {
      const inputFields = getMessageFields(method.inputType, messages);
      const hasNameField = inputFields.some(f => f.name === 'name' || f.name === 'id');
      const httpMethod = inferHttpMethod(method.name);
      const path = inferRestPath(httpMethod, method.name, servicePath, method.inputType, hasNameField);
      endpoints.push({
        method: httpMethod,
        path,
        serviceName: service.name,
        rpcName: method.name,
        inputType: method.inputType,
        outputType: method.outputType,
      });
    }
  }
  return endpoints;
}

function inferHttpMethod(rpcName: string): string {
  const lower = rpcName.toLowerCase();
  if (lower.startsWith('get') || lower.startsWith('list') || lower.startsWith('read') || lower.startsWith('find') || lower.startsWith('search')) return 'GET';
  if (lower.startsWith('create') || lower.startsWith('add') || lower.startsWith('insert')) return 'POST';
  if (lower.startsWith('update') || lower.startsWith('modify') || lower.startsWith('patch')) return 'PUT';
  if (lower.startsWith('delete') || lower.startsWith('remove')) return 'DELETE';
  return 'POST';
}

function inferRestPath(httpMethod: string, rpcName: string, servicePath: string, inputType: string, hasNameField: boolean): string {
  const resource = toKebabCase(extractResourceName(rpcName));
  if (httpMethod === 'GET') {
    if (rpcName.toLowerCase().startsWith('list') || rpcName.toLowerCase().startsWith('search')) {
      return `${servicePath}/${resource}`;
    }
    if (hasNameField) {
      return `${servicePath}/${resource}/{name}`;
    }
    return `${servicePath}/${resource}/{id}`;
  }
  if (httpMethod === 'POST') {
    return `${servicePath}/${resource}`;
  }
  if (httpMethod === 'PUT') {
    if (hasNameField) {
      return `${servicePath}/${resource}/{name}`;
    }
    return `${servicePath}/${resource}/{id}`;
  }
  if (httpMethod === 'DELETE') {
    if (hasNameField) {
      return `${servicePath}/${resource}/{name}`;
    }
    return `${servicePath}/${resource}/{id}`;
  }
  return `${servicePath}/${resource}`;
}

function extractResourceName(rpcName: string): string {
  const prefixes = ['get', 'list', 'create', 'add', 'update', 'modify', 'patch', 'delete', 'remove', 'find', 'search', 'read', 'insert'];
  let name = rpcName;
  for (const prefix of prefixes) {
    if (name.toLowerCase().startsWith(prefix)) {
      name = name.slice(prefix.length);
      break;
    }
  }
  if (name.endsWith('s') && name.length > 1) return name;
  return name;
}

function getMessageFields(messageName: string, messages: ProtoMessage[]): ProtoField[] {
  const msg = findMessage(messageName, messages);
  return msg ? msg.fields : [];
}

function findMessage(name: string, messages: ProtoMessage[]): ProtoMessage | null {
  for (const msg of messages) {
    if (msg.name === name) return msg;
    const nested = findMessage(name, msg.nestedMessages);
    if (nested) return nested;
  }
  return null;
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function generateTypeScriptClient(services: ProtoService[], messages: ProtoMessage[], enums: ProtoEnum[]): string {
  const lines: string[] = [];
  lines.push('// Auto-generated TypeScript gRPC client');
  lines.push('');
  for (const e of enums) {
    lines.push(`export enum ${e.name} {`);
    for (const v of e.values) {
      lines.push(`  ${v.name} = ${v.number},`);
    }
    lines.push('}');
    lines.push('');
  }
  for (const msg of flattenMessages(messages)) {
    lines.push(`export interface ${msg.name} {`);
    for (const field of msg.fields) {
      const tsType = protoTypeToTs(field.type, field.repeated, field.map, field.mapKeyType, field.mapValueType);
      lines.push(`  ${field.name}: ${tsType};`);
    }
    lines.push('}');
    lines.push('');
  }
  for (const service of services) {
    lines.push(`export class ${service.name}Client {`);
    lines.push('  private baseUrl: string;');
    lines.push('');
    lines.push('  constructor(baseUrl: string) {');
    lines.push('    this.baseUrl = baseUrl;');
    lines.push('  }');
    for (const method of service.methods) {
      const inputType = method.inputType;
      const outputType = method.outputType;
      lines.push('');
      if (method.clientStreaming || method.serverStreaming) {
        lines.push(`  async ${method.name}(request: ${inputType}): Promise<${outputType}> {`);
        lines.push(`    const response = await fetch(\`\${this.baseUrl}/${toKebabCase(service.name)}/${toKebabCase(method.name)}\`, {`);
        lines.push(`      method: 'POST',`);
        lines.push(`      headers: { 'Content-Type': 'application/json' },`);
        lines.push(`      body: JSON.stringify(request),`);
        lines.push(`    });`);
        lines.push(`    return response.json();`);
        lines.push(`  }`);
      } else {
        lines.push(`  async ${method.name}(request: ${inputType}): Promise<${outputType}> {`);
        lines.push(`    const response = await fetch(\`\${this.baseUrl}/${toKebabCase(service.name)}/${toKebabCase(method.name)}\`, {`);
        lines.push(`      method: 'POST',`);
        lines.push(`      headers: { 'Content-Type': 'application/json' },`);
        lines.push(`      body: JSON.stringify(request),`);
        lines.push(`    });`);
        lines.push(`    return response.json();`);
        lines.push(`  }`);
      }
    }
    lines.push('}');
    lines.push('');
  }
  return lines.join('\n');
}

function flattenMessages(messages: ProtoMessage[]): ProtoMessage[] {
  const result: ProtoMessage[] = [];
  for (const msg of messages) {
    result.push(msg);
    result.push(...flattenMessages(msg.nestedMessages));
  }
  return result;
}

function protoTypeToTs(type: string, repeated: boolean, map: boolean, mapKeyType?: string, mapValueType?: string): string {
  if (map && mapKeyType && mapValueType) {
    return `Record<${protoTypeToTs(mapKeyType, false, false)}, ${protoTypeToTs(mapValueType, false, false)}>`;
  }
  const baseType = (() => {
    switch (type) {
      case 'string': return 'string';
      case 'int32': case 'int64': case 'sint32': case 'sint64':
      case 'sfixed32': case 'sfixed64': case 'fixed32': case 'fixed64':
      case 'uint32': case 'uint64': return 'number';
      case 'float': case 'double': return 'number';
      case 'bool': return 'boolean';
      case 'bytes': return 'Uint8Array';
      case 'google.protobuf.Timestamp': return 'Date';
      case 'google.protobuf.Duration': return 'string';
      case 'google.protobuf.Struct': return 'Record<string, any>';
      case 'google.protobuf.Value': return 'any';
      case 'google.protobuf.Any': return 'any';
      case 'google.protobuf.ListValue': return 'any[]';
      case 'google.protobuf.Empty': return 'void';
      case 'google.protobuf.WrappersProto': return 'any';
      case 'google.protobuf.BoolValue': return 'boolean | undefined';
      case 'google.protobuf.Int32Value': case 'google.protobuf.Int64Value':
      case 'google.protobuf.UInt32Value': case 'google.protobuf.UInt64Value':
      case 'google.protobuf.FloatValue': case 'google.protobuf.DoubleValue': return 'number | undefined';
      case 'google.protobuf.StringValue': return 'string | undefined';
      case 'google.protobuf.BytesValue': return 'Uint8Array | undefined';
      default: return type;
    }
  })();
  if (repeated) return `${baseType}[]`;
  return baseType;
}

function generateOpenApiSpec(services: ProtoService[], messages: ProtoMessage[], enums: ProtoEnum[], title: string, version: string): object {
  const paths: Record<string, any> = {};
  const schemas: Record<string, any> = {};
  for (const msg of flattenMessages(messages)) {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const field of msg.fields) {
      if (field.map) {
        properties[field.name] = {
          type: 'object',
          additionalProperties: { $ref: `#/components/schemas/${field.mapValueType || 'string'}` },
        };
      } else if (field.repeated) {
        properties[field.name] = {
          type: 'array',
          items: protoTypeToOpenApi(field.type),
        };
      } else {
        properties[field.name] = protoTypeToOpenApi(field.type);
      }
      if (!field.repeated && !field.map) {
        required.push(field.name);
      }
    }
    schemas[msg.name] = {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }
  for (const e of enums) {
    schemas[e.name] = {
      type: 'string',
      enum: e.values.map(v => v.name),
    };
  }
  for (const service of services) {
    const servicePath = '/' + toKebabCase(service.name).replace(/-service$/, '');
    for (const method of service.methods) {
      const httpMethod = inferHttpMethod(method.name).toLowerCase();
      const resource = toKebabCase(extractResourceName(method.name));
      const isList = method.name.toLowerCase().startsWith('list') || method.name.toLowerCase().startsWith('search');
      const path = isList ? `${servicePath}/${resource}` : `${servicePath}/${resource}/{id}`;
      const operationId = `${service.name}_${method.name}`;
      const operation: any = {
        operationId,
        tags: [service.name],
        summary: method.name,
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${method.outputType}` },
              },
            },
          },
        },
      };
      if (httpMethod === 'get') {
        operation.parameters = isList
          ? [{ name: 'page', in: 'query', schema: { type: 'integer' } }, { name: 'pageSize', in: 'query', schema: { type: 'integer' } }]
          : [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }];
      } else if (httpMethod === 'delete') {
        operation.parameters = [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }];
      } else {
        operation.requestBody = {
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${method.inputType}` },
            },
          },
        };
      }
      if (!paths[path]) paths[path] = {};
      paths[path][httpMethod] = operation;
    }
  }
  return {
    openapi: '3.0.3',
    info: { title, version, description: 'Auto-generated from gRPC/Protobuf definition' },
    paths,
    components: { schemas },
  };
}

function protoTypeToOpenApi(type: string): any {
  switch (type) {
    case 'string': return { type: 'string' };
    case 'int32': case 'sint32': case 'sfixed32': case 'fixed32': case 'uint32': return { type: 'integer', format: 'int32' };
    case 'int64': case 'sint64': case 'sfixed64': case 'fixed64': case 'uint64': return { type: 'integer', format: 'int64' };
    case 'float': return { type: 'number', format: 'float' };
    case 'double': return { type: 'number', format: 'double' };
    case 'bool': return { type: 'boolean' };
    case 'bytes': return { type: 'string', format: 'byte' };
    case 'google.protobuf.Timestamp': return { type: 'string', format: 'date-time' };
    case 'google.protobuf.Duration': return { type: 'string' };
    case 'google.protobuf.Struct': return { type: 'object' };
    case 'google.protobuf.Any': return { type: 'object' };
    case 'google.protobuf.Empty': return {};
    case 'google.protobuf.Value': return {};
    case 'google.protobuf.ListValue': return { type: 'array', items: {} };
    default: return { $ref: `#/components/schemas/${type}` };
  }
}

function getWellKnownTypes(): WellKnownType[] {
  return [
    { fullName: 'google.protobuf.Timestamp', shortName: 'Timestamp', package: 'google.protobuf', description: 'Represents a point in time with nanosecond precision' },
    { fullName: 'google.protobuf.Duration', shortName: 'Duration', package: 'google.protobuf', description: 'Represents a signed span of time with nanosecond precision' },
    { fullName: 'google.protobuf.Any', shortName: 'Any', package: 'google.protobuf', description: 'Can represent any arbitrary message type with a type URL' },
    { fullName: 'google.protobuf.Struct', shortName: 'Struct', package: 'google.protobuf', description: 'Represents a structured data value with string keys' },
    { fullName: 'google.protobuf.Value', shortName: 'Value', package: 'google.protobuf', description: 'Represents a dynamically typed value' },
    { fullName: 'google.protobuf.ListValue', shortName: 'ListValue', package: 'google.protobuf', description: 'Represents a list of dynamically typed values' },
    { fullName: 'google.protobuf.NullValue', shortName: 'NullValue', package: 'google.protobuf', description: 'Represents a null value enum' },
    { fullName: 'google.protobuf.BoolValue', shortName: 'BoolValue', package: 'google.protobuf', description: 'Wrapper message for bool' },
    { fullName: 'google.protobuf.Int32Value', shortName: 'Int32Value', package: 'google.protobuf', description: 'Wrapper message for int32' },
    { fullName: 'google.protobuf.Int64Value', shortName: 'Int64Value', package: 'google.protobuf', description: 'Wrapper message for int64' },
    { fullName: 'google.protobuf.UInt32Value', shortName: 'UInt32Value', package: 'google.protobuf', description: 'Wrapper message for uint32' },
    { fullName: 'google.protobuf.UInt64Value', shortName: 'UInt64Value', package: 'google.protobuf', description: 'Wrapper message for uint64' },
    { fullName: 'google.protobuf.FloatValue', shortName: 'FloatValue', package: 'google.protobuf', description: 'Wrapper message for float' },
    { fullName: 'google.protobuf.DoubleValue', shortName: 'DoubleValue', package: 'google.protobuf', description: 'Wrapper message for double' },
    { fullName: 'google.protobuf.StringValue', shortName: 'StringValue', package: 'google.protobuf', description: 'Wrapper message for string' },
    { fullName: 'google.protobuf.BytesValue', shortName: 'BytesValue', package: 'google.protobuf', description: 'Wrapper message for bytes' },
    { fullName: 'google.protobuf.Empty', shortName: 'Empty', package: 'google.protobuf', description: 'A generic empty message' },
    { fullName: 'google.protobuf.FieldMask', shortName: 'FieldMask', package: 'google.protobuf', description: 'Represents a set of symbolic field paths' },
    { fullName: 'google.protobuf.Api', shortName: 'Api', package: 'google.protobuf', description: 'Represents a protocol buffer API type' },
    { fullName: 'google.protobuf.Type', shortName: 'Type', package: 'google.protobuf', description: 'Represents a protocol buffer message type' },
    { fullName: 'google.protobuf.Method', shortName: 'Method', package: 'google.protobuf', description: 'Represents a protocol buffer API method' },
    { fullName: 'google.protobuf.Mixin', shortName: 'Mixin', package: 'google.protobuf', description: 'Represents a protocol buffer API mixin' },
    { fullName: 'google.protobuf.SourceContext', shortName: 'SourceContext', package: 'google.protobuf', description: 'Represents a source code location' },
    { fullName: 'google.protobuf.Option', shortName: 'Option', package: 'google.protobuf', description: 'Represents a protocol buffer option' },
  ];
}

export default router;
