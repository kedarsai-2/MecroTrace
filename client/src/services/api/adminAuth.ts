import type { User } from '@/types/models';
import { apiFetch, captureAuthTokenFromResponse } from './http';
import { setAdminToken } from './tokenStore';

export const adminAuthApi = {
  async login(email: string, password: string): Promise<{ user: User }> {
    const res = await apiFetch('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: email, password }),
    });

    if (!res.ok) {
      let message = 'Login failed. Please try again.';
      try {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const problem = await res.json();
          if (typeof problem.detail === 'string' && problem.detail.includes('Invalid username or password')) {
            message = 'Invalid email or password';
          } else if (typeof problem.detail === 'string' && problem.detail.includes('Password must be at least 6 characters')) {
            message = 'Password must be at least 6 characters';
          } else if (typeof problem.detail === 'string' && problem.detail.trim().length > 0) {
            message = problem.detail;
          } else if (typeof problem.title === 'string' && problem.title.trim().length > 0) {
            message = problem.title;
          }
        } else {
          const text = await res.text();
          if (text && text.length < 200) {
            message = text;
          }
        }
      } catch {
        // ignore parse errors and keep default message
      }
      throw new Error(message);
    }

    const data = await res.json();

    // Admin login returns a JWT token; prefer explicit token field, fall back to Authorization header.
    if (data && typeof (data as any).token === 'string') {
      await setAdminToken((data as any).token as string);
    } else {
      await captureAuthTokenFromResponse(res, 'admin');
    }

    const user: User = {
      user_id: data.user.user_id,
      trader_id: data.user.trader_id ?? '',
      username: data.user.username,
      is_active: data.user.is_active,
      created_at: data.user.created_at ?? new Date().toISOString(),
      name: data.user.name,
      role: data.user.role,
      authorities: data.user.authorities ?? [],
    };

    return { user };
  },

  async getProfile(): Promise<{ user: User } | null> {
    const res = await apiFetch('/admin/auth/me', {
      method: 'GET',
    });

    if (res.status === 401 || res.status === 403) {
      return null;
    }

    if (!res.ok) {
      throw new Error('Failed to load admin profile');
    }

    const data = await res.json();

    const user: User = {
      user_id: data.user.user_id,
      trader_id: data.user.trader_id ?? '',
      username: data.user.username,
      is_active: data.user.is_active,
      created_at: data.user.created_at ?? new Date().toISOString(),
      name: data.user.name,
      role: data.user.role,
      authorities: data.user.authorities ?? [],
    };

    return { user };
  },

  async logout(): Promise<void> {
    // Best-effort: clear ACCESS_TOKEN cookie for admin flows on the backend.
    try {
      await apiFetch('/admin/auth/logout', {
        method: 'POST',
      });
    } catch {
      // ignore network errors
    }
  },
};
