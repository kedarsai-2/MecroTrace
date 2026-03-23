import { Package, Printer, RotateCcw } from 'lucide-react';

interface SellerInfoCardProps {
  sellers: Array<{
    sellerName: string;
    sellerMark?: string;
    sellerPhone?: string;
    lots: Array<{
      id?: number;
      lotName: string;
      commodityName?: string;
      bagCount?: number;
      brokerTag?: string | null;
      variant?: string | null;
    }>;
  }>;
  onPrint?: () => void;
  onRefresh?: () => void;
  hidePrint?: boolean;
}

const SellerInfoCard = ({ sellers, onPrint, onRefresh, hidePrint }: SellerInfoCardProps) => {
  if (!sellers || sellers.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Seller Information</p>
        <div className="flex gap-1.5">
          {onRefresh && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onRefresh();
              }}
              className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
            >
              <RotateCcw className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
          {!hidePrint && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                if (onPrint) {
                  onPrint();
                } else if (typeof window !== 'undefined' && window.print) {
                  window.print();
                }
              }}
              className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
            >
              <Printer className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {sellers.map((seller, si) => (
        <div key={si} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[9px] font-bold">{seller.sellerMark || seller.sellerName?.charAt(0) || '?'}</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">{seller.sellerName}</p>
              {seller.sellerMark && <p className="text-[9px] text-muted-foreground">Alias: {seller.sellerMark}</p>}
            </div>
          </div>

          {seller.lots && seller.lots.length > 0 && (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[10px] min-w-[280px]">
                <thead>
                  <tr className="border-b border-border/20">
                    <th className="text-left py-1 px-1.5 text-muted-foreground font-semibold">Lot</th>
                    <th className="text-left py-1 px-1.5 text-muted-foreground font-semibold">Commodity</th>
                    <th className="text-left py-1 px-1.5 text-muted-foreground font-semibold">Package</th>
                    <th className="text-right py-1 px-1.5 text-muted-foreground font-semibold">Qty</th>
                    <th className="text-left py-1 px-1.5 text-muted-foreground font-semibold">Variant</th>
                  </tr>
                </thead>
                <tbody>
                  {seller.lots.map((lot, li) => (
                    <tr key={lot.id ?? li} className="border-b border-border/10">
                      <td className="py-1 px-1.5 font-medium text-foreground">
                        <span className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[9px] font-bold">
                          {lot.lotName || `LOT-${li + 1}`}
                        </span>
                      </td>
                      <td className="py-1 px-1.5 text-foreground">{lot.commodityName ?? '—'}</td>
                      <td className="py-1 px-1.5 text-muted-foreground">Bags</td>
                      <td className="py-1 px-1.5 text-right font-medium text-foreground">{lot.bagCount ?? 0}</td>
                      <td className="py-1 px-1.5 text-muted-foreground">{lot.variant ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default SellerInfoCard;
