import React, { useState, useEffect, useRef } from 'react';
import type { LetterState } from '../types';
import { loadKeyboard, loadKeyboardActions, getNormalization } from '../data/languageLoader';
import { normalizeForLanguage } from '../utils/characterNormalization';

interface KeyboardProps {
  onKeyPress: (key: string) => void | Promise<void>;
  onEnter: () => void;
  onBackspace: () => void;
  letterStates: Map<string, LetterState>;
  language: string;
}

// Default English keyboard layout (used as fallback)
const DEFAULT_KEYBOARD: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

// Type for action button configuration
type ActionButton = {
  label: string;
  position: 'start' | 'end' | 'none';
  /** Row index (0-based). If omitted, defaults to last row. */
  row?: number;
};

type ActionsState = {
  enter: ActionButton;
  backspace: ActionButton;
};

// Default action buttons (used as fallback)
const DEFAULT_ACTIONS: ActionsState = {
  enter: { label: 'ENTER', position: 'start' },
  backspace: { label: '⌫', position: 'end' },
};

export const Keyboard: React.FC<KeyboardProps> = ({
  onKeyPress,
  onEnter,
  onBackspace,
  letterStates,
  language,
}) => {
  const [layout, setLayout] = useState<string[][]>(DEFAULT_KEYBOARD);
  const [actions, setActions] = useState<ActionsState>(DEFAULT_ACTIONS);
  const [variantsByBase, setVariantsByBase] = useState<Record<string, string[]>>({});
  const [activeLongPressKeyId, setActiveLongPressKeyId] = useState<string | null>(null);
  const [hoveredVariant, setHoveredVariant] = useState<string | null>(null);

  const longPressTimeoutRef = useRef<number | null>(null);
  const pressRef = useRef<{ key: string; keyId: string; variants: string[] } | null>(null);
  const longPressOpenRef = useRef(false);
  const hoveredVariantRef = useRef<string | null>(null);

  const clearLongPressTimer = () => {
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  const closeVariantPicker = () => {
    longPressOpenRef.current = false;
    hoveredVariantRef.current = null;
    setHoveredVariant(null);
    setActiveLongPressKeyId(null);
  };

  useEffect(() => {
    const loadLayout = async () => {
      const keyboard = await loadKeyboard(language);
      const effectiveLayout = keyboard || DEFAULT_KEYBOARD;
      setLayout(effectiveLayout);
      const normalization = getNormalization(language) || {};
      const nextVariantsByBase: Record<string, string[]> = {};
      for (const [variantGroup, base] of Object.entries(normalization)) {
        if (base.length !== 1) continue;
        const canonicalBase = base.toLowerCase();
        for (const variant of Array.from(variantGroup)) {
          const normalizedVariant = variant.toLowerCase();
          if (normalizedVariant === canonicalBase) continue;
          if (!nextVariantsByBase[canonicalBase]) {
            nextVariantsByBase[canonicalBase] = [];
          }
          if (!nextVariantsByBase[canonicalBase].includes(normalizedVariant)) {
            nextVariantsByBase[canonicalBase].push(normalizedVariant);
          }
        }
      }
      setVariantsByBase(nextVariantsByBase);
      
      const keyboardActions = await loadKeyboardActions(language);
      const lastRow = effectiveLayout.length > 0 ? effectiveLayout.length - 1 : 0;
      if (keyboardActions) {
        setActions({
          enter: {
            label: keyboardActions.enter?.label || DEFAULT_ACTIONS.enter.label,
            position: (keyboardActions.enter?.position || DEFAULT_ACTIONS.enter.position) as 'start' | 'end' | 'none',
            row: keyboardActions.enter?.row ?? lastRow,
          },
          backspace: {
            label: keyboardActions.backspace?.label || DEFAULT_ACTIONS.backspace.label,
            position: (keyboardActions.backspace?.position || DEFAULT_ACTIONS.backspace.position) as 'start' | 'end' | 'none',
            row: keyboardActions.backspace?.row ?? lastRow,
          },
        });
      } else {
        setActions({
          ...DEFAULT_ACTIONS,
          enter: { ...DEFAULT_ACTIONS.enter, row: lastRow },
          backspace: { ...DEFAULT_ACTIONS.backspace, row: lastRow },
        });
      }
    };
    
    loadLayout();
    return () => {
      clearLongPressTimer();
      closeVariantPicker();
      pressRef.current = null;
    };
  }, [language]);

  useEffect(() => {
    hoveredVariantRef.current = hoveredVariant;
  }, [hoveredVariant]);

  const getKeyClass = (key: string): string => {
    const rawKey = key.toLowerCase();
    const canonicalKey = normalizeForLanguage(rawKey, language);
    const state = letterStates.get(canonicalKey);
    if (state) {
      return `key ${state}`;
    }
    return 'key';
  };

  const shouldShowEnter = (rowIndex: number): boolean => {
    const targetRow = actions.enter.row ?? layout.length - 1;
    if (rowIndex !== targetRow) return false;
    const position = actions.enter.position;
    return position !== 'none';
  };

  const shouldShowBackspace = (rowIndex: number): boolean => {
    const targetRow = actions.backspace.row ?? layout.length - 1;
    if (rowIndex !== targetRow) return false;
    const position = actions.backspace.position;
    return position !== 'none';
  };

  const getEnterPosition = (): 'start' | 'end' => {
    const pos = actions.enter.position;
    return pos === 'none' ? 'start' : (pos as 'start' | 'end');
  };

  const getBackspacePosition = (): 'start' | 'end' => {
    const pos = actions.backspace.position;
    return pos === 'none' ? 'end' : (pos as 'start' | 'end');
  };

  const getEnterLabel = (): string => {
    return actions.enter.label;
  };

  const getBackspaceLabel = (): string => {
    return actions.backspace.label;
  };

  const handleGlobalPointerMove = (event: PointerEvent) => {
    if (!longPressOpenRef.current) return;
    const pressed = pressRef.current;
    if (!pressed) return;

    const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    if (!element) {
      setHoveredVariant(null);
      return;
    }

    const variantElement = element.closest('[data-variant-option]') as HTMLElement | null;
    if (variantElement?.dataset.variantOption) {
      setHoveredVariant(variantElement.dataset.variantOption);
      return;
    }

    const mainKeyElement = element.closest('[data-main-key-id]') as HTMLElement | null;
    if (mainKeyElement?.dataset.mainKeyId === pressed.keyId) {
      setHoveredVariant(null);
      return;
    }

    setHoveredVariant(null);
  };

  const removePointerListeners = () => {
    window.removeEventListener('pointermove', handleGlobalPointerMove);
    window.removeEventListener('pointerup', handleGlobalPointerUp);
    window.removeEventListener('pointercancel', handleGlobalPointerCancel);
  };

  const finalizePress = (shouldType: boolean) => {
    const pressed = pressRef.current;
    clearLongPressTimer();
    removePointerListeners();

    if (!pressed) return;

    if (!shouldType) {
      closeVariantPicker();
      pressRef.current = null;
      return;
    }

    const chosenKey = longPressOpenRef.current
      ? (hoveredVariantRef.current || pressed.key)
      : pressed.key;

    closeVariantPicker();
    pressRef.current = null;
    void onKeyPress(chosenKey);
  };

  const handleGlobalPointerUp = () => finalizePress(true);
  const handleGlobalPointerCancel = () => finalizePress(false);

  const handleLetterPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    key: string,
    keyId: string
  ) => {
    // On touch pointers, button can be -1 on some browsers (notably iPad Safari).
    // For mouse, support both left (0) and right (2) long-press.
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2) return;
    event.preventDefault();

    const variants = variantsByBase[key.toLowerCase()] || [];
    pressRef.current = { key, keyId, variants };
    longPressOpenRef.current = false;
    hoveredVariantRef.current = null;
    setHoveredVariant(null);

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerCancel);

    clearLongPressTimer();
    if (variants.length > 0) {
      longPressTimeoutRef.current = window.setTimeout(() => {
        const currentPress = pressRef.current;
        if (!currentPress || currentPress.keyId !== keyId) return;
        longPressOpenRef.current = true;
        setActiveLongPressKeyId(keyId);
      }, 500);
    }
  };

  return (
    <div className="keyboard">
      {layout.map((row, rowIndex) => (
        <div key={rowIndex} className="keyboard-row">
          {shouldShowEnter(rowIndex) && getEnterPosition() === 'start' && (
            <button className="key key-action" onClick={onEnter}>
              {getEnterLabel()}
            </button>
          )}
          {shouldShowBackspace(rowIndex) && getBackspacePosition() === 'start' && (
            <button className="key key-action" onClick={onBackspace}>
              {getBackspaceLabel()}
            </button>
          )}
          {row.map((key, keyIndex) =>
            key === '' ? (
              <div key={`spacer-${rowIndex}-${keyIndex}`} className="keyboard-spacer" aria-hidden="true" />
            ) : (
              <div key={`${rowIndex}-${keyIndex}-${key}`} className="key-wrapper">
                {activeLongPressKeyId === `${rowIndex}-${keyIndex}-${key}` && (variantsByBase[key.toLowerCase()] || []).length > 0 && (
                  <div className="key-variants-popup">
                    {(variantsByBase[key.toLowerCase()] || []).map((variant) => (
                      <div
                        key={`variant-${rowIndex}-${keyIndex}-${variant}`}
                        className={`key-variant-option ${hoveredVariant === variant ? 'active' : ''}`}
                        data-variant-option={variant}
                      >
                        {variant.toUpperCase()}
                      </div>
                    ))}
                  </div>
                )}
                <button
                  className={`${getKeyClass(key)} ${activeLongPressKeyId === `${rowIndex}-${keyIndex}-${key}` ? 'long-press-active' : ''}`}
                  data-main-key-id={`${rowIndex}-${keyIndex}-${key}`}
                  onPointerDown={(event) => handleLetterPointerDown(event, key, `${rowIndex}-${keyIndex}-${key}`)}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  {key.toUpperCase()}
                </button>
              </div>
            )
          )}
          {shouldShowEnter(rowIndex) && getEnterPosition() === 'end' && (
            <button className="key key-action" onClick={onEnter}>
              {getEnterLabel()}
            </button>
          )}
          {shouldShowBackspace(rowIndex) && getBackspacePosition() === 'end' && (
            <button className="key key-action" onClick={onBackspace}>
              {getBackspaceLabel()}
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

