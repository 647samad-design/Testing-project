import { useState } from 'react';
import { Input } from '@/components/ui/input';

interface SearchPickerProps<T extends { id: string }> {
  items: T[];
  value: string;
  onChange: (id: string) => void;
  getLabel: (item: T) => string;
  placeholder: string;
  maxResults?: number;
}

/**
 * Type-ahead picker over a list of items (candidates, sources, ...) --
 * a plain <select> isn't usable against hundreds of rows.
 *
 * Two behaviours that matter and were wrong in the first version, which
 * existed as two copy-pasted copies inside AdminDashboardPage:
 * - Closes on blur. Previously, focusing the field and clicking away
 *   without choosing left the dropdown open and the input showing empty
 *   text even though a value WAS selected, so an admin would reasonably
 *   think nothing was chosen.
 * - Options select on mousedown (with preventDefault), which fires before
 *   the input's blur, so closing on blur can't swallow the click.
 */
export function SearchPicker<T extends { id: string }>({
  items, value, onChange, getLabel, placeholder, maxResults = 8,
}: SearchPickerProps<T>) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = items.find((i) => i.id === value);
  const filtered = items
    .filter((i) => getLabel(i).toLowerCase().includes(query.toLowerCase()))
    .slice(0, maxResults);

  return (
    <div className="relative">
      <Input
        value={open ? query : (selected ? getLabel(selected) : '')}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <div role="listbox" className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card shadow-md max-h-48 overflow-y-auto">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={item.id === value}
              onMouseDown={(e) => { e.preventDefault(); onChange(item.id); setOpen(false); setQuery(''); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/50 truncate"
            >
              {getLabel(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
