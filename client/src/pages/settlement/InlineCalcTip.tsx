import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function InlineCalcTip({ label, lines }: { label: string; lines: string[] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60"
          aria-label={label}
        >
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="z-[99999] max-w-[300px] text-xs leading-relaxed">
        <div className="space-y-0.5">
          {lines.map((line, idx) => (
            <p key={`${label}-${idx}`}>{line}</p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
