import React, { useState, useEffect } from 'react';
import type { LanguageConfig } from '../types';
import { formatDate } from '../utils/dailyWord';
import { apiClient } from '../api/client';
import { LanguageDropdown } from './LanguageDropdown';

interface SettingsProps {
  userId: number;
  language: string;
  wordLength: number;
  randomMode: boolean;
  availableLanguages: LanguageConfig[];
  selectedDate: string;
  onLanguageChange: (language: string) => void;
  onWordLengthChange: (length: number) => void;
  onRandomModeChange: (randomMode: boolean) => void;
  onDateChange: (date: string) => void;
  onRestartPractice?: () => void;
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

export const Settings: React.FC<SettingsProps> = ({
  userId,
  language,
  wordLength,
  randomMode,
  availableLanguages,
  selectedDate,
  onLanguageChange,
  onWordLengthChange,
  onRandomModeChange,
  onDateChange: _onDateChange,
  onRestartPractice,
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
  const [_internalCalendarMonth, setInternalCalendarMonth] = useState<Date>(() => {
    // Initialize calendar month to the selected date
    if (selectedDate) {
      const [year, month] = selectedDate.split('-').map(Number);
      return new Date(year, month - 1, 1);
    }
    return new Date();
  });

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
    if (showCalendar && !randomMode) {
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
  }, [showCalendar, language, wordLength, randomMode, userId, onShowCalendarChange]);

  // Update calendar month when selectedDate changes
  useEffect(() => {
    if (selectedDate) {
      const [year, month] = selectedDate.split('-').map(Number);
      const newMonth = new Date(year, month - 1, 1);
      // Only update if the month actually changed to avoid infinite loops
      const currentMonth = onCalendarMonthChange ? _externalCalendarMonth : _internalCalendarMonth;
      if (!currentMonth || 
          currentMonth.getFullYear() !== newMonth.getFullYear() || 
          currentMonth.getMonth() !== newMonth.getMonth()) {
        setCalendarMonth(newMonth);
      }
    }
  }, [selectedDate]); // Removed setCalendarMonth from dependencies - it's recreated on every render

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
            disabled={disabled}
          />
        </div>
        <div className="toolbar-tip">
          <span className="toolbar-tip-label">Number of letters</span>
          <select
            id="length-select"
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
      </div>
      <div className="toolbar-mode">
        <select
          className="mode-select"
          value={randomMode ? 'practice' : 'daily'}
          onChange={(e) => onRandomModeChange(e.target.value === 'practice')}
          disabled={disabled}
          aria-label="Game mode: Daily or Practice"
        >
          <option value="daily">Daily</option>
          <option value="practice">Practice</option>
        </select>
        {randomMode && onRestartPractice && (
          <button
            type="button"
            className="restart-practice-button"
            onClick={onRestartPractice}
            disabled={disabled}
            title="New practice game"
            aria-label="New practice game"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
        )}
        {!randomMode && (
          <button
            type="button"
            className="date-picker-btn"
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
        )}
      </div>
    </div>
  );
};

