import { X } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import { emailAddressSchema } from '@hpc-mail/shared';
import { cn } from '@/lib/cn';

export interface RecipientInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  id?: string;
  placeholder?: string;
  'aria-describedby'?: string;
}

export function RecipientInput({ value, onChange, id, placeholder, ...aria }: RecipientInputProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addToken = (raw: string) => {
    const candidate = raw.trim().replace(/[,;\s]+$/, '');
    if (!candidate) return;
    const parsed = emailAddressSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(`“${candidate}” 不是有效的邮箱地址`);
      return;
    }
    if (!value.includes(parsed.data)) onChange([...value, parsed.data]);
    setText('');
    setError(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
      event.preventDefault();
      addToken(text);
    } else if (event.key === 'Backspace' && text === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 py-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20',
          error && 'border-critical focus-within:border-critical focus-within:ring-critical/20',
        )}
      >
        {value.map((email) => (
          <span
            key={email}
            className="inline-flex items-center gap-1 rounded-sm bg-surface-active px-1.5 py-0.5 text-[13px] text-ink"
          >
            {email}
            <button
              type="button"
              aria-label={`移除 ${email}`}
              onClick={() => onChange(value.filter((item) => item !== email))}
              className="text-ink-tertiary hover:text-ink"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          {...aria}
          value={text}
          placeholder={value.length === 0 ? placeholder : undefined}
          onChange={(event) => {
            setText(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => addToken(text)}
          className="h-6 min-w-40 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-tertiary"
        />
      </div>
      {error && <p className="text-xs text-critical">{error}</p>}
    </div>
  );
}
