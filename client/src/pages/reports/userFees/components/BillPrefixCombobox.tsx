import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type BillPrefixComboboxProps = {
  prefixes: string[];
  value: string;
  onChange: (prefix: string) => void;
  disabled?: boolean;
  idPrefix?: string;
};

export function BillPrefixCombobox({ prefixes, value, onChange, disabled, idPrefix }: BillPrefixComboboxProps) {
  const [open, setOpen] = useState(false);
  const triggerId = `${idPrefix ?? 'bp'}-trigger`;

  const label = useMemo(() => {
    if (!value) return 'All prefixes';
    return value;
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          id={triggerId}
          aria-expanded={open}
          disabled={disabled}
          className="h-10 lg:h-9 w-full justify-between font-normal text-sm px-2.5 border-border/60 bg-background"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[200px] max-w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search prefix…" className="h-9" />
          <CommandList>
            <CommandEmpty>No prefix found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                keywords={['all', 'prefixes']}
                onSelect={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                All prefixes
              </CommandItem>
              {prefixes.map((p) => (
                <CommandItem
                  key={p}
                  value={p}
                  keywords={[p.toLowerCase()]}
                  onSelect={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === p ? 'opacity-100' : 'opacity-0')} />
                  {p}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
