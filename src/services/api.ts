const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
const TIMEOUT_MS = 30000;

async function fetchApi(endpoint: string, options?: RequestInit) {
  const token = localStorage.getItem('token');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      throw new Error('登录已过期，请重新登录');
    }

    if (!response.ok) {
      let errorMsg = `请求失败 (${response.status})`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }

    return response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试');
    }
    throw error;
  }
}

async function fetchBlob(endpoint: string, options?: RequestInit) {
  const token = localStorage.getItem('token');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`下载失败 (${response.status})`);
    }

    return response.blob();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('下载超时，请稍后重试');
    }
    throw error;
  }
}

async function uploadFile(endpoint: string, file: File, fieldName: string = 'file') {
  const token = localStorage.getItem('token');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const formData = new FormData();
    formData.append(fieldName, file);

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMsg = `上传失败 (${response.status})`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }

    return response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('上传超时，请稍后重试');
    }
    throw error;
  }
}

export const api = {
  get: (endpoint: string) => fetchApi(endpoint),
  post: (endpoint: string, data?: any) =>
    fetchApi(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),
  put: (endpoint: string, data?: any) =>
    fetchApi(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),
  delete: (endpoint: string) =>
    fetchApi(endpoint, { method: 'DELETE' }),
  download: (endpoint: string) => fetchBlob(endpoint),
  upload: (endpoint: string, file: File, fieldName?: string) => uploadFile(endpoint, file, fieldName),
};

export default api;
