import React from 'react';

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type DayResult = { plays: number; best: number };

type Day = {
  date: Date;
  day: number;
  result: DayResult | null;
  current: boolean;
  today: boolean;
  future: boolean;
  selected: boolean;
};

export const Calendar: React.FC<{
  results: Map<string, DayResult>;
  selected: string;
  month: Date;
  onMonthChange: (date: Date) => void;
  onDateClick: (date: string) => void;
}> = ({ results, selected, month, onMonthChange, onDateClick }) => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatLocalDate(today);
  const canNext = year < today.getFullYear() || (year === today.getFullYear() && monthIndex < today.getMonth());
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Day[] = [];
  for (let i = 0; i < first.getDay(); i++) {
    const date = new Date(year, monthIndex, -i);
    cells.push({ date, day: 0, result: null, current: false, today: false, future: false, selected: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, monthIndex, day);
    date.setHours(0, 0, 0, 0);
    const key = formatLocalDate(date);
    const future = key > todayStr;
    cells.push({
      date,
      day: future ? 0 : day,
      result: future ? null : results.get(key) || null,
      current: true,
      today: key === todayStr,
      future,
      selected: key === selected,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({
      date: new Date(year, monthIndex + 1, 1),
      day: 0,
      result: null,
      current: false,
      today: false,
      future: true,
      selected: false,
    });
  }
  const label = month.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <button type="button" className="calendar-nav-button" aria-label="Previous month" onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}>
          ‹
        </button>
        <h3 className="calendar-month-year">{label}</h3>
        <button
          type="button"
          className={`calendar-nav-button${!canNext ? ' calendar-nav-button-disabled' : ''}`}
          aria-label="Next month"
          disabled={!canNext}
          onClick={() => canNext && onMonthChange(new Date(year, monthIndex + 1, 1))}
        >
          ›
        </button>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name) => (
          <div key={name} className="calendar-weekday">{name}</div>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((cell, index) => {
          const clickable = cell.current && !cell.future && cell.day > 0;
          const classes = ['calendar-day'];
          if (cell.future || !cell.current) classes.push(cell.future ? 'calendar-day-future calendar-day-hidden' : 'calendar-day-other-month');
          if (cell.today) classes.push('calendar-day-today');
          if (cell.selected) classes.push('calendar-day-selected');
          if (clickable) classes.push('calendar-day-clickable', cell.result ? 'calendar-day-played' : 'calendar-day-empty');
          const label = clickable
            ? cell.result
              ? `${cell.day}, ${cell.result.plays} played, best ${cell.result.best}`
              : String(cell.day)
            : undefined;
          return (
            <div
              key={index}
              className={classes.join(' ')}
              aria-label={label}
              onClick={() => clickable && onDateClick(formatLocalDate(cell.date))}
            >
              {clickable && (
                <>
                  <span className="calendar-day-num">{cell.day}</span>
                  {cell.result && (
                    <span className="calendar-day-stats">
                      <span>{cell.result.plays}</span>
                      <span>{cell.result.best}</span>
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="calendar-legend">
        <div className="legend-item"><div className="legend-color legend-empty" /><span>Not played</span></div>
        <div className="legend-item"><div className="legend-color legend-played" /><span>Games, best</span></div>
      </div>
    </div>
  );
};
