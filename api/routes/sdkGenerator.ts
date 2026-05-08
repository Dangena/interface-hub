import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query as dbQuery } from '../database.js';

const router = Router();

interface InterfaceDef {
  name: string;
  path: string;
  method: string;
  parameters?: Array<{
    name: string;
    location?: string;
    type?: string;
    required?: boolean;
    description?: string;
  }>;
  description?: string;
  tags?: string[];
}

interface GenerateOptions {
  baseUrl?: string;
  packageName?: string;
  className?: string;
}

const sdkStore = new Map<string, { code: string; template: string; className: string; createdAt: string }>();

const AVAILABLE_TEMPLATES = [
  { id: 'typescript-axios', name: 'TypeScript Axios', language: 'typescript', extension: 'ts' },
  { id: 'typescript-fetch', name: 'TypeScript Fetch', language: 'typescript', extension: 'ts' },
  { id: 'python-requests', name: 'Python Requests', language: 'python', extension: 'py' },
  { id: 'go-http', name: 'Go HTTP', language: 'go', extension: 'go' },
  { id: 'java-okhttp', name: 'Java OkHttp', language: 'java', extension: 'java' },
  { id: 'rust-reqwest', name: 'Rust Reqwest', language: 'rust', extension: 'rs' },
];

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase())
    .replace(/^[a-z]/, (chr: string) => chr.toUpperCase());
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase();
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();
}

