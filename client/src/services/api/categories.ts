import type { BusinessCategory } from '@/types/models';
import { apiFetch } from './http';

type BusinessCategoryDto = {
  id?: string | number;
  categoryName?: string;
  isActive?: boolean;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
};

export type BusinessCategoryListPage = {
  categories: BusinessCategory[];
  total: number;
};

function mapDtoToCategory(dto: BusinessCategoryDto): BusinessCategory {
  const id = dto.id;
  return {
    category_id: id != null ? String(id) : '',
    category_name: dto.categoryName ?? '',
    is_active: dto.isActive ?? true,
    created_at: dto.created_at ?? dto.createdAt ?? new Date().toISOString(),
    updated_at: dto.updated_at ?? dto.updatedAt ?? dto.created_at ?? dto.createdAt ?? new Date().toISOString(),
  };
}

async function handleResponse<T>(res: Response, defaultMessage: string): Promise<T> {
  if (res.ok) {
    return res.json() as Promise<T>;
  }

  let message = defaultMessage;
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
      const problem = await res.json();
      if (typeof problem.detail === 'string' && problem.detail.trim().length > 0) {
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

const ADMIN_CATEGORIES_BASE = '/admin/categories';

export const categoryApi = {
  /** List categories (trader context: /api/business-categories). */
  async list(): Promise<BusinessCategory[]> {
    const params = new URLSearchParams({ page: '0', size: '1000' });
    const res = await apiFetch(`/business-categories?${params.toString()}`, {
      method: 'GET',
    });
    const data = await handleResponse<BusinessCategoryDto[]>(res, 'Failed to load categories');
    return data.map(mapDtoToCategory);
  },

  /** List categories (admin context: /api/admin/categories). Use from Admin UI so admin JWT/cookie is used. */
  async adminList(): Promise<BusinessCategory[]> {
    const page = await this.adminListPage({ page: 0, size: 1000 });
    return page.categories;
  },

  /** Paginated categories (admin context). */
  async adminListPage(opts: { page: number; size: number; q?: string }): Promise<BusinessCategoryListPage> {
    const params = new URLSearchParams({
      page: String(opts.page),
      size: String(opts.size),
      sort: 'categoryName,asc',
    });
    if (opts.q?.trim()) {
      params.set('q', opts.q.trim());
    }
    const res = await apiFetch(`${ADMIN_CATEGORIES_BASE}?${params.toString()}`, {
      method: 'GET',
    });
    const data = await handleResponse<BusinessCategoryDto[]>(res, 'Failed to load categories');
    const categories = data.map(mapDtoToCategory);
    return {
      categories,
      total: Number(res.headers.get('X-Total-Count') ?? categories.length),
    };
  },

  async create(payload: { category_name: string; is_active?: boolean }): Promise<BusinessCategory> {
    const res = await apiFetch('/business-categories', {
      method: 'POST',
      body: JSON.stringify({
        categoryName: payload.category_name,
        isActive: payload.is_active ?? true,
      }),
    });
    const dto = await handleResponse<BusinessCategoryDto>(res, 'Failed to create category');
    return mapDtoToCategory(dto);
  },

  /** Create category (admin context). */
  async adminCreate(payload: { category_name: string; is_active?: boolean }): Promise<BusinessCategory> {
    const res = await apiFetch(ADMIN_CATEGORIES_BASE, {
      method: 'POST',
      body: JSON.stringify({
        categoryName: payload.category_name,
        isActive: payload.is_active ?? true,
      }),
    });
    const dto = await handleResponse<BusinessCategoryDto>(res, 'Failed to create category');
    return mapDtoToCategory(dto);
  },

  async update(id: string, payload: { category_name: string; is_active?: boolean }): Promise<BusinessCategory> {
    const res = await apiFetch(`/business-categories/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        id: Number(id),
        categoryName: payload.category_name,
        isActive: payload.is_active,
      }),
    });
    const dto = await handleResponse<BusinessCategoryDto>(res, 'Failed to update category');
    return mapDtoToCategory(dto);
  },

  /** Update category (admin context). */
  async adminUpdate(id: string, payload: { category_name: string; is_active?: boolean }): Promise<BusinessCategory> {
    const res = await apiFetch(`${ADMIN_CATEGORIES_BASE}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        id: Number(id),
        categoryName: payload.category_name,
        isActive: payload.is_active,
      }),
    });
    const dto = await handleResponse<BusinessCategoryDto>(res, 'Failed to update category');
    return mapDtoToCategory(dto);
  },

  async delete(id: string): Promise<void> {
    const res = await apiFetch(`/business-categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) await handleResponse<unknown>(res, 'Failed to delete category');
  },

  /** Delete category (admin context). */
  async adminDelete(id: string): Promise<void> {
    const res = await apiFetch(`${ADMIN_CATEGORIES_BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) await handleResponse<unknown>(res, 'Failed to delete category');
  },
};

