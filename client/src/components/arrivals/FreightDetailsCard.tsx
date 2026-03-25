interface FreightDetailsCardProps {
  freightRate: number;
  netWeight: number;
  freightMethod: string;
  freightTotal: number;
  advancePaid: number;
  noRental: boolean;
}

const METHODS: Record<string, string> = {
  BY_WEIGHT: 'By Weight',
  BY_COUNT: 'By Count',
  LUMPSUM: 'Lumpsum',
  DIVIDE_BY_WEIGHT: 'Lumpsum + Divide',
};

const FreightDetailsCard = ({ freightRate = 0, netWeight = 0, freightMethod = 'BY_WEIGHT', freightTotal = 0, advancePaid = 0, noRental = false }: FreightDetailsCardProps) => {
  if (noRental || (freightTotal ?? 0) <= 0) return null;

  const perKg = freightMethod === 'BY_WEIGHT' ? 1 : 0;
  const calculatedCharges = freightTotal;
  const finalCharges = Math.max(0, calculatedCharges - advancePaid);

  return (
    <div className="rounded-xl border border-border/30 p-3.5 space-y-3">
      <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Freight — Weight Based</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <span className="text-muted-foreground">Method</span>
        <span className="font-medium text-foreground text-right">{METHODS[freightMethod] || freightMethod}</span>

        <span className="text-muted-foreground">Freight Rate</span>
        <span className="font-medium text-foreground text-right">₹{freightRate.toLocaleString()}</span>

        <span className="text-muted-foreground">Net Weight</span>
        <span className="font-medium text-foreground text-right">{netWeight.toLocaleString()} kg</span>

        {perKg > 0 && (
          <>
            <span className="text-muted-foreground">Per</span>
            <span className="font-medium text-foreground text-right">{perKg} kg</span>
          </>
        )}

        <span className="text-muted-foreground">Calculated Charges</span>
        <span className="font-bold text-foreground text-right">₹{calculatedCharges.toLocaleString()}</span>

        <span className="text-muted-foreground">Rental Advance</span>
        <span className="font-medium text-red-500 text-right">− ₹{advancePaid.toLocaleString()}</span>
      </div>

      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 flex justify-between items-center border border-amber-200/40 dark:border-amber-800/30 mt-1">
        <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">Freight Charges (Final)</span>
        <span className="text-lg font-bold text-foreground">₹{finalCharges.toLocaleString()}</span>
      </div>
      <p className="text-[11px] text-muted-foreground italic">Freight Charges = Calculated Charges − Rental Advance</p>
    </div>
  );
};

export default FreightDetailsCard;
