import { toast } from 'sonner';
import type { ArrivalSummary } from '@/services/api/arrivals';
import { arrivalsApi } from '@/services/api';
import { auctionApi, fetchAllAuctionResults, type AuctionResultDTO, type LotSummaryDTO } from '@/services/api/auction';
import { buildSellerChittiBidInfos, resolveSellerChittiSerial } from './buildSellerChittiBidInfos';
import { printSellerChittiBatchDirect } from './sellerChittiPrintFlow';
import type { SellerChitiChunk } from '@/utils/printTemplates';

/**
 * Grid card Print: load arrival + lots + results, one print job with all sellers that have auctioned lines.
 * Does not navigate.
 */
export async function printSellerChittiFromArrivalSummary(
  arrival: ArrivalSummary,
  chitiPrintTraderName: string,
): Promise<boolean> {
  const vid = Number(arrival.vehicleId);
  if (!Number.isFinite(vid)) {
    toast.error('Invalid vehicle.');
    return false;
  }

  const detail = await arrivalsApi.getById(vid).catch(() => null);
  if (!detail?.sellers?.length) {
    toast.error('No seller detail for this vehicle.');
    return false;
  }

  let lotsList: LotSummaryDTO[] = [];
  try {
    const res = await auctionApi.listLots({ size: 2000, sort: 'id,asc' });
    lotsList = Array.isArray(res) ? res : [];
  } catch {
    toast.error('Could not load lots.');
    return false;
  }

  const vn = (arrival.vehicleNumber ?? '').trim().toLowerCase();
  const lotRows = vn
    ? lotsList.filter((l) => (l.vehicle_number ?? '').trim().toLowerCase() === vn)
    : [];

  let auctionResults: AuctionResultDTO[] = [];
  try {
    auctionResults = await fetchAllAuctionResults(12, 100);
  } catch {
    toast.error('Could not load auction results.');
    return false;
  }

  const chunks: SellerChitiChunk[] = [];
  for (const seller of detail.sellers) {
    const bids = buildSellerChittiBidInfos(auctionResults, detail, seller, lotRows);
    if (bids.length === 0) continue;
    const sellerName = (seller.sellerName ?? '').trim() || 'Unknown';
    const sellerSerial = resolveSellerChittiSerial(seller, bids);
    chunks.push({ sellerName, sellerSerial, bids });
  }

  if (chunks.length === 0) {
    toast.error('Nothing to print — no auctioned bags for any seller on this vehicle.');
    return false;
  }

  return printSellerChittiBatchDirect(chunks, chitiPrintTraderName, {
    batchReferenceId: `vehicle:${arrival.vehicleId}`,
  });
}
