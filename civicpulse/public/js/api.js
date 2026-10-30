// Thin API client. All errors surface as Error(message) with an optional status.

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    ...options,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  bootstrap: () => request('/api/bootstrap'),
  insights: () => request('/api/insights'),
  report: (id) => request(`/api/reports/${encodeURIComponent(id)}`),
  create: (body) => request('/api/reports', { method: 'POST', body: JSON.stringify(body) }),
  action: (id, body) => request(`/api/reports/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  analyze: (text, extra = {}) => request('/api/analyze', { method: 'POST', body: JSON.stringify({ text, ...extra }) }),
  compare: (a, b) => request(`/api/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),
  reset: () => request('/api/demo/reset', { method: 'POST' }),
  surge: () => request('/api/demo/surge', { method: 'POST' }),
  exportCsv: () => '/api/export.csv',
};
