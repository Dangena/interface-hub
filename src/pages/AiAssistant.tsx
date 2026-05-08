import { useState } from 'react';
import { Bot, Send, FileText, TestTube2, BarChart3, Loader2, Copy, MessageSquare } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type TabType = 'chat' | 'doc' | 'test' | 'analyze';

const tabConfig: Record<TabType, { label: string; icon: typeof Bot; endpoint: string }> = {
  chat: { label: '对话', icon: MessageSquare, endpoint: '/ai/chat' },
  doc: { label: '生成文档', icon: FileText, endpoint: '/ai/generate-doc' },
  test: { label: '生成测试', icon: TestTube2, endpoint: '/ai/generate-test' },
  analyze: { label: '分析', icon: BarChart3, endpoint: '/ai/analyze' },
};

export default function AiAssistant() {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [context, setContext] = useState('');

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = { role: 'user', content: input, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const config = tabConfig[activeTab];
      const payload: Record<string, any> = { message: userMsg.content };
      if (context) payload.context = context;
      if (activeTab !== 'chat') payload.interfaceId = context;

      const data = await api.post(config.endpoint, payload);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.content || data.message || data.code || JSON.stringify(data, null, 2),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error: any) {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: `错误: ${error.message || '请求失败'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast('success', '已复制到剪贴板');
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <Bot className="w-8 h-8" />
          AI 助手
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          智能对话、文档生成、测试生成和接口分析
        </p>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {(Object.entries(tabConfig) as [TabType, typeof tabConfig.chat][]).map(([key, config]) => {
          const Icon = config.icon;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <Icon className="w-4 h-4" />
              {config.label}
            </button>
          );
        })}
        <button
          onClick={clearChat}
          className="ml-auto text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          清空对话
        </button>
      </div>

      {activeTab !== 'chat' && (
        <div className="mb-4">
          <input
            type="text"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            placeholder={
              activeTab === 'doc' ? '输入接口 ID 或名称用于生成文档...' :
              activeTab === 'test' ? '输入接口 ID 或名称用于生成测试...' :
              '输入接口 ID 或名称用于分析...'
            }
          />
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm flex flex-col" style={{ height: 'calc(100vh - 320px)' }}>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                {activeTab === 'chat' && '发送消息开始对话'}
                {activeTab === 'doc' && '输入接口信息生成文档'}
                {activeTab === 'test' && '输入接口信息生成测试用例'}
                {activeTab === 'analyze' && '输入接口信息进行分析'}
              </p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 whitespace-pre-wrap text-sm">{msg.content}</div>
                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => handleCopy(msg.content)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0"
                      title="复制"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                  {msg.timestamp.toLocaleTimeString('zh-CN')}
                </p>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
              placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="flex items-center justify-center w-10 h-10 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
