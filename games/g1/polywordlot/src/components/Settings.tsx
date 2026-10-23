import React, { useState, useEffect, useRef } from 'react';
import type { LanguageConfig } from '../types';
import { formatDate } from '../utils/dailyWord';
import { calendarMonthForSelection } from '../../../../../app/daily/variantVisit.js';
import { apiClient } from '../api/client';
import { LanguageDropdown } from './LanguageDropdown';

interface SettingsProps {
  userId: number;
  language: string;
  wordLength: number;
  availableLanguages: LanguageConfig[];
  selectedDate: string;
  onLanguageChange: (language: string) => void;
  onWordLengthChange: (length: number) => void;
  onDateChange: (date: string) => void;
  disabled?: boolean;
  onShowCalendarChange?: (show: boolean) => void;
  showCalendar?: boolean;
  calendarGames?: any[];
  calendarMonth?: Date;
  onCalendarMonthChange?: (date: Date) => void;
}

// Format date for display - show "today", "yesterday", day of week, or actual date
const formatDateDisplay = (selectedDate: string | null, today: string): string => {
  if (!selectedDate || selectedDate === today) {
    return 'today';
  }
  
  // Parse dates in local time (YYYY-MM-DD format)
  const [yearStr, monthStr, dayStr] = selectedDate.split('-');
  const selectedDateObj = new Date(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr));
  const todayStr = today.split('-');
  const todayObj = new Date(parseInt(todayStr[0]), parseInt(todayStr[1]) - 1, parseInt(todayStr[2]));
  
  // Calculate days difference
  const diffTime = todayObj.getTime() - selectedDateObj.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  // Show "yesterday" if it's 1 day ago
  if (diffDays === 1) {
    return 'yesterday';
  }
  
  // Check if it's in the same week as today
  const startOfWeek = new Date(todayObj);
  startOfWeek.setDate(todayObj.getDate() - todayObj.getDay()); // Sunday
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
  
  if (selectedDateObj >= startOfWeek && selectedDateObj <= endOfWeek) {
    // Same week - show day of week
    const dayOfWeek = selectedDateObj.toLocaleDateString('en-US', { weekday: 'long' });
    return dayOfWeek;
  }
  
  // Otherwise show actual date
  const month = selectedDateObj.toLocaleDateString('en-US', { month: 'short' });
  const day = selectedDateObj.getDate();
  const year = selectedDateObj.getFullYear();
  const todayYear = todayObj.getFullYear();
  
  if (year === todayYear) {
    return `${month} ${day}`;
  }
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
  userId,
  language,
  wordLength,
  availableLanguages,
  selectedDate,
  onLanguageChange,
  onWordLengthChange,
  onDateChange: _onDateChange,
  disabled = false,
  onShowCalendarChange,
  showCalendar: externalShowCalendar,
  calendarGames: _externalCalendarGames,
  calendarMonth: _externalCalendarMonth,
  onCalendarMonthChange,
}) => {
  const currentLangConfig = availableLanguages.find(lang => lang.code === language);
  const today = formatDate();

  const [internalShowCalendar, setInternalShowCalendar] = useState(false);
  const [_internalCalendarGames, setInternalCalendarGames] = useState<any[]>([]);
  const [_internalCalendarMonth, setInternalCalendarMonth] = useState<Date>(() =>
    calendarMonthForSelection(selectedDate)
  );

  // Use external state if provided, otherwise use internal state
  const showCalendar = externalShowCalendar !== undefined ? externalShowCalendar : internalShowCalendar;
  
  const setShowCalendar = (value: boolean) => {
    if (onShowCalendarChange) {
      onShowCalendarChange(value);
    } else {
      setInternalShowCalendar(value);
    }
  };
  
  const setCalendarMonth = (date: Date) => {
    if (onCalendarMonthChange) {
      onCalendarMonthChange(date);
    } else {
      setInternalCalendarMonth(date);
    }
  };

  // Load games for calendar when it opens
  useEffect(() => {
    if (showCalendar) {
      const loadGames = async () => {
        try {
          const response = await apiClient.getHistory(language, wordLength, 10000);
          // Filter to only daily games (non-random mode)
          const dailyGames = response.games.filter((game: any) => !game.isRandomMode);
          if (onShowCalendarChange === undefined) {
            // Only set internal state if not using external state
            setInternalCalendarGames(dailyGames);
          }
        } catch (err) {
          console.error('Failed to load games for calendar:', err);
        }
      };
      loadGames();
    }
  }, [showCalendar, language, wordLength, userId, onShowCalendarChange]);

  const [defRef, defOverflow] = useHeaderDefOverflow();

  // Follow the selected puzzle date's month while that date changes
  useEffect(() => {
    if (!selectedDate) return;
    const newMonth = calendarMonthForSelection(selectedDate);
    const currentMonth = onCalendarMonthChange ? _externalCalendarMonth : _internalCalendarMonth;
    if (
      !currentMonth ||
      currentMonth.getFullYear() !== newMonth.getFullYear() ||
      currentMonth.getMonth() !== newMonth.getMonth()
    ) {
      setCalendarMonth(newMonth);
    }
  }, [selectedDate]); // Removed setCalendarMonth from dependencies - it's recreated on every render

  const languageControl = (id: string) => (
    <div className="language-select-wrapper toolbar-tip">
      <span className="toolbar-tip-label">Language</span>
      <LanguageDropdown
        id={id}
        availableLanguages={availableLanguages}
        value={language}
        onChange={onLanguageChange}
        disabled={disabled}
      />
    </div>
  );

  const lengthControl = (id?: string) => (
    <div className="toolbar-tip">
      <span className="toolbar-tip-label">Number of letters</span>
      <select
        id={id}
        value={wordLength}
        onChange={(e) => onWordLengthChange(Number(e.target.value))}
        disabled={disabled}
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

  const isToday = !selectedDate || selectedDate === today;
  const dateControl = (
    <button
      type="button"
      className={`date-picker-btn${isToday ? ' is-today' : ''}`}
      onClick={() => !disabled && setShowCalendar(true)}
      disabled={disabled}
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
  );

  return (
    <div className="settings header-def" ref={defRef}>
      <div className="header-def-inline">
        <div data-header-def="other" className="toolbar-picks">
          {lengthControl('length-select')}
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
          {defHidden('other', defOverflow) && (
            <div data-header-def="other">
              <span className="header-def-heading">Letters</span>
              {lengthControl()}
            </div>
          )}
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

