import type { Contact } from '@/types/models';
import { apiFetch } from './http';
import type { ChartOfAccountDTO } from './chartOfAccounts';
import type { VoucherLineDTO } from './voucherLines';

type ContactDto = {
  id?: string | number;
  traderId?: string | number | null;
  trader_id?: string | number | null;
  contact_id?: string | number;
  name?: string;
  phone?: string;
  mark?: string;
  address?: string;
  createdAt?: string;
  created_at?: string;
  openingBalance?: number;
  opening_balance?: number;
  currentBalance?: number;
  current_balance?: number;
  email?: string;
  canLogin?: boolean;
  can_login?: boolean;
  portalSignupLinked?: boolean;
  portal_signup_linked?: boolean;
};

function mapDtoToContact(dto: ContactDto): Contact {
  const contactId = dto.contact_id ?? dto.id;
  const traderId = dto.trader_id ?? dto.traderId ?? '';

  return {
    contact_id: String(contactId ?? ''),
    trader_id: String(traderId ?? ''),
    name: dto.name ?? '',
    phone: dto.phone ?? '',
    mark: dto.mark ?? '',
    address: dto.address ?? '',
    created_at: dto.created_at ?? dto.createdAt ?? new Date().toISOString(),
    opening_balance: dto.opening_balance ?? dto.openingBalance ?? 0,
    current_balance: dto.current_balance ?? dto.currentBalance ?? 0,
    email: dto.email,
    can_login: dto.can_login ?? dto.canLogin,
    portal_signup_linked: dto.portal_signup_linked ?? dto.portalSignupLinked,
  };
}

function mapContactToCreatePayload(data: Partial<Contact>): Record<string, unknown> {
  return {
    name: data.name?.trim() ?? '',
    phone: data.phone?.trim() ?? '',
    mark: data.mark?.trim() ?? '',
    address: data.address?.trim() ?? '',
    traderId: data.trader_id && data.trader_id.length > 0 ? data.trader_id : undefined,
  };
}

function mapContactToUpdatePayload(id: string, data: Partial<Contact>): Record<string, unknown> {
  return {
    id,
    name: data.name?.trim() ?? '',
    phone: data.phone?.trim() ?? '',
    mark: data.mark?.trim() ?? '',
    address: data.address?.trim() ?? '',
  };
}

/** Error with optional errorKey from API problem body (e.g. phoneexistsinactive). */
export class ContactApiError extends Error {
  errorKey?: string;
  constructor(message: string, errorKey?: string) {
    super(message);
    this.name = 'ContactApiError';
    this.errorKey = errorKey;
  }
}

