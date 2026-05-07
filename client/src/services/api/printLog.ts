import { apiFetch } from './http';

const BASE = '/print-logs';

export interface PrintLogDTO {
  id: number;
  reference_type: string;
  reference_id?: string;
  print_type: string;
  printed_at: string;
}

export interface PrintLogCreateRequest {
  reference_type: string;
  reference_id?: string;
  print_type: string;
  printed_at?: string;
}

async function parseJsonOrThrow(res: Response, defaultMessage: string): Promise<never> {
  let message = defaultMessage;
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.detail) message = body.detail;
    }
  } catch {
    // ignore
  }
  throw new Error(message);
}

export const printLogApi = {
  async create(body: PrintLogCreateRequest): Promise<PrintLogDTO> {
    const payload = {
      ...body,
      printed_at: body.printed_at ?? new Date().toISOString(),
    };
    const res = await apiFetch(BASE, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to log print event');
    return res.json();
  },

  async list(params: { page?: number; size?: number; sort?: string } = {}): Promise<PrintLogDTO[]> {
    const searchParams = new URLSearchParams();
    if (params.page != null) searchParams.set('page', String(params.page));
    if (params.size != null) searchParams.set('size', String(params.size));
    if (params.sort) searchParams.set('sort', params.sort);
    const res = await apiFetch(`${BASE}?${searchParams.toString()}`, { method: 'GET' });
    if (!res.ok) await parseJsonOrThrow(res, 'Failed to load print logs');
    return res.json();
  },
};
