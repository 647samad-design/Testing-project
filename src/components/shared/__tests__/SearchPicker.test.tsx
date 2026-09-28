import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { SearchPicker } from '@/components/shared/SearchPicker';

const ITEMS = [
  { id: '1', name: 'Jane Doe' },
  { id: '2', name: 'John Smith' },
  { id: '3', name: 'Janet Lee' },
];

function Harness({ onChangeSpy }: { onChangeSpy?: (id: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <SearchPicker
      items={ITEMS}
      value={value}
      onChange={(id) => { setValue(id); onChangeSpy?.(id); }}
      getLabel={(i) => i.name}
      placeholder="Search…"
    />
  );
}

describe('SearchPicker', () => {
  afterEach(() => cleanup());

  it('shows matching options on focus and filters as you type', () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText('Search…');
    fireEvent.focus(input);
    expect(screen.getAllByRole('option')).toHaveLength(3);

    fireEvent.change(input, { target: { value: 'jan' } });
    const labels = screen.getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual(['Jane Doe', 'Janet Lee']);
  });

  it('selects an option and shows its label in the input afterwards', () => {
    const spy = vi.fn();
    render(<Harness onChangeSpy={spy} />);
    const input = screen.getByPlaceholderText('Search…') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.mouseDown(screen.getByText('John Smith'));

    expect(spy).toHaveBeenCalledWith('2');
    expect(input.value).toBe('John Smith');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on blur and still shows the selected value -- previously it stayed open with a blank input', () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText('Search…') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.mouseDown(screen.getByText('Jane Doe'));
    expect(input.value).toBe('Jane Doe');

    // Focus again (clears the query to browse), then leave without choosing.
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.blur(input);

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.value).toBe('Jane Doe');
  });

  it('renders nothing in the list when no item matches', () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText('Search…');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
