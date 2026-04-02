import type { Trader } from '@/types/models';
import { API_BASE } from './http';
import { apiFetch } from './http';

type TraderDTO = {
  id?: number;
  businessName?: string;
  ownerName?: string;
  address?: string;
  mobile?: string;
  email?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  category?: string;
  approvalStatus?: string;
  billPrefix?: string;
  createdAt?: string;
  created_at?: string;
  createdDate?: string;
  created_date?: string;
  updatedAt?: string;
  updated_at?: string;
  updatedDate?: string;
  updated_date?: string;
  approvalDecisionAt?: string | null;
  approval_decision_at?: string | null;
  active?: boolean;
  presetEnabled?: boolean;
};

function mapDtoToTrader(dto: TraderDTO): Trader {
  return {
    trader_id: String(dto.id ?? ''),
    business_name: dto.businessName ?? '',
    owner_name: dto.ownerName ?? '',
    address: dto.address ?? '',
    mobile: dto.mobile ?? '',
    email: dto.email ?? '',
    city: dto.city ?? '',
    state: dto.state ?? '',
    pin_code: dto.pinCode ?? '',
    category: dto.category ?? '',
    approval_status: (dto.approvalStatus as Trader['approval_status']) ?? 'PENDING',
    bill_prefix: dto.billPrefix ?? '',
    shop_photos: [],
    // Read both camelCase and snake_case API fields; never fabricate "now" timestamps.
    created_at: dto.createdAt ?? dto.created_at ?? dto.createdDate ?? dto.created_date ?? '',
    updated_at: dto.updatedAt ?? dto.updated_at ?? dto.updatedDate ?? dto.updated_date ?? '',
    approval_decision_at: dto.approvalDecisionAt ?? dto.approval_decision_at ?? null,
    active: dto.active ?? true,
    preset_enabled: dto.presetEnabled !== false,
  };
}

export const traderApi = {
  async uploadPhotos(traderId: string, files: File[]): Promise<string[]> {
    const form = new FormData();
    files.forEach(f => form.append('files', f));

    const res = await apiFetch(`/traders/${traderId}/photos`, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      throw new Error('Failed to upload photos');
    }
    return res.json();
  },

  /** Admin: list traders (GET /api/admin/traders). */
  async listForAdmin(params: { page?: number; size?: number } = {}): Promise<Trader[]> {
    const searchParams = new URLSearchParams();
    searchParams.set('page', String(params.page ?? 0));
    searchParams.set('size', String(params.size ?? 100));
    const res = await apiFetch(`/admin/traders?${searchParams.toString()}`, { method: 'GET' });
    if (!res.ok) throw new Error('Failed to load traders');
    const data = (await res.json()) as TraderDTO[];
    return (Array.isArray(data) ? data : []).map(mapDtoToTrader);
  },

  /** Admin: approve trader (PATCH /api/admin/traders/{id}/approve). */
  async approve(traderId: string): Promise<Trader> {
    const res = await apiFetch(`/admin/traders/${encodeURIComponent(traderId)}/approve`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Failed to approve trader');
    const dto = (await res.json()) as TraderDTO;
    return mapDtoToTrader(dto);
  },

  /** Admin: reject pending trader (PATCH /api/admin/traders/{id}/reject). */
  async reject(traderId: string): Promise<Trader> {
    const res = await apiFetch(`/admin/traders/${encodeURIComponent(traderId)}/reject`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Failed to reject trader');
    const dto = (await res.json()) as TraderDTO;
    return mapDtoToTrader(dto);
  },

  /** Admin: list inactive traders (GET /api/admin/traders/inactive). */
  async listInactive(params: { page?: number; size?: number } = {}): Promise<Trader[]> {
    const searchParams = new URLSearchParams();
    searchParams.set('page', String(params.page ?? 0));
    searchParams.set('size', String(params.size ?? 100));
    const res = await apiFetch(`/admin/traders/inactive?${searchParams.toString()}`, { method: 'GET' });
    if (!res.ok) throw new Error('Failed to load inactive traders');
    const data = (await res.json()) as TraderDTO[];
    return (Array.isArray(data) ? data : []).map(mapDtoToTrader);
  },

  /** Admin: activate trader (PATCH /api/admin/traders/{id}/activate). Returns 204, no body. */
  async activate(traderId: string): Promise<void> {
    const res = await apiFetch(`/admin/traders/${encodeURIComponent(traderId)}/activate`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Failed to activate trader');
  },

  /** Admin: deactivate trader (PATCH /api/admin/traders/{id}/deactivate). Returns 204, no body. */
  async deactivate(traderId: string): Promise<void> {
    const res = await apiFetch(`/admin/traders/${encodeURIComponent(traderId)}/deactivate`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Failed to deactivate trader');
  },

  /** Admin: permanently delete an inactive trader (DELETE /api/admin/traders/{id}/permanent). */
  async permanentDelete(traderId: string): Promise<void> {
    const res = await apiFetch(`/admin/traders/${encodeURIComponent(traderId)}/permanent`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to permanently delete trader');
  },

  /** Admin: enable/disable trader-owned preset marks (PATCH /api/admin/traders/{id}/preset-enabled). */
  async setPresetEnabled(traderId: string, enabled: boolean): Promise<Trader> {
    const res = await apiFetch(`/admin/traders/${encodeURIComponent(traderId)}/preset-enabled`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error('Failed to update preset setting');
    const dto = (await res.json()) as TraderDTO;
    return mapDtoToTrader(dto);
  },
};

