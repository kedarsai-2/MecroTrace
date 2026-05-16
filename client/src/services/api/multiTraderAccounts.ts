import type { Trader, User } from '@/types/models';
import { apiFetch, captureAuthTokenFromResponse, captureRefreshTokenFromResponse } from './http';
import { setTraderToken } from './tokenStore';
import type { TraderAccountOption } from './auth';

export type MultiTraderRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type MultiTraderAccountRequest = {
  id: number;
  status: MultiTraderRequestStatus;
  requester_user_id?: number;
  requester_trader_id?: number;
  created_trader_id?: number | null;
  request_group_id?: string | null;
  request_group_index?: number | null;
  request_group_size?: number | null;
  business_name: string;
  owner_name: string;
  address?: string | null;
  mobile?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  pin_code?: string | null;
  shop_no?: string | null;
  category?: string | null;
  gst_number?: string | null;
  rmc_apmc_code?: string | null;
  shop_photos?: string[];
  description?: string | null;
  decision_reason?: string | null;
  requested_at?: string | null;
  decision_at?: string | null;
  requester_login?: string | null;
  requester_name?: string | null;
  current_trader_business_name?: string | null;
  created_trader_business_name?: string | null;
  decided_by_admin_login?: string | null;
};

export type MultiTraderAccountRequestCreate = {
  business_name: string;
  owner_name: string;
  address?: string;
  city?: string;
  state?: string;
  pin_code?: string;
  shop_no?: string;
  category?: string;
  gst_number?: string;
  rmc_apmc_code?: string;
  shop_photos?: string[];
  description?: string;
};

export type MultiTraderCurrentSummary = {
  current_trader: TraderAccountOption | null;
  accounts: TraderAccountOption[];
  request_counts: {
    pending: number;
    approved: number;
    rejected: number;
  };
};

export type AdminMultiTraderRequestPage = {
  requests: MultiTraderAccountRequest[];
  total: number;
};

function mapUserPayload(data: any): User {
  return {
    user_id: data.user.user_id,
    trader_id: data.user.trader_id,
    username: data.user.username,
    is_active: data.user.is_active,
    created_at: data.user.created_at ?? new Date().toISOString(),
    name: data.user.name,
    role: data.user.role,
    authorities: data.user.authorities ?? [],
  };
}

function mapTraderPayload(data: any): Trader {
  return {
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
    preset_enabled: data.trader?.preset_enabled !== false,
  };
}

async function persistTraderAuth(res: Response, data: any): Promise<void> {
  const tokenFromBody = data?.token;
  if (typeof tokenFromBody === 'string' && tokenFromBody.trim()) {
    await setTraderToken(tokenFromBody.trim());
  } else {
    await captureAuthTokenFromResponse(res, 'trader');
  }
  await captureRefreshTokenFromResponse(res, 'trader', data?.refresh_token);
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return fallback;
    const parsed = JSON.parse(text);
    if (typeof parsed?.detail === 'string') return parsed.detail.replace(/^\d{3}\s+\w+\s*/, '').replace(/^["']|["']$/g, '');
    if (typeof parsed?.title === 'string') return parsed.title;
  } catch {
    // ignore
  }
  return fallback;
}

export const multiTraderAccountsApi = {
  async current(): Promise<MultiTraderCurrentSummary> {
    const res = await apiFetch('/trader/multi-accounts/current', { method: 'GET' });
    if (!res.ok) throw new Error('Failed to load multi-account summary');
    return res.json();
  },

  async accounts(): Promise<TraderAccountOption[]> {
    const res = await apiFetch('/trader/multi-accounts/accounts', { method: 'GET' });
    if (!res.ok) throw new Error('Failed to load linked accounts');
    return res.json();
  },

  async requests(): Promise<MultiTraderAccountRequest[]> {
    const res = await apiFetch('/trader/multi-accounts/requests', { method: 'GET' });
    if (!res.ok) throw new Error('Failed to load account requests');
    return res.json();
  },

  async createRequest(payload: MultiTraderAccountRequestCreate): Promise<MultiTraderAccountRequest> {
    const res = await apiFetch('/trader/multi-accounts/requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to submit account request'));
    return res.json();
  },

  async createRequests(payload: MultiTraderAccountRequestCreate[]): Promise<MultiTraderAccountRequest[]> {
    const res = await apiFetch('/trader/multi-accounts/requests/batch', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to submit mandi requests'));
    return res.json();
  },

  async switchAccount(traderId: string): Promise<{ user: User; trader: Trader }> {
    const res = await apiFetch('/trader/multi-accounts/switch', {
      method: 'POST',
      body: JSON.stringify({ trader_id: traderId }),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to switch account'));
    const data = await res.json();
    await persistTraderAuth(res, data);
    return {
      user: mapUserPayload(data),
      trader: mapTraderPayload(data),
    };
  },

  async adminList(params: {
    page?: number;
    size?: number;
    status?: MultiTraderRequestStatus | 'ALL';
    q?: string;
  } = {}): Promise<AdminMultiTraderRequestPage> {
    const search = new URLSearchParams();
    search.set('page', String(params.page ?? 0));
    search.set('size', String(params.size ?? 50));
    search.set('sort', 'requestedAt,desc');
    if (params.status && params.status !== 'ALL') search.set('status', params.status);
    if (params.q?.trim()) search.set('q', params.q.trim());
    const res = await apiFetch(`/admin/multi-trader-accounts?${search.toString()}`, { method: 'GET' });
    if (!res.ok) throw new Error('Failed to load multi trader requests');
    const data = (await res.json()) as MultiTraderAccountRequest[];
    return {
      requests: Array.isArray(data) ? data : [],
      total: Number(res.headers.get('X-Total-Count') ?? (Array.isArray(data) ? data.length : 0)),
    };
  },

  async adminGet(id: number): Promise<MultiTraderAccountRequest> {
    const res = await apiFetch(`/admin/multi-trader-accounts/${id}`, { method: 'GET' });
    if (!res.ok) throw new Error('Failed to load request details');
    return res.json();
  },

  async approve(id: number, reason?: string): Promise<MultiTraderAccountRequest> {
    const res = await apiFetch(`/admin/multi-trader-accounts/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ reason: reason?.trim() || undefined }),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to approve request'));
    return res.json();
  },

  async approveGroup(requestGroupId: string, reason?: string): Promise<MultiTraderAccountRequest[]> {
    const res = await apiFetch(`/admin/multi-trader-accounts/groups/${encodeURIComponent(requestGroupId)}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ reason: reason?.trim() || undefined }),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to approve request group'));
    return res.json();
  },

  async reject(id: number, reason: string): Promise<MultiTraderAccountRequest> {
    const res = await apiFetch(`/admin/multi-trader-accounts/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to reject request'));
    return res.json();
  },

  async rejectGroup(requestGroupId: string, reason: string): Promise<MultiTraderAccountRequest[]> {
    const res = await apiFetch(`/admin/multi-trader-accounts/groups/${encodeURIComponent(requestGroupId)}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to reject request group'));
    return res.json();
  },
};
