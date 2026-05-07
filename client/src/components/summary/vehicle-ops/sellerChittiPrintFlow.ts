import { toast } from 'sonner';
import { printLogApi } from '@/services/api';
import {
  directPrint,
  generateSellerChiti,
  generateSellerChitiThermal,
  generateCombinedSellerChitiHtml,
  generateCombinedSellerChitiThermal,
} from '@/utils/printTemplates';
import type { BidInfo, SellerChitiChunk } from '@/utils/printTemplates';

/** Same as LogisticsPage `handlePrintSellerChiti` (direct print, no preview). */
export async function printSellerChittiDirect(
  g: { name: string; serial: number; bids: BidInfo[] },
  chitiPrintTraderName: string,
): Promise<boolean> {
  toast.info('🖨 Printing Seller Chiti…');
  try {
    await printLogApi.create({
      reference_type: 'SELLER_CHITI',
      reference_id: g.name,
      print_type: 'SELLER_CHITI',
    });
  } catch {
    // optional
  }
  const ok = await directPrint(
    {
      html: generateSellerChiti(g.name, g.serial, g.bids, 'post-auction', chitiPrintTraderName),
      thermalText: generateSellerChitiThermal(g.name, g.serial, g.bids, 'post-auction', chitiPrintTraderName),
    },
    { mode: 'auto' },
  );
  ok ? toast.success('Seller Chiti sent to printer!') : toast.error('Printer not connected.');
  return ok;
}

/**
 * One print job for multiple sellers: single HTML doc with page breaks + concatenated thermal.
 * Avoids opening the browser print dialog once per seller.
 */
export async function printSellerChittiBatchDirect(
  chunks: SellerChitiChunk[],
  chitiPrintTraderName: string,
  options?: { batchReferenceId?: string },
): Promise<boolean> {
  if (chunks.length === 0) return false;
  const n = chunks.length;
  toast.info(n === 1 ? '🖨 Printing Seller Chiti…' : `🖨 Printing ${n} seller chittis…`);
  try {
    await printLogApi.create({
      reference_type: 'SELLER_CHITI',
      reference_id: options?.batchReferenceId ?? chunks.map((c) => c.sellerName).join('|').slice(0, 240),
      print_type: 'SELLER_CHITI',
    });
  } catch {
    // optional
  }
  const ok = await directPrint(
    {
      html: generateCombinedSellerChitiHtml(chunks, 'post-auction', chitiPrintTraderName),
      thermalText: generateCombinedSellerChitiThermal(chunks, 'post-auction', chitiPrintTraderName),
    },
    { mode: 'auto' },
  );
  ok
    ? toast.success(n === 1 ? 'Seller Chiti sent to printer!' : `${n} seller chittis sent to printer!`)
    : toast.error('Printer not connected.');
  return ok;
}