async function handleResponse<T>(res: Response, defaultMessage: string): Promise<T> {
  if (res.ok) {
    return res.json() as Promise<T>;
  }

  let message = defaultMessage;
  let errorKey: string | undefined;
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
      const problem = await res.json() as { detail?: string; title?: string; message?: string };
      if (typeof problem.detail === 'string' && problem.detail.trim().length > 0) {
        message = problem.detail;
      } else if (typeof problem.title === 'string' && problem.title.trim().length > 0) {
        message = problem.title;
      }
      if (typeof problem.message === 'string' && problem.message.startsWith('error.')) {
        errorKey = problem.message.replace(/^error\./, '');
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
  throw new ContactApiError(message, errorKey);
}

export const contactApi = {
  /** @param scope registry = Contacts module list; participants = arrival/auction picker (trader + all portal signups). */
  async list(opts?: { scope?: 'registry' | 'participants' }): Promise<Contact[]> {
    const scope = opts?.scope ?? 'registry';
    const res = await apiFetch(`/contacts?scope=${encodeURIComponent(scope)}`, {
      method: 'GET',
    });
    const data = await handleResponse<ContactDto[]>(res, 'Failed to load contacts');
    return data.map(mapDtoToContact);
  },

  async adminList(): Promise<Contact[]> {
    const res = await apiFetch('/admin/contacts', {
      method: 'GET',
    });
    const data = await handleResponse<ContactDto[]>(res, 'Failed to load contacts');
    return data.map(mapDtoToContact);
  },

  async create(data: Partial<Contact>): Promise<Contact> {
    const res = await apiFetch('/contacts', {
      method: 'POST',
      body: JSON.stringify(mapContactToCreatePayload(data)),
    });
    const created = await handleResponse<ContactDto>(res, 'Failed to register contact');
    return mapDtoToContact(created);
  },

  /** Get contact by id. Returns null if 404. */
  async getById(contactId: string): Promise<Contact | null> {
    const res = await apiFetch(`/contacts/${encodeURIComponent(contactId)}`, { method: 'GET' });
    if (res.status === 404) return null;
    const data = await handleResponse<ContactDto>(res, 'Failed to load contact');
    return mapDtoToContact(data);
  },

  /** Get contact by phone (active or inactive) for restore flow. Returns null if 404. */
  async getByPhone(phone: string): Promise<Contact | null> {
    const res = await apiFetch(`/contacts/by-phone?phone=${encodeURIComponent(phone)}`, { method: 'GET' });
    if (res.status === 404) return null;
    const data = await handleResponse<ContactDto>(res, 'Failed to load contact');
    return mapDtoToContact(data);
  },

  /** Restore a soft-deleted contact (set active = true). */
  async restore(contactId: string): Promise<Contact> {
    const res = await apiFetch(`/contacts/${encodeURIComponent(contactId)}/restore`, { method: 'PATCH' });
    const data = await handleResponse<ContactDto>(res, 'Failed to restore contact');
    return mapDtoToContact(data);
  },

  async update(itemId: string, data: Partial<Contact>): Promise<Contact> {
    const res = await apiFetch(`/contacts/${encodeURIComponent(itemId)}`, {
      method: 'PUT',
      body: JSON.stringify(mapContactToUpdatePayload(itemId, data)),
    });
    const updated = await handleResponse<ContactDto>(res, 'Failed to update contact');
    return mapDtoToContact(updated);
  },

  async remove(itemId: string): Promise<void> {
    const res = await apiFetch(`/contacts/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      await handleResponse<unknown>(res, 'Failed to delete contact');
    }
  },

  async search(mark: string): Promise<Contact[]> {
    const trimmed = mark.trim();
    if (!trimmed) {
      return this.list({ scope: 'participants' });
    }
    const params = new URLSearchParams({ mark: trimmed });
    const res = await apiFetch(`/contacts/search?${params.toString()}`, {
      method: 'GET',
    });
    const data = await handleResponse<ContactDto[]>(res, 'Failed to search contacts');
    return data.map(mapDtoToContact);
  },

  async searchParticipants(q: string, opts?: { limit?: number }): Promise<Contact[]> {
    const params = new URLSearchParams();
    const trimmed = q.trim();
    if (trimmed) params.set('q', trimmed);
    params.set('limit', String(opts?.limit ?? 50));
    const res = await apiFetch(`/contacts/participants/search?${params.toString()}`, {
      method: 'GET',
    });
    const data = await handleResponse<ContactDto[]>(res, 'Failed to search participant contacts');
    return data.map(mapDtoToContact);
  },

  /** Get all ledgers linked to a contact (Phase 6: Contact Consolidated Ledger View). */
  async getContactLedgers(contactId: string): Promise<ChartOfAccountDTO[]> {
    const res = await apiFetch(`/contacts/${encodeURIComponent(contactId)}/ledgers`, { method: 'GET' });
    return handleResponse<ChartOfAccountDTO[]>(res, 'Failed to load contact ledgers');
  },

  /** Get unified chronological transaction timeline for all ledgers of a contact. */
  async getContactLedgerTransactions(
    contactId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<VoucherLineDTO[]> {
    const params = new URLSearchParams();
    if (dateFrom?.trim()) params.set('dateFrom', dateFrom.trim());
    if (dateTo?.trim()) params.set('dateTo', dateTo.trim());
    const qs = params.toString();
    const url = qs
      ? `/contacts/${encodeURIComponent(contactId)}/ledger-transactions?${qs}`
      : `/contacts/${encodeURIComponent(contactId)}/ledger-transactions`;
    const res = await apiFetch(url, { method: 'GET' });
    return handleResponse<VoucherLineDTO[]>(res, 'Failed to load contact ledger transactions');
  },
};
