import React, { useLayoutEffect, useRef } from 'react';
import { bindMissingReport } from '../../../app/shell/word-report.js';

export function MissingReportButton({ onClick }: { onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const button = ref.current;
    if (!button) return undefined;
    return bindMissingReport(button);
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      className="entry-report"
      aria-label="Report missing word"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <img src="/brand/word-report.png" alt="" />
    </button>
  );
}
