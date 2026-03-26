import type { Trader, User } from '@/types/models';
import { apiFetch, captureAuthTokenFromResponse } from './http';
import { setTraderToken } from './tokenStore';

/** Default message when we cannot show a specific validation message. */
const REGISTRATION_FAILED = 'Registration failed. Please try again.';

/** User-friendly message for duplicate email/login (no sensitive data). */
const EMAIL_ALREADY_REGISTERED =
  'A trader is already registered with this email address. Please sign in or use a different email.';

/** User-friendly message for duplicate mobile. */
const MOBILE_ALREADY_USED = 'This mobile number is already in use. Please use a different number.';

/** Safe to show for generic API errors (avoid leaking stack traces). */
function isSafeMessage(s: string): boolean {
  return (
    s.length > 0 &&
    s.length < 2000 &&
    !/stack trace|java\.lang\.|at\s+[\w.$]+\([\w.]+\.java:\d+\)/i.test(s)
  );
}

/** Strip HTTP status prefixes like "403 FORBIDDEN" or "Forbidden:" from messages. */
function cleanMessage(msg: string): string {
  let out = msg.trim();
  // JHipster ProblemDetail: 403 FORBIDDEN "Human readable message" (use greedy .+ between outer quotes)
  const jhipsterQuoted = out.match(/^\d{3}\s+\w+\s*["'](.+)["']\s*$/s);
  if (jhipsterQuoted) return jhipsterQuoted[1].trim();
  // Extract quoted message: "403 FORBIDDEN '...'" or "403 FORBIDDEN "...""
  const quotedMatch = out.match(/^\s*\d{3}\s+\w+\s*['"](.+?)['"]\s*$/s);
  if (quotedMatch) return quotedMatch[1].trim();
  // Or extract first quoted substring anywhere (e.g. status prefix + "real message")
  const innerQuoted = out.match(/['"]([^'"]{10,2000})['"]/);
  if (innerQuoted) return innerQuoted[1].trim();
  out = out
    .replace(/^\s*\d{3}\s+(?:FORBIDDEN|Forbidden|UNAUTHORIZED|Unauthorized|BAD_REQUEST|Bad Request|CONFLICT|Conflict)\s*[:\s'"]*/i, '')
    .replace(/^Forbidden\s*[:\s'"]*/i, '')
    .replace(/^['"]|['"]$/g, '')
    .trim();
  return out;
}

/** Backend `preset_enabled`; missing => true for older responses. */
function mapAuthPresetEnabled(raw: unknown): boolean {
  return raw !== false;
}

/**
 * Reads response body as text (body can only be read once).
 * Tries to parse as JSON; falls back to raw text for non-JSON responses.
 */
async function readErrorBody(res: Response): Promise<{ text: string; problem?: Record<string, unknown> }> {
  const text = await res.text();
  let problem: Record<string, unknown> | undefined;
  if (text && (text.startsWith('{') || text.startsWith('['))) {
    try {
      problem = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // not valid JSON
    }
  }
  return { text, problem };
}

/**
 * Parses error response for registration: 409 Conflict or 400 with "already used" / "already registered".
 * Reads body as text first to avoid consume-once issues; then parses JSON if applicable.
 */
async function parseRegistrationError(res: Response): Promise<string> {
  const status = res.status;
  try {
    const { text, problem } = await readErrorBody(res);
    if (problem && typeof problem === 'object') {
      const detail = typeof problem.detail === 'string' ? problem.detail.trim() : '';
      const title = typeof problem.title === 'string' ? problem.title.trim() : '';
      const msgKey = typeof problem.message === 'string' ? problem.message : '';

      // 403: always prefer cleaned server detail (e.g. rejected registration). Do not run isSafeMessage on
      // raw detail — patterns like /at \w+\./ false-positive on "...need help.".
      if (status === 403 && detail.length > 0) {
        const cleaned = cleanMessage(detail);
        if (cleaned.length > 0 && isSafeMessage(cleaned)) {
          return cleaned;
        }
      }

      // Known backend error keys: always use friendly message
      if (msgKey.includes('traderEmailExists')) return EMAIL_ALREADY_REGISTERED;
      if (msgKey.includes('traderMobileExists')) return MOBILE_ALREADY_USED;

      const isConflict = status === 409;
      const lowerDetail = detail.toLowerCase();
      const lowerTitle = title.toLowerCase();
      const isDuplicate =
        status === 400 &&
        (lowerDetail.includes('already used') ||
          lowerDetail.includes('already registered') ||
          lowerDetail.includes('already in use') ||
          lowerDetail.includes('in use') ||
          lowerTitle.includes('already used') ||
          lowerTitle.includes('already in use'));

      if (isConflict || isDuplicate) {
        if (detail && isSafeMessage(detail)) return cleanMessage(detail);
        if (title && isSafeMessage(title)) return cleanMessage(title);
        if (lowerDetail.includes('mobile') || lowerDetail.includes('phone') || msgKey.includes('Mobile'))
          return MOBILE_ALREADY_USED;
        return EMAIL_ALREADY_REGISTERED;
      }

      if (detail && isSafeMessage(detail)) return cleanMessage(detail);
      if (title && isSafeMessage(title)) return cleanMessage(title);
    }
    if (text && text.length < 500 && !/stack|exception|at\s+\w+\./.i.test(text)) {
      return cleanMessage(text);
    }
  } catch {
    // ignore
  }
  return REGISTRATION_FAILED;
}

export const authApi = {
  async register(data: {
    business_name: string;
    owner_name: string;
    mobile: string;
    email: string;
    password: string;
    address: string;
    city: string;
    state: string;
    pin_code: string;
    category: string;
    gst_number?: string;
    rmc_apmc_code?: string;
    shop_photos?: string[];
  }): Promise<{ trader: Trader; user: User }> {
    const res = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const message = await parseRegistrationError(res);
      throw new Error(message);
    }

    const dataRes = await res.json();

    // If backend returns token in body, persist it (Android only).
    const tokenFromBody = (dataRes as any)?.token;
    if (typeof tokenFromBody === 'string' && tokenFromBody.trim()) {
      setTraderToken(tokenFromBody.trim());
    }

    // Best-effort: capture JWT from headers for native shells where cookies are unreliable.
    captureAuthTokenFromResponse(res, 'trader');

    const user: User = {
      user_id: dataRes.user.user_id,
      trader_id: dataRes.user.trader_id,
      username: dataRes.user.username,
      is_active: dataRes.user.is_active,
      created_at: dataRes.user.created_at ?? new Date().toISOString(),
      name: dataRes.user.name,
      role: dataRes.user.role,
      authorities: dataRes.user.authorities ?? [],
    };

    const trader: Trader = {
      trader_id: dataRes.trader.trader_id,
      business_name: dataRes.trader.business_name,
      owner_name: dataRes.trader.owner_name,
      address: dataRes.trader.address ?? '',
      category: dataRes.trader.category ?? '',
      approval_status: dataRes.trader.approval_status ?? 'PENDING',
      bill_prefix: dataRes.trader.bill_prefix ?? '',
      created_at: dataRes.trader.created_at ?? new Date().toISOString(),
      updated_at: dataRes.trader.updated_at ?? new Date().toISOString(),
      mobile: dataRes.trader.mobile ?? data.mobile,
      email: dataRes.trader.email ?? data.email,
      city: dataRes.trader.city ?? data.city,
      state: dataRes.trader.state ?? data.state,
      pin_code: dataRes.trader.pin_code ?? data.pin_code,
      gst_number: dataRes.trader.gst_number ?? data.gst_number,
      rmc_apmc_code: dataRes.trader.rmc_apmc_code ?? data.rmc_apmc_code,
      shop_photos: dataRes.trader.shop_photos ?? data.shop_photos ?? [],
      preset_enabled: mapAuthPresetEnabled(dataRes.trader?.preset_enabled),
    };

    return { trader, user };
  },

  async login(email: string, password: string): Promise<{ trader: Trader; user: User }> {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: email, password }),
    });

    if (!res.ok) {
      let message = 'Login failed. Please try again.';
      try {
        const { text, problem } = await readErrorBody(res);
        const detail = (problem && typeof problem.detail === 'string') ? problem.detail.trim() : '';
        const title = (problem && typeof problem.title === 'string') ? problem.title.trim() : '';

        // Avoid showing raw backend exceptions (e.g. IndexOutOfBoundsException)
        if (detail.includes('Index') && detail.includes('out of bounds')) {
          message = 'An unexpected error occurred. Please try again or contact support.';
        } else if (res.status === 403 && detail.toLowerCase().includes('inactive')) {
          message = cleanMessage(detail);
        } else if (res.status === 403 && detail) {
          message = cleanMessage(detail);
        } else if (res.status === 403) {
          message = 'Your account access has been restricted. Please contact support for assistance.';
        } else if (detail.includes('Invalid email or password')) {
          message = 'Invalid email or password';
        } else if (detail.includes('Password must be at least 6 characters')) {
          message = 'Password must be at least 6 characters';
        } else if (detail.length > 0 && !detail.includes('out of bounds')) {
          message = cleanMessage(detail);
        } else if (title.length > 0 && !/^forbidden$|^403$/i.test(title) && !title.includes('out of bounds')) {
          message = cleanMessage(title);
        } else if (text && text.length < 500 && !/stack|exception|at\s+\w+\.|out of bounds/.i.test(text)) {
          message = cleanMessage(text);
        }
      } catch {
        // ignore parse errors and keep default message
      }
      throw new Error(message);
    }

    const data = await res.json();

    // New: persist token from response body (backend also sets httpOnly cookie).
    const tokenFromBody = (data as any)?.token;
    if (typeof tokenFromBody === 'string' && tokenFromBody.trim()) {
      setTraderToken(tokenFromBody.trim());
    } else {
      // Backward compatible: try extracting token from exposed Authorization header.
      captureAuthTokenFromResponse(res, 'trader');
    }

    // Capture trader JWT for use in Authorization header (web + Capacitor).
    // Kept for compatibility with builds where token is not included in body.
    // (No-op when token is already stored above.)
    // captureAuthTokenFromResponse(res, 'trader');

    const user: User = {
      user_id: data.user.user_id,
      trader_id: data.user.trader_id,
      username: data.user.username,
      is_active: data.user.is_active,
      created_at: data.user.created_at ?? new Date().toISOString(),
      name: data.user.name,
      role: data.user.role,
      authorities: data.user.authorities ?? [],
    };

    const trader: Trader = {
      trader_id: data.trader.trader_id,
      business_name: data.trader.business_name,
      owner_name: data.trader.owner_name,
      address: data.trader.address ?? '',
      category: data.trader.category ?? '',
      approval_status: data.trader.approval_status ?? 'PENDING',
      bill_prefix: data.trader.bill_prefix ?? '',
      created_at: data.trader.created_at ?? new Date().toISOString(),
      updated_at: data.trader.updated_at ?? new Date().toISOString(),
      mobile: data.trader.mobile,
      email: data.trader.email,
      city: data.trader.city,
      state: data.trader.state,
      pin_code: data.trader.pin_code,
      gst_number: data.trader.gst_number,
      rmc_apmc_code: data.trader.rmc_apmc_code,
      shop_photos: data.trader.shop_photos ?? [],
      preset_enabled: mapAuthPresetEnabled(data.trader?.preset_enabled),
    };

    return { trader, user };
  },

  async getProfile(): Promise<{ trader: Trader; user: User } | null> {
    const res = await apiFetch('/auth/me', {
      method: 'GET',
    });

    if (res.status === 401) {
      return null;
    }

    if (!res.ok) {
      let message = 'Failed to load profile';
      try {
        const { text, problem } = await readErrorBody(res);
        if (problem && typeof problem === 'object') {
          const detail = typeof problem.detail === 'string' ? problem.detail.trim() : '';
          if (res.status === 403 && (detail.toLowerCase().includes('inactive') || detail.length > 0)) {
            message = cleanMessage(detail);
          } else if (res.status === 403) {
            message = 'Your account access has been restricted. Please contact support for assistance.';
          } else if (detail.length > 0 && detail.length < 300) {
            message = cleanMessage(detail);
          }
        } else if (text && text.length < 500 && !/stack|exception|at\s+\w+\./.i.test(text)) {
          message = cleanMessage(text);
        }
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    const data = await res.json();

    const user: User = {
      user_id: data.user.user_id,
      trader_id: data.user.trader_id,
      username: data.user.username,
      is_active: data.user.is_active,
      created_at: data.user.created_at ?? new Date().toISOString(),
      name: data.user.name,
      role: data.user.role,
      authorities: data.user.authorities ?? [],
    };

    const trader: Trader = {
      trader_id: data.trader.trader_id,
      business_name: data.trader.business_name,
      owner_name: data.trader.owner_name,
      address: data.trader.address ?? '',
      category: data.trader.category ?? '',
      approval_status: data.trader.approval_status ?? 'PENDING',
      bill_prefix: data.trader.bill_prefix ?? '',
      created_at: data.trader.created_at ?? new Date().toISOString(),
      updated_at: data.trader.updated_at ?? new Date().toISOString(),
      mobile: data.trader.mobile,
      email: data.trader.email,
      city: data.trader.city,
      state: data.trader.state,
      pin_code: data.trader.pin_code,
      gst_number: data.trader.gst_number,
      rmc_apmc_code: data.trader.rmc_apmc_code,
      shop_photos: data.trader.shop_photos ?? [],
      preset_enabled: mapAuthPresetEnabled(data.trader?.preset_enabled),
    };

    return { trader, user };
  },

  async requestOtp(mobile: string): Promise<void> {
    const res = await apiFetch('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ mobile }),
    });

    if (!res.ok) {
      let message = 'Failed to send OTP. Please try again.';
      try {
        const { text, problem } = await readErrorBody(res);
        if (problem && typeof problem === 'object') {
          const detail = typeof problem.detail === 'string' ? problem.detail.trim() : '';
          const title = typeof problem.title === 'string' ? problem.title.trim() : '';
          if (detail.length > 0) message = cleanMessage(detail);
          else if (title.length > 0) message = cleanMessage(title);
        } else if (text && text.length < 500 && !/stack|exception|at\s+\w+\./.i.test(text)) {
          message = cleanMessage(text);
        }
      } catch {
        // ignore
      }
      throw new Error(message);
    }
  },

  async verifyOtp(mobile: string, otp: string): Promise<{ trader: Trader; user: User }> {
    const res = await apiFetch('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ mobile, otp }),
    });

    if (!res.ok) {
      let message = 'OTP verification failed. Please try again.';
      try {
        const { text, problem } = await readErrorBody(res);
        if (problem && typeof problem === 'object') {
          const detail = typeof problem.detail === 'string' ? problem.detail.trim() : '';
          const title = typeof problem.title === 'string' ? problem.title.trim() : '';
          if (res.status === 403 && (detail.toLowerCase().includes('inactive') || detail.length > 0)) {
            message = cleanMessage(detail);
          } else if (res.status === 403) {
            message = 'Your account access has been restricted. Please contact support for assistance.';
          } else if (detail.length > 0) {
            message = cleanMessage(detail);
          } else if (title.length > 0) {
            message = cleanMessage(title);
          }
        } else if (text && text.length < 500 && !/stack|exception|at\s+\w+\./.i.test(text)) {
          message = cleanMessage(text);
        }
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    const data = await res.json();

    // OTP login issues a JWT via auth pipeline.
    // New: backend also returns the JWT in `data.token` (frontend stores it on Android).
    const tokenFromBody = (data as any)?.token;
    if (typeof tokenFromBody === 'string' && tokenFromBody.trim()) {
      setTraderToken(tokenFromBody.trim());
    } else {
      // Backward compatible fallback.
      captureAuthTokenFromResponse(res, 'trader');
    }

    const user: User = {
      user_id: data.user.user_id,
      trader_id: data.user.trader_id,
      username: data.user.username,
      is_active: data.user.is_active,
      created_at: data.user.created_at ?? new Date().toISOString(),
      name: data.user.name,
      role: data.user.role,
      authorities: data.user.authorities ?? [],
    };

    const trader: Trader = {
      trader_id: data.trader.trader_id,
      business_name: data.trader.business_name,
      owner_name: data.trader.owner_name,
      address: data.trader.address ?? '',
      category: data.trader.category ?? '',
      approval_status: data.trader.approval_status ?? 'PENDING',
      bill_prefix: data.trader.bill_prefix ?? '',
      created_at: data.trader.created_at ?? new Date().toISOString(),
      updated_at: data.trader.updated_at ?? new Date().toISOString(),
      mobile: data.trader.mobile,
      email: data.trader.email,
      city: data.trader.city,
      state: data.trader.state,
      pin_code: data.trader.pin_code,
      gst_number: data.trader.gst_number,
      rmc_apmc_code: data.trader.rmc_apmc_code,
      shop_photos: data.trader.shop_photos ?? [],
      preset_enabled: mapAuthPresetEnabled(data.trader?.preset_enabled),
    };

    return { trader, user };
  },

  async logout(): Promise<void> {
    // Best-effort: ask backend to clear ACCESS_TOKEN cookie for trader/admin flows.
    // Ignore network errors so UI logout still succeeds locally.
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // no-op
    }
  },
};
