import { useState } from 'react';
import { FileCode2, Play, Code2, FileText, Braces, ArrowRight, Copy, RefreshCw } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface ParsedService {
  name: string;
  methods: { name: string; inputType: string; outputType: string }[];
}

interface ParsedMessage {
  name: string;
  fields: { name: string; type: string; number: number }[];
}

interface ParsedEnum {
  name: string;
  values: { name: string; number: number }[];
}

interface ParsedResult {
  services: ParsedService[];
  messages: ParsedMessage[];
  enums: ParsedEnum[];
}

export default function GrpcManager() {
  const [protoContent, setProtoContent] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [generateType, setGenerateType] = useState<string>('');

  const handleParse = async () => {
    if (!protoContent.trim()) {
      toast('error', '请输入 .proto 内容');
      return;
    }
    setParsing(true);
    setParsed(null);
    setGeneratedCode('');
    try {
      const data = await api.post('/grpc/parse', { content: protoContent });
      setParsed(data);
      toast('success', '解析成功');
    } catch (error: any) {
      toast('error', error.message || '解析失败');
    } finally {
      setParsing(false);
    }
  };

  const handleGenerate = async (type: string) => {
    if (!parsed) {
      toast('error', '请先解析 .proto 文件');
      return;
    }
    setGenerating(true);
    setGenerateType(type);
    setGeneratedCode('');
    try {
      const data = await api.post(`/grpc/generate/${type}`, { content: protoContent });
      setGeneratedCode(data.code || data.content || JSON.stringify(data, null, 2));
      toast('success', '生成成功');
    } catch (error: any) {
      toast('error', error.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast('success', '已复制到剪贴板');
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <FileCode2 className="w-8 h-8" />
          gRPC / Protobuf
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          解析 .proto 文件，生成 REST/TypeScript/OpenAPI 定义
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Code2 className="w-5 h-5" />
                .proto 内容
              </h2>
              <button
                onClick={handleParse}
                disabled={parsing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Play className={`w-4 h-4 ${parsing ? 'animate-spin' : ''}`} />
                {parsing ? '解析中...' : '解析'}
              </button>
            </div>
            <textarea
              value={protoContent}
              onChange={(e) => setProtoContent(e.target.value)}
              rows={16}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
              placeholder={`syntax = "proto3";\n\npackage example;\n\nservice Greeter {\n  rpc SayHello (HelloRequest) returns (HelloReply);\n}\n\nmessage HelloRequest {\n  string name = 1;\n}\n\nmessage HelloReply {\n  string message = 1;\n}`}
            />
          </div>

          {parsed && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleGenerate('rest')}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
                {generating && generateType === 'rest' ? '生成中...' : '生成 REST'}
              </button>
              <button
                onClick={() => handleGenerate('typescript')}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <FileText className="w-4 h-4" />
                {generating && generateType === 'typescript' ? '生成中...' : '生成 TypeScript'}
              </button>
              <button
                onClick={() => handleGenerate('openapi')}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                <Braces className="w-4 h-4" />
                {generating && generateType === 'openapi' ? '生成中...' : '生成 OpenAPI'}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {parsed && (
            <>
              {parsed.services.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Play className="w-5 h-5 text-blue-600" />
                    Services
                  </h3>
                  <div className="space-y-3">
                    {parsed.services.map((svc) => (
                      <div key={svc.name} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                        <p className="font-medium text-gray-900 dark:text-white mb-2">{svc.name}</p>
                        {svc.methods.map((m) => (
                          <div key={m.name} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 ml-4">
                            <ArrowRight className="w-3 h-3" />
                            <span className="font-medium">{m.name}</span>
                            <span className="text-gray-400">({m.inputType}) → {m.outputType}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {parsed.messages.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Braces className="w-5 h-5 text-green-600" />
                    Messages
                  </h3>
                  <div className="space-y-3">
                    {parsed.messages.map((msg) => (
                      <div key={msg.name} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                        <p className="font-medium text-gray-900 dark:text-white mb-2">{msg.name}</p>
                        {msg.fields.map((f) => (
                          <div key={f.name} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 ml-4">
                            <span className="text-gray-400 w-6 text-right">{f.number}</span>
                            <span className="font-mono text-blue-600 dark:text-blue-400">{f.type}</span>
                            <span>{f.name}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {parsed.enums.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-purple-600" />
                    Enums
                  </h3>
                  <div className="space-y-3">
                    {parsed.enums.map((en) => (
                      <div key={en.name} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                        <p className="font-medium text-gray-900 dark:text-white mb-2">{en.name}</p>
                        {en.values.map((v) => (
                          <div key={v.name} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 ml-4">
                            <span className="text-gray-400 w-6 text-right">{v.number}</span>
                            <span>{v.name}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {generatedCode && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">生成结果</h3>
                <button
                  onClick={() => handleCopy(generatedCode)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  <Copy className="w-4 h-4" />
                  复制
                </button>
              </div>
              <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-sm text-gray-800 dark:text-gray-200 overflow-x-auto font-mono whitespace-pre-wrap max-h-96">
                {generatedCode}
              </pre>
            </div>
          )}

          {!parsed && !generatedCode && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
              <FileCode2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">输入 .proto 内容并点击解析</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
