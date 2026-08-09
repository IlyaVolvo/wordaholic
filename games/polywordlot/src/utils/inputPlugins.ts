/**
 * Input plugins: language-specific transformations applied when a character is entered.
 * Each plugin is configured in language.json and invoked on every letter entry.
 */

export type InputPluginHandler = (
  key: string,
  currentGuess: string,
  wordLength: number,
  rtl: boolean,
  config: Record<string, unknown>
) => string;

const pluginRegistry = new Map<string, InputPluginHandler>();

/**
 * Registers a plugin handler. Called during initialization.
 */
export function registerInputPlugin(id: string, handler: InputPluginHandler): void {
  pluginRegistry.set(id, handler);
}

/**
 * Applies all plugins for a language to transform the key before it's added to the guess.
 * Plugins run in order; each receives the output of the previous.
 */
export function applyInputPlugins(
  key: string,
  currentGuess: string,
  wordLength: number,
  rtl: boolean,
  plugins: Array<{ id: string; config?: Record<string, unknown> }>
): string {
  let result = key;
  for (const plugin of plugins) {
    const handler = pluginRegistry.get(plugin.id);
    if (handler) {
      result = handler(result, currentGuess, wordLength, rtl, plugin.config || {});
    }
  }
  return result;
}

// --- Built-in plugins ---

/**
 * Hebrew final forms: when a letter is at the end of the word, replace with its final form.
 * - Keyboard shows only non-final (מ, נ, צ, פ, כ)
 * - When at end of word, substitute with final (ם, ן, ץ, ף, ך)
 * - Config: { regularToFinal: { "מ":"ם", "נ":"ן", ... }, exceptions?: string[] }
 * - exceptions: words that do not use final form at end (optional)
 */
registerInputPlugin('hebrewFinalForms', (key, currentGuess, wordLength, rtl, config) => {
  const regularToFinal = config.regularToFinal as Record<string, string> | undefined;
  if (!regularToFinal || !(key in regularToFinal)) return key;

  // "End of word" = position where we add the last character.
  // For RTL: first char typed goes at index 0 (rightmost), last char at index wordLength-1 (leftmost).
  // End of word (grammatically) = last letter in reading order = leftmost = last char we type.
  const isEndOfWord = currentGuess.length === wordLength - 1;

  if (!isEndOfWord) return key;

  // Check exceptions: if the full word (with this key) would be in exceptions, don't convert
  const exceptions = config.exceptions as string[] | undefined;
  if (exceptions && exceptions.length > 0) {
    const nextGuess = rtl ? key + currentGuess : currentGuess + key;
    // Normalize for comparison (e.g. strip vowels if any)
    const toCheck = nextGuess.toLowerCase();
    if (exceptions.some((ex: string) => ex.toLowerCase() === toCheck)) return key;
  }

  return regularToFinal[key];
});
