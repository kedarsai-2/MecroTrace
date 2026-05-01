import { apiFetch } from './http';

const BASE = '/trader/auction-touch-layout';

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  let message = fallback;
  try {
    const problem = (await res.json()) as { detail?: string; message?: string; title?: string };
    if (typeof problem.detail === 'string' && problem.detail.trim()) message = problem.detail.trim();
    else if (typeof problem.message === 'string' && problem.message.trim()) message = problem.message.trim();
    else if (typeof problem.title === 'string' && problem.title.trim()) message = problem.title.trim();
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

/** Stored per trader; survives sessions and devices for the same business. */
export const auctionTouchLayoutApi = {
  async get(opts?: { signal?: AbortSignal }): Promise<string | null> {
    const res = await apiFetch(BASE, { method: 'GET', signal: opts?.signal });
    if (!res.ok) throw new Error(await readErrorMessage(res, res.statusText || 'Failed to load layout'));
    const data = (await res.json()) as { layout_json?: string | null; layoutJson?: string | null };
    const raw = data.layout_json ?? data.layoutJson;
    if (raw == null || typeof raw !== 'string' || !raw.trim()) return null;
    return raw.trim();
  },

  async save(layoutJson: string, opts?: { signal?: AbortSignal }): Promise<void> {
    const res = await apiFetch(BASE, {
      method: 'PUT',
      body: JSON.stringify({ layout_json: layoutJson }),
      signal: opts?.signal,
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, res.statusText || 'Failed to save layout'));
  },
};
