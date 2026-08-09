import React, { useState, useRef, useEffect } from 'react';
import type { LanguageConfig } from '../types';

interface LanguageDropdownProps {
  availableLanguages: LanguageConfig[];
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  id?: string;
  /** When true, trigger shows flag + name (e.g. for Statistics); otherwise only flag. */
  showNameInTrigger?: boolean;
}

export const LanguageDropdown: React.FC<LanguageDropdownProps> = ({
  availableLanguages,
  value,
  onChange,
  disabled = false,
  id = 'language-select',
  showNameInTrigger = false,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const current = availableLanguages.find((l) => l.code === value);
  const displayLabel = current?.flag ?? '🌐';
  const displayName = current?.name ?? value;

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
    <div className="language-dropdown" ref={containerRef} id={id}>
      <button
        type="button"
        className="language-dropdown-trigger"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${current?.name ?? value}`}
        title={current?.name}
      >
        <span className="language-dropdown-flag" aria-hidden="true">
          {displayLabel}
        </span>
        {showNameInTrigger && (
          <span className="language-dropdown-trigger-name">{displayName}</span>
        )}
        <span className="language-dropdown-chevron" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <ul
          className="language-dropdown-list"
          role="listbox"
          aria-label="Select language"
        >
          {availableLanguages.map((lang) => (
            <li
              key={lang.code}
              role="option"
              aria-selected={lang.code === value}
              className={`language-dropdown-option ${lang.code === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(lang.code);
                setOpen(false);
              }}
            >
              {lang.flag && <span className="language-dropdown-option-flag">{lang.flag}</span>}
              <span className="language-dropdown-option-name">{lang.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
