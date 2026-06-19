/**
 * FFC API client — thin fetch wrapper.
 *
 * - Base URL: window.FFC_API_BASE  (override in HTML before this script loads)
 * - Reads JWT token from sessionStorage.ffc_token (set by login)
 * - Throws on non-2xx, returns parsed JSON otherwise
 *
 * Usage:
 *   const { token, user } = await api('/auth/login', { method: 'POST', body: { username, password } });
 *   const { data } = await api('/tickets');
 *   await api('/tickets/FFC-0089/status', { method: 'PATCH', body: { status: 'in-progress' } });
 */
(function (global) {
  const DEFAULT_BASE = 'http://localhost:3001/api';
  const TOKEN_KEY = 'ffc_token';

  function base() {
    return global.FFC_API_BASE || DEFAULT_BASE;
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }
  function setToken(token) {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  }

  async function api(path, opts = {}) {
    const { method = 'GET', body, headers = {}, query, ...rest } = opts;

    let url = base() + path;
    if (query) {
      const qs = new URLSearchParams(
        Object.entries(query).filter(([_, v]) => v !== undefined && v !== null && v !== '')
      ).toString();
      if (qs) url += (path.includes('?') ? '&' : '?') + qs;
    }

    const token = getToken();
    const finalHeaders = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: 'Bearer ' + token }),
      ...headers,
    };

    let res;
    try {
      res = await fetch(url, {
        method,
        headers: finalHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        ...rest,
      });
    } catch (err) {
      throw new ApiError(
        'Không kết nối được tới server. Đảm bảo backend đang chạy ở ' + base(),
        0, null
      );
    }

    /* 204 No Content */
    if (res.status === 204) return null;

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }

    if (!res.ok) {
      const msg = (data && data.error) || res.statusText || 'Lỗi server';
      throw new ApiError(msg, res.status, data);
    }
    return data;
  }

  class ApiError extends Error {
    constructor(message, status, body) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  }

  global.api = api;
  global.apiToken = { get: getToken, set: setToken };
  global.ApiError = ApiError;
})(window);
