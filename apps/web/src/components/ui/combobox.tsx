import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { type KeyboardEvent, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

export interface ComboboxProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = '请选择',
  searchPlaceholder = '搜索…',
  emptyText = '无匹配项',
  clearable = true,
  disabled,
  className,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const selected = options.find((option) => option.value === value) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (option) => option.label.toLowerCase().includes(q) || option.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  const commit = (option: ComboboxOption) => {
    onChange(option.value);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[active];
      if (option) commit(option);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery('');
          setActive(0);
        }
      }}
    >
      <div className="relative">
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={aria['aria-label']}
            className={cn(
              'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-line-strong bg-surface pl-3 text-sm outline-none transition-[border-color,box-shadow]',
              'focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60',
              clearable && selected ? 'pr-14' : 'pr-3',
              className,
            )}
          >
            <span className={cn('truncate', selected ? 'text-ink' : 'text-ink-tertiary')}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-ink-tertiary" />
          </button>
        </PopoverPrimitive.Trigger>
        {clearable && selected && !disabled && (
          <button
            type="button"
            aria-label="清除选择"
            onClick={() => onChange(null)}
            className="absolute right-8 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-ink-tertiary hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-lg border border-line bg-surface shadow-md"
        >
          <div className="border-b border-line p-2">
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              className="h-8 w-full rounded-md bg-surface px-2 text-sm text-ink outline-none placeholder:text-ink-tertiary"
            />
          </div>
          <div role="listbox" className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-ink-tertiary">{emptyText}</p>
            ) : (
              filtered.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => commit(option)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                    index === active ? 'bg-accent-soft text-accent' : 'text-ink',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.description && (
                      <span className="block truncate text-xs text-ink-tertiary">{option.description}</span>
                    )}
                  </span>
                  {option.value === value && <Check className="size-4 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
