import React, { useState, useEffect, useRef } from 'react';
import { loadHelpTip } from '../data/languageLoader';

interface HelpTooltipProps {
  language: string;
  /** Where to show the tooltip relative to the trigger. Default 'above'. */
  placement?: 'above' | 'left';
  children: React.ReactNode;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ language, placement = 'above', children }) => {
  const [helpText, setHelpText] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load help tip text when language changes
    const loadTip = async () => {
      console.log(`[HelpTooltip] Loading help tip for language: ${language}`);
      const text = await loadHelpTip(language);
      console.log(`[HelpTooltip] Loaded help text:`, text ? `"${text}"` : 'null');
      setHelpText(text);
    };
    loadTip();
  }, [language]);


  const handleMouseEnter = (e: React.MouseEvent) => {
    if (!helpText) return;
    
    setIsVisible(true);
    // Use requestAnimationFrame to ensure tooltip is rendered before positioning
    requestAnimationFrame(() => {
      updatePosition(e);
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isVisible || !helpText) return;
    updatePosition(e);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
    setPosition(null);
  };

  const updatePosition = (e: React.MouseEvent) => {
    if (!containerRef.current || !tooltipRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;

    let left: number;
    let top: number;

    if (placement === 'left') {
      // Position to the left of the trigger, vertically centered
      left = -tooltipRect.width - 10;
      top = mouseY - tooltipRect.height / 2;
      // Keep within container vertically
      if (top < 10) top = 10;
      else if (top + tooltipRect.height > containerRect.height - 10) top = containerRect.height - tooltipRect.height - 10;
    } else {
      // Default: position above cursor, centered horizontally
      left = mouseX - tooltipRect.width / 2;
      top = mouseY - tooltipRect.height - 10;
      if (left < 10) left = 10;
      else if (left + tooltipRect.width > containerRect.width - 10) left = containerRect.width - tooltipRect.width - 10;
      if (top < 10) top = mouseY + 20;
    }
    
    setPosition({ top, left });
  };

  // Always render the container and children, but only show tooltip if helpText exists
  return (
    <div
      ref={containerRef}
      className="help-tooltip-container"
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      {children}
      {isVisible && helpText && (
        <div
          ref={tooltipRef}
          className="help-tooltip"
          style={{
            position: 'absolute',
            top: position ? `${position.top}px` : 'auto',
            left: position ? `${position.left}px` : 'auto',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          {helpText}
        </div>
      )}
    </div>
  );
};
