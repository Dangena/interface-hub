import { useState } from 'react';
import { FileCode, Upload, Copy, Check, X } from 'lucide-react';
import api from '../services/api';

interface ParsedInterface {
  name: string;
  path: string;
  method: string;
  description: string;
  parameters: Array<{
    name: string;
    location: string;
    type: string;
    required: boolean;
  }>;
  tags: string[];
}

interface ParsedModel {
  name: string;
  fields: Array<{
    name: string;
    type: string;
    nullable: boolean;
    comment?: string;
  }>;
}

export default function CodeParser() {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState<'java' | 'node' | 'python' | 'go'>('java');
  const [parsedInterfaces, setParsedInterfaces] = useState<ParsedInterface[]>([]);
  const [parsedModels, setParsedModels] = useState<ParsedModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [selectedInterfaces, setSelectedInterfaces] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);

  const handleParse = async () => {
    if (!code.trim()) {
      alert('请输入代码');
      return;
    }

    setLoading(true);
    try {
      const result = await api.post(`/parser/parse/${language}`, { code });
      setParsedInterfaces(result.interfaces || []);
      setParsedModels(result.models || []);
      setSelectedInterfaces(result.interfaces?.map((i: any) => i.name) || []);
      setSelectedModels(result.models?.map((m: any) => m.name) || []);
    } catch (error) {
      alert('解析失败');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (selectedInterfaces.length === 0 && selectedModels.length === 0) {
      alert('请选择要导入的接口或模型');
      return;
    }

    const interfacesToImport = parsedInterfaces.filter(i => selectedInterfaces.includes(i.name));
    const modelsToImport = parsedModels.filter(m => selectedModels.includes(m.name));

    try {
      await api.post('/parser/import/parsed', {
        interfaces: interfacesToImport,
        models: modelsToImport,
      });
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 2000);
    } catch (error) {
      alert('导入失败');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCode(content);
      
      const filename = files[0].name;
      if (filename.endsWith('.java')) {
        setLanguage('java');
      } else if (filename.endsWith('.js') || filename.endsWith('.ts')) {
        setLanguage('node');
      }
    };
    reader.readAsText(files[0]);
  };

  const toggleInterface = (name: string) => {
    setSelectedInterfaces(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const toggleModel = (name: string) => {
    setSelectedModels(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const selectAllInterfaces = () => {
    setSelectedInterfaces(parsedInterfaces.map(i => i.name));
  };

  const selectAllModels = () => {
    setSelectedModels(parsedModels.map(m => m.name));
  };

  const methodColors: Record<string, string> = {
    GET: 'bg-green-100 text-green-700',
    POST: 'bg-blue-100 text-blue-700',
    PUT: 'bg-yellow-100 text-yellow-700',
    DELETE: 'bg-red-100 text-red-700',
    PATCH: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="p-8">
      {importSuccess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">导入成功!</h3>
            <p className="text-gray-600 dark:text-gray-400">数据已成功导入到系统中</p>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">代码解析器</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          从Java/Spring Boot、Node.js/Express、Python/Flask或Go代码中自动提取接口和数据模型
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <FileCode className="w-5 h-5 text-blue-600" />
            代码输入
          </h3>

          <div className="mb-4">
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setLanguage('java')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  language === 'java'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Java / Spring Boot
              </button>
              <button
                onClick={() => setLanguage('node')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  language === 'node'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Node.js / Express
              </button>
              <button
                onClick={() => setLanguage('python')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  language === 'python'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Python / Flask
              </button>
              <button
                onClick={() => setLanguage('go')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  language === 'go'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Go / Gin
              </button>
            </div>
          </div>

          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg mb-4">
            <input
              type="file"
              accept=".java,.js,.ts,.py,.go"
              onChange={handleFileUpload}
              className="hidden"
              id="code-file"
            />
            <label htmlFor="code-file" className="cursor-pointer block p-4 text-center">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400">点击上传代码文件</p>
              <p className="text-sm text-gray-400 mt-1">支持 .java, .js, .ts, .py, .go 文件</p>
            </label>
          </div>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={15}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
            placeholder={language === 'java' 
              ? '@RestController\npublic class UserController {\n\n    @GetMapping("/api/users")\n    public List<User> getUsers() {\n        // ...\n    }\n\n    @PostMapping("/api/users")\n    public User createUser(@RequestBody UserDTO user) {\n        // ...\n    }\n}' 
              : language === 'python'
              ? '@app.route("/api/users", methods=["GET"])\ndef get_users():\n    """Get all users"""\n    return jsonify(users)\n\n@app.route("/api/users", methods=["POST"])\ndef create_user():\n    data = request.get_json()\n    return jsonify(data)'
              : language === 'go'
              ? 'r := mux.NewRouter()\nr.HandleFunc("/api/users", GetUsers).Methods("GET")\nr.HandleFunc("/api/users", CreateUser).Methods("POST")\n\ntype User struct {\n    ID    int    `json:"id"`\n    Name  string `json:"name"`\n    Email string `json:"email"`\n}'
              : "router.get('/api/users', async (req, res) => {\n  // ...\n});\n\nrouter.post('/api/users', async (req, res) => {\n  // ...\n});"}
          />

          <button
            onClick={handleParse}
            disabled={loading || !code.trim()}
            className="mt-4 w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <FileCode className="w-5 h-5" />
            {loading ? '解析中...' : '解析代码'}
          </button>
        </div>

        <div className="space-y-6">
          {parsedInterfaces.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">解析出的接口</h3>
                <button
                  onClick={selectAllInterfaces}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  全选
                </button>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto">
                {parsedInterfaces.map((iface) => (
                  <div
                    key={iface.name}
                    className={`p-4 rounded-lg border transition-colors ${
                      selectedInterfaces.includes(iface.name)
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedInterfaces.includes(iface.name)}
                        onChange={() => toggleInterface(iface.name)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${methodColors[iface.method]}`}>
                            {iface.method}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-white">{iface.path}</span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{iface.name}</p>
                        {iface.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{iface.description}</p>
                        )}
                        {iface.parameters.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {iface.parameters.map((param) => (
                              <span
                                key={param.name}
                                className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded"
                              >
                                {param.location}:{param.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {parsedModels.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">解析出的数据模型</h3>
                <button
                  onClick={selectAllModels}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  全选
                </button>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto">
                {parsedModels.map((model) => (
                  <div
                    key={model.name}
                    className={`p-4 rounded-lg border transition-colors ${
                      selectedModels.includes(model.name)
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedModels.includes(model.name)}
                        onChange={() => toggleModel(model.name)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white">{model.name}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {model.fields.map((field) => (
                            <span
                              key={field.name}
                              className={`text-xs px-2 py-1 rounded ${field.nullable ? 'bg-gray-100 dark:bg-gray-700' : 'bg-yellow-100 dark:bg-yellow-900/20'}`}
                            >
                              {field.name}:{field.type}
                            </span>
                          ))}
                        </div>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(parsedInterfaces.length > 0 || parsedModels.length > 0) && (
            <button
              onClick={handleImport}
              className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
            >
              <Upload className="w-5 h-5" />
              导入到系统
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
