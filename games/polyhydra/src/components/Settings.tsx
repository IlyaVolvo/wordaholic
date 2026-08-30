import React from 'react';
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

  return (
    <div className="settings">
      <div className="toolbar-picks">
        <div className="language-select-wrapper toolbar-tip">
          <span className="toolbar-tip-label">Language</span>
          <LanguageDropdown
            id="language-select"
            availableLanguages={availableLanguages}
            value={language}
            onChange={onLanguageChange}
          />
        </div>
        <div className="toolbar-tip">
          <span className="toolbar-tip-label">Number of letters</span>
          <select
            id="length-select"
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
        <div className="toolbar-tip">
          <span className="toolbar-tip-label">Boards</span>
          <select
            id="board-count-select"
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
      </div>
      <div className="toolbar-mode">
        <button
          type="button"
          className="date-picker-btn"
          onClick={() => onShowCalendarChange(true)}
          title="Calendar"
          aria-label="Choose daily date"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="3" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="7" y1="4" x2="7" y2="8" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="13" y1="4" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          <span className="date-display">{formatDateDisplay(selectedDate || null, today)}</span>
        </button>
      </div>
    </div>
  );
};
