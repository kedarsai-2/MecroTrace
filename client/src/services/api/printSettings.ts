import { apiFetch } from './http';

const BASE = '/trader/print-settings';

export type PrintModuleKey = 'SETTLEMENT' | 'BILLING' | 'BILLING_NON_GST';
export type PrintPaperSize = 'A4' | 'A5';

export interface PrintCopyItem {
  label: string;
}

export const DEFAULT_PRINT_COPIES: PrintCopyItem[] = [{ label: 'ORIGINAL COPY' }];

export function parsePrintCopiesJson(raw: string | null | undefined): PrintCopyItem[] {
  if (raw == null || !String(raw).trim()) {
    return DEFAULT_PRINT_COPIES.map((c) => ({ ...c }));
  }
  try {
    const arr = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(arr) || arr.length === 0) {
      return DEFAULT_PRINT_COPIES.map((c) => ({ ...c }));
    }
    const out: PrintCopyItem[] = [];
    for (const el of arr) {
      const label = String((el as { label?: unknown })?.label ?? '').trim();
      if (label) out.push({ label });
    }
    return out.length > 0 ? out : DEFAULT_PRINT_COPIES.map((c) => ({ ...c }));
  } catch {
    return DEFAULT_PRINT_COPIES.map((c) => ({ ...c }));
  }
}

export function serializePrintCopiesJson(copies: PrintCopyItem[]): string {
  const list = copies.length > 0 ? copies : DEFAULT_PRINT_COPIES;
  return JSON.stringify(list.map((c) => ({ label: String(c.label || '').trim() || 'COPY' })).filter((c) => c.label));
}

export interface PrintSettingDTO {
  id?: number;
  module_key: PrintModuleKey;
  paper_size_with_header: PrintPaperSize;
  paper_size_without_header: PrintPaperSize;
  include_header: boolean;
  /** Optional minimum next bill / patti sequence suffix; omit or null = no floor. */
  bill_number_start_from?: number | null;
  /** JSON string: `[{ "label": string }]`; server defaults when null. */
  print_copies_json?: string | null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function parsePaper(v: unknown, fallback: PrintPaperSize): PrintPaperSize {
  const u = String(v ?? '').trim().toUpperCase();
  return u === 'A5' ? 'A5' : u === 'A4' ? 'A4' : fallback;
}

/** Coerce API row to canonical DTO (snake_case or camelCase from Jackson). */
export function normalizePrintSettingDTO(raw: unknown): PrintSettingDTO {
  const r = asRecord(raw);
  const mk = String(r.module_key ?? r.moduleKey ?? '')
    .trim()
    .toUpperCase();
  if (mk !== 'SETTLEMENT' && mk !== 'BILLING' && mk !== 'BILLING_NON_GST') {
    throw new Error(`Invalid print setting module_key: ${mk}`);
  }
  const wh = parsePaper(r.paper_size_with_header ?? r.paperSizeWithHeader, 'A4');
  const woh = parsePaper(r.paper_size_without_header ?? r.paperSizeWithoutHeader, 'A4');
  const ih = r.include_header ?? r.includeHeader;
  const bnRaw = r.bill_number_start_from ?? r.billNumberStartFrom;
  let bill_number_start_from: number | null | undefined;
  if (bnRaw == null || bnRaw === '') {
    bill_number_start_from = null;
  } else {
    const n = Number(bnRaw);
    bill_number_start_from = Number.isFinite(n) ? Math.floor(n) : null;
  }
  const copiesRaw = r.print_copies_json ?? r.printCopiesJson;
  const print_copies_json =
    copiesRaw == null || copiesRaw === '' ? null : typeof copiesRaw === 'string' ? copiesRaw : JSON.stringify(copiesRaw);

  return {
    id: r.id != null && r.id !== '' ? Number(r.id) : undefined,
    module_key: mk as PrintModuleKey,
    paper_size_with_header: wh,
    paper_size_without_header: woh,
    include_header: Boolean(ih),
    bill_number_start_from,
    print_copies_json,
  };
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  let message = fallback;
  try {
    const problem = (await res.json()) as {
      detail?: string;
      title?: string;
      message?: string;
      fieldErrors?: Array<{ field: string; message: string }>;
    };
    if (typeof problem.detail === 'string' && problem.detail.trim()) {
      message = problem.detail.trim();
    } else if (typeof problem.message === 'string' && problem.message.trim()) {
      message = problem.message.trim();
    } else if (typeof problem.title === 'string' && problem.title.trim()) {
      message = problem.title.trim();
    } else if (Array.isArray(problem.fieldErrors) && problem.fieldErrors.length > 0) {
      message = problem.fieldErrors.map((e) => `${e.field}: ${e.message}`).join('; ');
    }
  } catch {
    try {
      const text = (await res.clone().text()).trim();
      if (text && text.length < 240) message = text;
    } catch {
      /* ignore */
    }
  }
  return message;
}

export const printSettingsApi = {
  list: async (opts?: { signal?: AbortSignal }): Promise<PrintSettingDTO[]> => {
    const res = await apiFetch(BASE, { method: 'GET', signal: opts?.signal });
    if (!res.ok) throw new Error(await readErrorMessage(res, res.statusText || 'Failed to load print settings'));
    const data = await res.json();
    if (!Array.isArray(data)) {
      const hint = data == null ? 'null' : typeof data;
      throw new Error(`Print settings API expected a JSON array, got ${hint}.`);
    }
    const out: PrintSettingDTO[] = [];
    for (const row of data) {
      try {
        out.push(normalizePrintSettingDTO(row));
      } catch {
        /* skip malformed rows */
      }
    }
    return out;
  },

  upsert: async (body: PrintSettingDTO): Promise<PrintSettingDTO> => {
    const res = await apiFetch(BASE, { method: 'PUT', body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await readErrorMessage(res, res.statusText || 'Failed to save print setting'));
    return normalizePrintSettingDTO(await res.json());
  },
};
