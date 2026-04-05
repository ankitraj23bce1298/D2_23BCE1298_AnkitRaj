// src/services/api.js
import sessionService from './sessionService';

const BASE = process.env.API_BASE_URL || 'http://172.16.45.163:3000';

export async function apiFetch(path, opts = {}) {
  const token = await sessionService.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body,
  });

  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    // ignore non-json
  }

  return { ok: res.ok, status: res.status, body };
}
