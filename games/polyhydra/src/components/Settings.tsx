import React, { useEffect, useRef, useState } from 'react';
import type { LanguageConfig } from '../types';
import { formatDate } from '@wordaholic/wordle-core';
import { LanguageDropdown } from './LanguageDropdown';
import { BOARD_COUNT_MIN, BOARD_COUNT_MAX } from '@wordaholic/wordle-core';

interface SettingsProps {
  language: string;
  wordLength: number;
  boardCount: number;
  availableLanguages: LanguageConfig[];
  selectedDate: string;
  onLanguageChange: (language: string) => void;
  onWordLengthChange: (length: number) => void;
  onBoardCountChange: (count: number) => void;
  onShowCalendarChange: (show: boolean) => void;
}

const formatDateDisplay = (selectedDate: string | null, today: string): string => {
  if (!selectedDate || selectedDate === today) return 'today';
  const [yearStr, monthStr, dayStr] = selectedDate.split('-');
  const selectedDateObj = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, parseInt(dayStr, 10));
  const todayStr = today.split('-');
  const todayObj = new Date(parseInt(todayStr[0], 10), parseInt(todayStr[1], 10) - 1, parseInt(todayStr[2], 10));
  const diffDays = Math.round((todayObj.getTime() - selectedDateObj.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return 'yesterday';
  const startOfWeek = new Date(todayObj);
  startOfWeek.setDate(todayObj.getDate() - todayObj.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  if (selectedDateObj >= startOfWeek && selectedDateObj <= endOfWeek) {
    return selectedDateObj.toLocaleDateString('en-US', { weekday: 'long' });
  }
  const month = selectedDateObj.toLocaleDateString('en-US', { month: 'short' });
  const day = selectedDateObj.getDate();
  const year = selectedDateObj.getFullYear();
  if (year === todayObj.getFullYear()) return `${month} ${day}`;
  return `${month} ${day}, ${year}`;
};

function useHeaderDefOverflow() {
  const ref = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState('');
  useEffect(() => {
    const bar = ref.current?.closest('.game-header-bar');
    if (!bar) return;
    const read = () => setLevel(bar.getAttribute('data-def-overflow') || '');
    read();
    const mo = new MutationObserver(read);
    mo.observe(bar, { attributes: true, attributeFilter: ['data-def-overflow'] });
    return () => mo.disconnect();
  }, []);
  return [ref, level] as const;
}

function defHidden(key: 'other' | 'language' | 'date', level: string) {
  if (level === 'date') return true;
  if (level === 'language') return key === 'other' || key === 'language';
  if (level === 'other') return key === 'other';
  return false;
}

export const Settings: React.FC<SettingsProps> = ({
  language,
  wordLength,
  boardCount,
  availableLanguages,
  selectedDate,
  onLanguageChange,
  onWordLengthChange,
  onBoardCountChange,
  onShowCalendarChange,
}) => {
  const currentLangConfig = availableLanguages.find((lang) => lang.code === language);
  const today = formatDate();
  const boardOptions = Array.from(
    { length: BOARD_COUNT_MAX - BOARD_COUNT_MIN + 1 },
    (_, i) => i + BOARD_COUNT_MIN
  );
  const [defRef, defOverflow] = useHeaderDefOverflow();

  const languageControl = (id: string) => (
    <div className="language-select-wrapper toolbar-tip">
      <span className="toolbar-tip-label">Language</span>
      <LanguageDropdown
        id={id}
        availableLanguages={availableLanguages}
        value={language}
        onChange={onLanguageChange}
      />
    </div>
  );

  const letterControl = (id?: string, caption = true) => (
    <div className="setting-field">
      {caption ? <span className="setting-caption">Letters</span> : null}
      <select
        id={id}
        value={wordLength}
        onChange={(e) => onWordLengthChange(Number(e.target.value))}
        title="Number of letters"
        aria-label="Number of letters"
      >
        {currentLangConfig?.supportedLengths.map((length) => (
          <option key={length} value={length}>
            {length}
          </option>
        ))}
      </select>
    </div>
  );

  const boardControl = (id?: string, caption = true) => (
    <div className="setting-field">
      {caption ? <span className="setting-caption">Boards</span> : null}
      <select
        id={id}
        value={boardCount}
        onChange={(e) => onBoardCountChange(Number(e.target.value))}
        title="Number of boards"
        aria-label="Number of boards"
      >
        {boardOptions.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );

  const dateLabel = formatDateDisplay(selectedDate || null, today);
  const notToday = Boolean(selectedDate && selectedDate !== today);
  const dateControl = (
    <button
      type="button"
      className={`date-picker-btn${notToday ? '' : ' is-today'}`}
      onClick={() => onShowCalendarChange(true)}
      title={notToday ? dateLabel : 'Calendar'}
      aria-label={notToday ? `Choose daily date, ${dateLabel}` : 'Choose daily date'}
    >
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <line x1="3" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.5"/>
        <line x1="7" y1="4" x2="7" y2="8" stroke="currentColor" strokeWidth="1.5"/>
        <line x1="13" y1="4" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
      <span className="date-display">{formatDateDisplay(selectedDate || null, today)}</span>
    </button>
  );

  return (
    <div className="settings header-def" ref={defRef}>
      <div className="header-def-inline">
        <div data-header-def="other" className="toolbar-picks">
          {letterControl('length-select')}
          {boardControl('board-count-select')}
        </div>
        <div data-header-def="more">
          <button
            type="button"
            className="icon-btn header-icon-btn header-def-trigger"
            data-header-def-trigger=""
            title="Game settings"
            aria-label="Game settings"
            aria-haspopup="menu"
            aria-expanded="false"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="4" y1="8" x2="20" y2="8" />
              <line x1="4" y1="16" x2="20" y2="16" />
              <circle cx="8" cy="8" r="2.2" fill="currentColor" />
              <circle cx="16" cy="16" r="2.2" fill="currentColor" />
            </svg>
          </button>
          <div className="header-def-menu" data-header-def-menu="">
            <div data-header-def="other">
              <span className="header-def-heading">Letters</span>
              {letterControl(undefined, false)}
            </div>
            <div data-header-def="other">
              <span className="header-def-heading">Boards</span>
              {boardControl(undefined, false)}
            </div>
            {defHidden('language', defOverflow) && (
              <div data-header-def="language">
                <span className="header-def-heading">Language</span>
                {languageControl('language-select-overflow')}
              </div>
            )}
            {defHidden('date', defOverflow) && (
              <div data-header-def="date">
                <span className="header-def-heading">Date</span>
                <div className="toolbar-mode">{dateControl}</div>
              </div>
            )}
          </div>
        </div>
        <div data-header-def="language" className="toolbar-picks">
          {languageControl('language-select')}
        </div>
        <div data-header-def="date" className="toolbar-mode">
          {dateControl}
        </div>
      </div>
    </div>
  );
};
