// src/services/auth.js
import sessionService from './sessionService';
import { apiFetch } from './api';

const authService = {
  // email, password -> { success: true, user } or { success:false, message }
  async login(email, password) {
    const r = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) return { success: false, message: r.body?.message || 'Login failed' };

    const { token, user } = r.body;
    if (token) await sessionService.saveToken(token);
    if (user && user.id) await sessionService.saveProfile(user.id, user);
    return { success: true, user };
  },

  // {name,email,password}
  async signup({ name, email, password }) {
    const r = await apiFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    if (!r.ok) return { success: false, message: r.body?.message || 'Signup failed' };

    const { token, user } = r.body;
    if (token) await sessionService.saveToken(token);
    if (user && user.id) await sessionService.saveProfile(user.id, user);
    return { success: true, user };
  },

  async logout() {
    // local-only logout (invalidate token client-side)
    await sessionService.clearToken();
    // optionally clear profile cache here if you store the logged-in uid somewhere
    return { success: true };
  },
};

export default authService;
