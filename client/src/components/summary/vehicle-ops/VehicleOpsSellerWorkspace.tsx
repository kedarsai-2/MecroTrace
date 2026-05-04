import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ArrivalFullDetail, ArrivalSellerFullDetail } from '@/services/api/arrivals';
import type { LotSummaryDTO } from '@/services/api/auction';
import { cn } from '@/lib/utils';
import { SellerDetailPanel } from './SellerDetailPanel';
import { SellerListSidebar } from './SellerListSidebar';
import { lotSummaryBelongsToSeller, sellerKeyFromArrivalSeller } from './vehicleOpsUtils';

export type VehicleOpsSellerWorkspaceProps = {
  arrivalDetail: ArrivalFullDetail | null;
  lotSummariesForVehicle: LotSummaryDTO[];
  /** True while parent is still loading arrival detail */
  detailLoading?: boolean;
  /** Refetch summary aggregates after auction add/update/delete */
  onAuctionDataInvalidate?: () => void | Promise<void>;
};

export function VehicleOpsSellerWorkspace({
  arrivalDetail,
  lotSummariesForVehicle,
  detailLoading,
  onAuctionDataInvalidate,
}: VehicleOpsSellerWorkspaceProps) {
  const [sellerSearch, setSellerSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const sellers = arrivalDetail?.sellers ?? [];

  const filteredSellers = useMemo(() => {
    const q = sellerSearch.trim().toLowerCase();
    if (!q) return sellers;
    return sellers.filter((s) => {
      const name = (s.sellerName ?? '').toLowerCase();
      const mark = (s.sellerMark ?? '').toLowerCase();
      return name.includes(q) || mark.includes(q);
    });
  }, [sellers, sellerSearch]);

  useEffect(() => {
    if (filteredSellers.length === 0) {
      if (selectedKey != null) setSelectedKey(null);
      return;
    }
    const keys = new Set(filteredSellers.map(sellerKeyFromArrivalSeller));
    if (selectedKey == null || !keys.has(selectedKey)) {
      setSelectedKey(sellerKeyFromArrivalSeller(filteredSellers[0]));
    }
  }, [filteredSellers, selectedKey]);

  const selectedSeller: ArrivalSellerFullDetail | null = useMemo(() => {
    if (selectedKey == null) return filteredSellers[0] ?? null;
    return filteredSellers.find((s) => sellerKeyFromArrivalSeller(s) === selectedKey) ?? filteredSellers[0] ?? null;
  }, [filteredSellers, selectedKey]);

  const sellerLots = useMemo(() => {
    if (!selectedSeller) return [];
    return lotSummariesForVehicle.filter((l) => lotSummaryBelongsToSeller(l, selectedSeller));
  }, [lotSummariesForVehicle, selectedSeller]);

  const handlePrint = () => {
    toast.message('Print', { description: 'Print from vehicle operations is not wired yet.' });
  };

  if (detailLoading && !arrivalDetail) {
    return (
      <div className="glass-card rounded-2xl border border-border/40 p-8 text-center text-sm text-muted-foreground">
        Loading sellers…
      </div>
    );
  }

  if (!arrivalDetail || sellers.length === 0) {
    return (
      <div className="glass-card rounded-2xl border border-border/40 p-8 text-center text-sm text-muted-foreground">
        No seller detail for this vehicle yet.
      </div>
    );
  }

  return (
    <div className="mt-2 flex min-w-0 flex-col gap-3">
      <div className="relative w-full min-w-0">
        <input
          type="search"
          value={sellerSearch}
          onChange={(e) => setSellerSearch(e.target.value)}
          placeholder="Search seller by name or mark…"
          className="h-10 w-full min-w-0 rounded-xl border border-border/40 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6075FF] dark:bg-card"
          aria-label="Search sellers on this vehicle"
        />
      </div>

      {filteredSellers.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">No sellers match this search.</p>
      ) : (
        <div
          className={cn(
            'grid min-h-0 min-w-0 gap-3',
            /* Two-column + scroll panes from lg so tablets keep horizontal seller strip (matches SellerListSidebar). */
            'grid-cols-1 lg:grid-cols-[minmax(200px,280px)_minmax(0,1fr)] lg:items-start lg:gap-4',
          )}
        >
          <div className="min-w-0 self-start">
            <SellerListSidebar
              sellers={filteredSellers}
              lotSummaries={lotSummariesForVehicle}
              selectedKey={selectedKey}
              onSelectKey={setSelectedKey}
            />
          </div>
          <div className="min-w-0">
            <SellerDetailPanel
              seller={selectedSeller}
              sellerLots={sellerLots}
              onPrint={handlePrint}
              onAuctionDataInvalidate={onAuctionDataInvalidate}
            />
          </div>
        </div>
      )}
    </div>
  );
}