function methodNameFromInterface(iface: InterfaceDef): string {
  const pathPart = iface.path
    .replace(/^\//, '')
    .replace(/[{}]/g, '')
    .replace(/[^a-zA-Z0-9/]/g, '/')
    .split('/')
    .filter(Boolean)
    .map((s, i) => i === 0 ? s.toLowerCase() : toPascalCase(s))
    .join('');
  return `${iface.method.toLowerCase()}${toPascalCase(pathPart)}`;
}

function paramTypeToTs(type?: string): string {
  switch (type) {
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'object': return 'Record<string, any>';
    case 'array': return 'any[]';
    default: return 'string';
  }
}

function paramTypeToPython(type?: string): string {
  switch (type) {
    case 'number': return 'float';
    case 'boolean': return 'bool';
    case 'object': return 'dict';
    case 'array': return 'list';
    default: return 'str';
  }
}

function paramTypeToGo(type?: string): string {
  switch (type) {
    case 'number': return 'float64';
    case 'boolean': return 'bool';
    case 'object': return 'map[string]interface{}';
    case 'array': return '[]interface{}';
    default: return 'string';
  }
}

function paramTypeToJava(type?: string): string {
  switch (type) {
    case 'number': return 'Double';
    case 'boolean': return 'Boolean';
    case 'object': return 'Map<String, Object>';
    case 'array': return 'List<Object>';
    default: return 'String';
  }
}

function paramTypeToRust(type?: string): string {
  switch (type) {
    case 'number': return 'f64';
    case 'boolean': return 'bool';
    case 'object': return 'serde_json::Value';
    case 'array': return 'Vec<serde_json::Value>';
    default: return 'String';
  }
}

function generateTypeScriptAxios(interfaces: InterfaceDef[], options: GenerateOptions): string {
  const className = options.className || 'ApiClient';
  const baseUrl = options.baseUrl || 'http://localhost:3000';

  const typeDefs = interfaces.map(iface => {
    const pascalName = toPascalCase(iface.name);
    const reqParams = (iface.parameters || []).filter(p => p.location === 'path' || p.location === 'query');
    const bodyParams = (iface.parameters || []).filter(p => p.location === 'body');
    const headerParams = (iface.parameters || []).filter(p => p.location === 'header');

    let reqType = `export interface ${pascalName}Request {\n`;
    for (const p of reqParams) {
      reqType += `  ${p.name}${p.required ? '' : '?'}: ${paramTypeToTs(p.type)};\n`;
    }
    for (const p of bodyParams) {
      reqType += `  ${p.name}${p.required ? '' : '?'}: ${paramTypeToTs(p.type)};\n`;
    }
    for (const p of headerParams) {
      reqType += `  ${p.name}${p.required ? '' : '?'}: ${paramTypeToTs(p.type)};\n`;
    }
    reqType += `}\n`;

    let resType = `export interface ${pascalName}Response {\n  data?: any;\n  error?: string;\n}\n`;

    return reqType + resType;
  }).join('\n');

  const methods = interfaces.map(iface => {
    const pascalName = toPascalCase(iface.name);
    const method = methodNameFromInterface(iface);
    const reqParams = (iface.parameters || []).filter(p => p.location === 'path' || p.location === 'query');
    const bodyParams = (iface.parameters || []).filter(p => p.location === 'body');
    const headerParams = (iface.parameters || []).filter(p => p.location === 'header');

    let pathTemplate = iface.path;
    const pathParams = reqParams.filter(p => p.location === 'path');
    const queryParams = reqParams.filter(p => p.location === 'query');

    for (const p of pathParams) {
      pathTemplate = pathTemplate.replace(`{${p.name}}`, `\${params.${p.name}}`);
    }

    const hasBody = ['POST', 'PUT', 'PATCH'].includes(iface.method.toUpperCase()) && bodyParams.length > 0;
    const hasQueryParams = queryParams.length > 0;
    const hasHeaders = headerParams.length > 0;

    let methodBody = '';

    if (hasQueryParams) {
      methodBody += `    const queryParams = new URLSearchParams();\n`;
      for (const p of queryParams) {
        methodBody += `    if (params.${p.name} !== undefined) queryParams.append('${p.name}', String(params.${p.name}));\n`;
      }
    }

    if (hasHeaders) {
      methodBody += `    const headers: Record<string, string> = {};\n`;
      for (const p of headerParams) {
        methodBody += `    if (params.${p.name} !== undefined) headers['${p.name}'] = String(params.${p.name});\n`;
      }
    }

    const axiosConfig: string[] = [];
    if (hasQueryParams) {
      axiosConfig.push(`params: Object.fromEntries(queryParams)`);
    }
    if (hasHeaders) {
      axiosConfig.push(`headers`);
    }
    if (hasBody) {
      axiosConfig.push(`data: params.${bodyParams[0].name}`);
    }

    const axiosCall = axiosConfig.length > 0
      ? `this.client.${iface.method.toLowerCase()}\`${pathTemplate}\`, { ${axiosConfig.join(', ')} }`
      : `this.client.${iface.method.toLowerCase()}\`${pathTemplate}\``;

    methodBody += `    try {\n`;
    methodBody += `      const response = await ${axiosCall};\n`;
    methodBody += `      return { data: response.data };\n`;
    methodBody += `    } catch (error: any) {\n`;
    methodBody += `      return { error: error.response?.data?.message || error.message || 'Request failed' };\n`;
    methodBody += `    }\n`;

    return `  async ${method}(params: ${pascalName}Request): Promise<${pascalName}Response> {\n${methodBody}  }`;
  }).join('\n\n');

  return `import axios, { AxiosInstance } from 'axios';

${typeDefs}

export class ${className} {
  private client: AxiosInstance;

  constructor(baseUrl: string = '${baseUrl}', apiKey?: string) {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': \`Bearer \${apiKey}\` } : {}),
      },
    });
  }

  setBaseUrl(baseUrl: string): void {
    this.client.defaults.baseURL = baseUrl;
  }

  setApiKey(apiKey: string): void {
    this.client.defaults.headers.common['Authorization'] = \`Bearer \${apiKey}\`;
  }

${methods}
}

export default ${className};
`;
}

function generateTypeScriptFetch(interfaces: InterfaceDef[], options: GenerateOptions): string {
  const className = options.className || 'ApiClient';
  const baseUrl = options.baseUrl || 'http://localhost:3000';

  const typeDefs = interfaces.map(iface => {
    const pascalName = toPascalCase(iface.name);
    const allParams = iface.parameters || [];
    let reqType = `export interface ${pascalName}Request {\n`;
    for (const p of allParams) {
      reqType += `  ${p.name}${p.required ? '' : '?'}: ${paramTypeToTs(p.type)};\n`;
    }
    reqType += `}\n`;
    let resType = `export interface ${pascalName}Response {\n  data?: any;\n  error?: string;\n}\n`;
    return reqType + resType;
  }).join('\n');

  const methods = interfaces.map(iface => {
    const pascalName = toPascalCase(iface.name);
    const method = methodNameFromInterface(iface);
    const allParams = iface.parameters || [];
    const pathParams = allParams.filter(p => p.location === 'path');
    const queryParams = allParams.filter(p => p.location === 'query');
    const bodyParams = allParams.filter(p => p.location === 'body');
    const headerParams = allParams.filter(p => p.location === 'header');

    let pathTemplate = iface.path;
    for (const p of pathParams) {
      pathTemplate = pathTemplate.replace(`{${p.name}}`, `\${params.${p.name}}`);
    }

    let methodBody = `    const url = new URL(\`${pathTemplate}\`, this.baseUrl);\n`;

    if (queryParams.length > 0) {
      methodBody += `    if (params) {\n`;
      for (const p of queryParams) {
        methodBody += `      if (params.${p.name} !== undefined) url.searchParams.append('${p.name}', String(params.${p.name}));\n`;
      }
      methodBody += `    }\n`;
    }

    const headers: string[] = [`'Content-Type': 'application/json'`];
    if (headerParams.length > 0) {
      for (const p of headerParams) {
        methodBody += `    const ${p.name}Header = params?.${p.name} !== undefined ? String(params.${p.name}) : undefined;\n`;
        headers.push(`...(${p.name}Header ? { '${p.name}': ${p.name}Header } : {})`);
      }
    }
    if (this.apiKey) {
      headers.push(`'Authorization': \`Bearer \${this.apiKey}\``);
    }

    const hasBody = ['POST', 'PUT', 'PATCH'].includes(iface.method.toUpperCase()) && bodyParams.length > 0;
    const fetchOptions = `method: '${iface.method.toUpperCase()}',\n      headers: { ${headers.join(', ')} }${hasBody ? `,\n      body: JSON.stringify(params.${bodyParams[0].name})` : ''}`;

    methodBody += `    try {\n`;
    methodBody += `      const response = await fetch(url.toString(), {\n        ${fetchOptions}\n      });\n`;
    methodBody += `      if (!response.ok) {\n`;
    methodBody += `        const errorBody = await response.text();\n`;
    methodBody += `        return { error: \`HTTP \${response.status}: \${errorBody}\` };\n`;
    methodBody += `      }\n`;
    methodBody += `      const data = await response.json();\n`;
    methodBody += `      return { data };\n`;
    methodBody += `    } catch (error: any) {\n`;
    methodBody += `      return { error: error.message || 'Request failed' };\n`;
    methodBody += `    }\n`;

    return `  async ${method}(params: ${pascalName}Request): Promise<${pascalName}Response> {\n${methodBody}  }`;
  }).join('\n\n');

  return `${typeDefs}

export class ${className} {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string = '${baseUrl}', apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

${methods}
}

export default ${className};
`;
}

function generatePythonRequests(interfaces: InterfaceDef[], options: GenerateOptions): string {
  const className = options.className || 'ApiClient';
  const baseUrl = options.baseUrl || 'http://localhost:3000';
  const packageName = options.packageName || 'api_client';

  const methodDefs = interfaces.map(iface => {
    const method = methodNameFromInterface(iface);
    const allParams = iface.parameters || [];
    const pathParams = allParams.filter(p => p.location === 'path');
    const queryParams = allParams.filter(p => p.location === 'query');
    const bodyParams = allParams.filter(p => p.location === 'body');
    const headerParams = allParams.filter(p => p.location === 'header');

    let pathTemplate = iface.path;
    for (const p of pathParams) {
      pathTemplate = pathTemplate.replace(`{${p.name}}`, `{${p.name}}`);
    }

    const paramList = allParams.map(p =>
      `${p.name}: ${paramTypeToPython(p.type)}${p.required ? '' : ' = None'}`
    ).join(', ');

    let body = `        url = f"${pathTemplate}"\n`;

    if (queryParams.length > 0) {
      body += `        params = {}\n`;
      for (const p of queryParams) {
        body += `        if ${p.name} is not None:\n            params["${p.name}"] = ${p.name}\n`;
      }
    }

    if (headerParams.length > 0) {
      body += `        headers = {}\n`;
      for (const p of headerParams) {
        body += `        if ${p.name} is not None:\n            headers["${p.name}"] = str(${p.name})\n`;
      }
    }

    const kwargs: string[] = [];
    if (queryParams.length > 0) kwargs.push('params=params');
    if (headerParams.length > 0) kwargs.push('headers=headers');
    if (bodyParams.length > 0) kwargs.push(`json=${bodyParams[0].name}`);

    const httpMethod = iface.method.toLowerCase();
    body += `        try:\n`;
    body += `            response = self.client.${httpMethod}(url${kwargs.length > 0 ? ', ' + kwargs.join(', ') : ''})\n`;
    body += `            response.raise_for_status()\n`;
    body += `            return response.json()\n`;
    body += `        except requests.exceptions.HTTPError as e:\n`;
    body += `            raise Exception(f"HTTP error: {e.response.status_code} - {e.response.text}") from e\n`;
    body += `        except requests.exceptions.RequestException as e:\n`;
    body += `            raise Exception(f"Request failed: {str(e)}") from e\n`;

    const docstring = iface.description ? `        """${iface.description}"""\n` : '';

    return `    def ${method}(self, ${paramList || '**kwargs'}):\n${docstring}${body}`;
  }).join('\n');

  return `"""${packageName} - Auto-generated API client"""

import requests
from typing import Any, Dict, List, Optional


class ${className}:
    """Auto-generated API client for Interface Hub."""

    def __init__(self, base_url: str = "${baseUrl}", api_key: Optional[str] = None):
        self.base_url = base_url
        self.client = requests.Session()
        self.client.headers.update({"Content-Type": "application/json"})
        if api_key:
            self.client.headers.update({"Authorization": f"Bearer {api_key}"})

    def set_base_url(self, base_url: str) -> None:
        self.base_url = base_url

    def set_api_key(self, api_key: str) -> None:
        self.client.headers.update({"Authorization": f"Bearer {api_key}"})

${methodDefs}
`;
}

function generateGoHttp(interfaces: InterfaceDef[], options: GenerateOptions): string {
  const className = options.className || 'APIClient';
  const structName = className;
  const packageName = options.packageName || 'apiclient';
  const baseUrl = options.baseUrl || 'http://localhost:3000';

  const methodDefs = interfaces.map(iface => {
    const method = toPascalCase(methodNameFromInterface(iface));
    const allParams = iface.parameters || [];
    const pathParams = allParams.filter(p => p.location === 'path');
    const queryParams = allParams.filter(p => p.location === 'query');
    const bodyParams = allParams.filter(p => p.location === 'body');
    const headerParams = allParams.filter(p => p.location === 'header');

    let pathTemplate = iface.path;
    for (const p of pathParams) {
      pathTemplate = pathTemplate.replace(`{${p.name}}`, `%v`);
    }

    const goParams = allParams.map(p =>
      `${p.name} ${paramTypeToGo(p.type)}`
    ).join(', ');

    const pathArgs = pathParams.map(p => p.name).join(', ');

    let body = '';

    if (pathParams.length > 0) {
      body += `\turl := fmt.Sprintf("${pathTemplate}", ${pathArgs})\n`;
    } else {
      body += `\turl := "${pathTemplate}"\n`;
    }

    if (queryParams.length > 0) {
      body += `\tq := url.Values{}\n`;
      for (const p of queryParams) {
        body += `\tif ${p.name} != "" {\n\t\tq.Set("${p.name}", fmt.Sprintf("%v", ${p.name}))\n\t}\n`;
      }
      body += `\turl = url + "?" + q.Encode()\n`;
    }

    const hasBody = ['POST', 'PUT', 'PATCH'].includes(iface.method.toUpperCase()) && bodyParams.length > 0;

    if (hasBody) {
      body += `\tbodyBytes, err := json.Marshal(${bodyParams[0].name})\n\tif err != nil {\n\t\treturn nil, fmt.Errorf("failed to marshal body: %w", err)\n\t}\n`;
      body += `\treq, err := http.NewRequest("${iface.method.toUpperCase()}", c.BaseURL+url, bytes.NewBuffer(bodyBytes))\n`;
    } else {
      body += `\treq, err := http.NewRequest("${iface.method.toUpperCase()}", c.BaseURL+url, nil)\n`;
    }

    body += `\tif err != nil {\n\t\treturn nil, fmt.Errorf("failed to create request: %w", err)\n\t}\n`;
    body += `\treq.Header.Set("Content-Type", "application/json")\n`;

    for (const p of headerParams) {
      body += `\tif ${p.name} != "" {\n\t\treq.Header.Set("${p.name}", ${p.name})\n\t}\n`;
    }

    body += `\tif c.APIKey != "" {\n\t\treq.Header.Set("Authorization", "Bearer "+c.APIKey)\n\t}\n`;
    body += `\tresp, err := c.Client.Do(req)\n\tif err != nil {\n\t\treturn nil, fmt.Errorf("request failed: %w", err)\n\t}\n\tdefer resp.Body.Close()\n`;
    body += `\tif resp.StatusCode >= 400 {\n\t\tbody, _ := io.ReadAll(resp.Body)\n\t\treturn nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))\n\t}\n`;
    body += `\tvar result interface{}\n\tif err := json.NewDecoder(resp.Body).Decode(&result); err != nil {\n\t\treturn nil, fmt.Errorf("failed to decode response: %w", err)\n\t}\n\treturn result, nil\n`;

    const docComment = iface.description ? `// ${method} ${iface.description}\n` : `// ${method} auto-generated method\n`;

    return `${docComment}func (c *${structName}) ${method}(${goParams}) (interface{}, error) {\n${body}}`;
  }).join('\n\n');

  return `package ${packageName}

import (
\t"bytes"
\t"encoding/json"
\t"fmt"
\t"io"
\t"net/http"
\t"net/url"
)

type ${structName} struct {
\tClient  *http.Client
\tBaseURL string
\tAPIKey  string
}

func New${structName}(baseURL string) *${structName} {
\tif baseURL == "" {
\t\tbaseURL = "${baseUrl}"
\t}
\treturn &${structName}{
\t\tClient:  &http.Client{},
\t\tBaseURL: baseURL,
\t}
}

func (c *${structName}) SetAPIKey(apiKey string) {
\tc.APIKey = apiKey
}

${methodDefs}
`;
}

function generateJavaOkHttp(interfaces: InterfaceDef[], options: GenerateOptions): string {
  const className = options.className || 'ApiClient';
  const packageName = options.packageName || 'com.interfacehub.sdk';
  const baseUrl = options.baseUrl || 'http://localhost:3000';

  const methodDefs = interfaces.map(iface => {
    const method = toCamelCase(methodNameFromInterface(iface));
    const allParams = iface.parameters || [];
    const pathParams = allParams.filter(p => p.location === 'path');
    const queryParams = allParams.filter(p => p.location === 'query');
    const bodyParams = allParams.filter(p => p.location === 'body');
    const headerParams = allParams.filter(p => p.location === 'header');

    let pathTemplate = iface.path;
    for (const p of pathParams) {
      pathTemplate = pathTemplate.replace(`{${p.name}}`, `" + ${p.name} + "`);
    }

    const javaParams = allParams.map(p =>
      `${paramTypeToJava(p.type)} ${p.name}`
    ).join(', ');

    let body = '';

    body += `        HttpUrl.Builder urlBuilder = HttpUrl.parse(this.baseUrl + "${pathTemplate}").newBuilder();\n`;

    for (const p of queryParams) {
      body += `        if (${p.name} != null) urlBuilder.addQueryParameter("${p.name}", String.valueOf(${p.name}));\n`;
    }

    const hasBody = ['POST', 'PUT', 'PATCH'].includes(iface.method.toUpperCase()) && bodyParams.length > 0;

    if (hasBody) {
      body += `        String jsonBody = objectMapper.writeValueAsString(${bodyParams[0].name});\n`;
      body += `        RequestBody requestBody = RequestBody.create(jsonBody, MediaType.parse("application/json"));\n`;
    }

    body += `        Request.Builder requestBuilder = new Request.Builder()\n`;
    body += `                .url(urlBuilder.build())\n`;

    if (hasBody) {
      body += `                .${iface.method.toLowerCase()}(requestBody);\n`;
    } else {
      body += `                .${iface.method.toLowerCase()}();\n`;
    }

    for (const p of headerParams) {
      body += `        if (${p.name} != null) requestBuilder.addHeader("${p.name}", ${p.name});\n`;
    }

    body += `        if (this.apiKey != null) requestBuilder.addHeader("Authorization", "Bearer " + this.apiKey);\n`;

    body += `        try (Response response = client.newCall(requestBuilder.build()).execute()) {\n`;
    body += `            if (!response.isSuccessful()) {\n`;
    body += `                String errorBody = response.body() != null ? response.body().string() : "Unknown error";\n`;
    body += `                throw new RuntimeException("HTTP " + response.code() + ": " + errorBody);\n`;
    body += `            }\n`;
    body += `            String responseBody = response.body() != null ? response.body().string() : "{}";\n`;
    body += `            return objectMapper.readValue(responseBody, Object.class);\n`;
    body += `        } catch (IOException e) {\n`;
    body += `            throw new RuntimeException("Request failed: " + e.getMessage(), e);\n`;
    body += `        }\n`;

    const docComment = iface.description
      ? `    /**\n     * ${iface.description}\n     */\n`
      : '';

    return `${docComment}    public Object ${method}(${javaParams}) throws Exception {\n${body}    }`;
  }).join('\n\n');

  return `package ${packageName};

import okhttp3.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;

public class ${className} {

    private final OkHttpClient client;
    private final String baseUrl;
    private String apiKey;
    private final ObjectMapper objectMapper;

    public ${className}() {
        this("${baseUrl}");
    }

    public ${className}(String baseUrl) {
        this.client = new OkHttpClient();
        this.baseUrl = baseUrl != null ? baseUrl : "${baseUrl}";
        this.objectMapper = new ObjectMapper();
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

${methodDefs}
}
`;
}

function generateRustReqwest(interfaces: InterfaceDef[], options: GenerateOptions): string {
  const structName = toPascalCase(options.className || 'ApiClient');
  const packageName = options.packageName || 'api_client';
  const baseUrl = options.baseUrl || 'http://localhost:3000';

  const methodDefs = interfaces.map(iface => {
    const method = toSnakeCase(methodNameFromInterface(iface));
    const allParams = iface.parameters || [];
    const pathParams = allParams.filter(p => p.location === 'path');
    const queryParams = allParams.filter(p => p.location === 'query');
    const bodyParams = allParams.filter(p => p.location === 'body');
    const headerParams = allParams.filter(p => p.location === 'header');

    let pathTemplate = iface.path;
    for (const p of pathParams) {
      pathTemplate = pathTemplate.replace(`{${p.name}}`, `{}`);
    }

    const rustParams = allParams.map(p =>
      `${p.name}: ${paramTypeToRust(p.type)}`
    ).join(', ');

    const pathArgs = pathParams.map(p => {
      if (p.type === 'number') return `*${p.name} as f64`;
      return `&${p.name}`;
    }).join(', ');

    let body = '';

    if (pathParams.length > 0) {
      body += `        let url = format!("${pathTemplate}", ${pathArgs});\n`;
    } else {
      body += `        let url = "${pathTemplate}".to_string();\n`;
    }

    body += `        let full_url = format!("{}{}", self.base_url, url);\n`;

    const hasBody = ['POST', 'PUT', 'PATCH'].includes(iface.method.toUpperCase()) && bodyParams.length > 0;

    let requestBuilder = '';
    switch (iface.method.toUpperCase()) {
      case 'GET': requestBuilder = 'client.get(&full_url)'; break;
      case 'POST': requestBuilder = 'client.post(&full_url)'; break;
      case 'PUT': requestBuilder = 'client.put(&full_url)'; break;
      case 'DELETE': requestBuilder = 'client.delete(&full_url)'; break;
      case 'PATCH': requestBuilder = 'client.patch(&full_url)'; break;
      default: requestBuilder = 'client.get(&full_url)';
    }

    body += `        let client = reqwest::Client::new();\n`;
    body += `        let mut request = ${requestBuilder}\n`;
    body += `            .header("Content-Type", "application/json");\n`;

    if (queryParams.length > 0) {
      for (const p of queryParams) {
        body += `        request = request.query(&[("${p.name}", &${p.name}.to_string())]);\n`;
      }
    }

    for (const p of headerParams) {
      body += `        request = request.header("${p.name}", &${p.name});\n`;
    }

    if (hasBody) {
      body += `        request = request.json(&${bodyParams[0].name});\n`;
    }

    body += `        if let Some(ref api_key) = self.api_key {\n`;
    body += `            request = request.header("Authorization", format!("Bearer {}", api_key));\n`;
    body += `        }\n`;

    body += `        let response = request.send().await?;\n`;
    body += `        if !response.status().is_success() {\n`;
    body += `            let status = response.status();\n`;
    body += `            let error_body = response.text().await.unwrap_or_default();\n`;
    body += `            return Err(format!("HTTP {}: {}", status, error_body).into());\n`;
    body += `        }\n`;
    body += `        let result: serde_json::Value = response.json().await?;\n`;
    body += `        Ok(result)\n`;

    const docComment = iface.description ? `    /// ${iface.description}\n` : '';

    return `${docComment}    pub async fn ${method}(&self, ${rustParams}) -> Result<serde_json::Value, Box<dyn std::error::Error>> {\n${body}    }`;
  }).join('\n\n');

  return `use reqwest;
use serde_json;

pub struct ${structName} {
    base_url: String,
    api_key: Option<String>,
}

impl ${structName} {
    pub fn new(base_url: &str) -> Self {
        ${structName} {
            base_url: if base_url.is_empty() { "${baseUrl}".to_string() } else { base_url.to_string() },
            api_key: None,
        }
    }

    pub fn set_api_key(&mut self, api_key: &str) {
        self.api_key = Some(api_key.to_string());
    }

${methodDefs}
}
`;
}

function generateSdk(template: string, interfaces: InterfaceDef[], options: GenerateOptions): string {
  switch (template) {
    case 'typescript-axios':
      return generateTypeScriptAxios(interfaces, options);
    case 'typescript-fetch':
      return generateTypeScriptFetch(interfaces, options);
    case 'python-requests':
      return generatePythonRequests(interfaces, options);
    case 'go-http':
      return generateGoHttp(interfaces, options);
    case 'java-okhttp':
      return generateJavaOkHttp(interfaces, options);
    case 'rust-reqwest':
      return generateRustReqwest(interfaces, options);
    default:
      throw new Error(`Unknown template: ${template}`);
  }
}

router.get('/templates', (_req, res) => {
  res.json({
    templates: AVAILABLE_TEMPLATES,
  });
});

router.post('/generate', (req, res) => {
  try {
    const { interfaces, template, options } = req.body as {
      interfaces: InterfaceDef[];
      template: string;
      options?: GenerateOptions;
    };

    if (!interfaces || !Array.isArray(interfaces) || interfaces.length === 0) {
      return res.status(400).json({ error: 'interfaces array is required and must not be empty' });
    }

    if (!template) {
      return res.status(400).json({ error: 'template is required' });
    }

    const templateInfo = AVAILABLE_TEMPLATES.find(t => t.id === template);
    if (!templateInfo) {
      return res.status(400).json({ error: `Invalid template. Available: ${AVAILABLE_TEMPLATES.map(t => t.id).join(', ')}` });
    }

    for (const iface of interfaces) {
      if (!iface.name || !iface.path || !iface.method) {
        return res.status(400).json({ error: 'Each interface must have name, path, and method' });
      }
    }

    const opts: GenerateOptions = options || {};
    const code = generateSdk(template, interfaces, opts);

    const id = uuidv4();
    const className = opts.className || 'ApiClient';
    sdkStore.set(id, {
      code,
      template,
      className,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      id,
      template,
      className,
      code,
      interfaceCount: interfaces.length,
      createdAt: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate SDK' });
  }
});

router.post('/generate-from-db', async (req, res) => {
  try {
    const { template, options, category, project } = req.body as {
      template: string;
      options?: GenerateOptions;
      category?: string;
      project?: string;
    };

    if (!template) {
      return res.status(400).json({ error: 'template is required' });
    }

    const templateInfo = AVAILABLE_TEMPLATES.find(t => t.id === template);
    if (!templateInfo) {
      return res.status(400).json({ error: `Invalid template. Available: ${AVAILABLE_TEMPLATES.map(t => t.id).join(', ')}` });
    }

    let sqlQuery = 'SELECT i.*, p.id as param_id, p.name as param_name, p.location as param_location, p.type as param_type, p.required as param_required, p.description as param_description FROM interfaces i LEFT JOIN parameters p ON i.id = p.interface_id WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (category) {
      sqlQuery += ` AND i.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (project) {
      sqlQuery += ` AND i.tags LIKE $${paramIndex}`;
      params.push(`%"${project}"%`);
      paramIndex++;
    }

    sqlQuery += ' ORDER BY i.name, p.location';

    const rows = (await dbQuery(sqlQuery, params)).rows as any[];

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No interfaces found matching the criteria' });
    }

    const interfaceMap = new Map<string, InterfaceDef>();

    for (const row of rows) {
      if (!interfaceMap.has(row.id)) {
        const tags = row.tags ? JSON.parse(row.tags) : [];
        interfaceMap.set(row.id, {
          name: row.name,
          path: row.path,
          method: row.method,
          description: row.description || '',
          tags,
          parameters: [],
        });
      }

      if (row.param_id) {
        const iface = interfaceMap.get(row.id)!;
        iface.parameters!.push({
          name: row.param_name,
          location: row.param_location,
          type: row.param_type,
          required: Boolean(row.param_required),
          description: row.param_description || '',
        });
      }
    }

    const interfaces = Array.from(interfaceMap.values());

    const opts: GenerateOptions = options || {};
    const code = generateSdk(template, interfaces, opts);

    const id = uuidv4();
    const className = opts.className || 'ApiClient';
    sdkStore.set(id, {
      code,
      template,
      className,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      id,
      template,
      className,
      code,
      interfaceCount: interfaces.length,
      createdAt: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate SDK from database' });
  }
});

router.get('/download/:id', (req, res) => {
  try {
    const { id } = req.params;
    const sdk = sdkStore.get(id);

    if (!sdk) {
      return res.status(404).json({ error: 'SDK not found. It may have expired or the ID is invalid.' });
    }

    const templateInfo = AVAILABLE_TEMPLATES.find(t => t.id === sdk.template);
    const extension = templateInfo?.extension || 'txt';
    const filename = `${toKebabCase(sdk.className)}-sdk.${extension}`;

    const contentTypes: Record<string, string> = {
      'typescript-axios': 'text/typescript',
      'typescript-fetch': 'text/typescript',
      'python-requests': 'text/x-python',
      'go-http': 'text/plain',
      'java-okhttp': 'text/plain',
      'rust-reqwest': 'text/plain',
    };

    res.setHeader('Content-Type', contentTypes[sdk.template] || 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(sdk.code);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to download SDK' });
  }
});

export default router;
