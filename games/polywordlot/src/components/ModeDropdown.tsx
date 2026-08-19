import React, { useState, useRef, useEffect } from 'react';

const MODE_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'practice', label: 'Practice' },
] as const;

interface ModeDropdownProps {
  randomMode: boolean;
  onChange: (randomMode: boolean) => void;
  disabled?: boolean;
}

export const ModeDropdown: React.FC<ModeDropdownProps> = ({
  randomMode,
  onChange,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const value = randomMode ? 'practice' : 'daily';
  const current = MODE_OPTIONS.find((opt) => opt.value === value) ?? MODE_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="mode-dropdown" ref={containerRef}>
      <button
        type="button"
        className="mode-select mode-dropdown-trigger"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Game mode: Daily or Practice"
      >
        <span>{current.label}</span>
        <span className="language-dropdown-chevron" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <ul
          className="mode-dropdown-list"
          role="listbox"
          aria-label="Game mode: Daily or Practice"
        >
          {MODE_OPTIONS.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`language-dropdown-option ${opt.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt.value === 'practice');
                setOpen(false);
              }}
            >
              <span className="language-dropdown-option-name">{opt.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
