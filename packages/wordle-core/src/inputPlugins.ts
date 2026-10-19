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

function regularToFinalMap(
  config: Record<string, unknown> | undefined
): Record<string, string> | null {
  const map = config?.regularToFinal;
  if (!map || typeof map !== 'object') return null;
  return map as Record<string, string>;
}

/** Regular letter for a final-form pair, or null when `letter` is not in the map. */
function regularOfFinalPair(letter: string, regularToFinal: Record<string, string>): string | null {
  if (Object.prototype.hasOwnProperty.call(regularToFinal, letter)) return letter;
  for (const regular of Object.keys(regularToFinal)) {
    if (regularToFinal[regular] === letter) return regular;
  }
  return null;
}

function hebrewFinalFormPlugin(
  plugins: Array<{ id: string; config?: Record<string, unknown> }>
): { id: string; config?: Record<string, unknown> } | undefined {
  return plugins.find((plugin) => plugin.id === 'hebrewFinalForms');
}

/**
 * Final form at the end of the word; regular form everywhere else.
 * Letters outside the plugin map are unchanged, so regular and final stay one letter.
 * Word-level exceptions apply only while typing (the summary does not know the target).
 */
export function letterWithFinalForm(
  letter: string,
  isEndOfWord: boolean,
  plugins: Array<{ id: string; config?: Record<string, unknown> }>
): string {
  const regularToFinal = regularToFinalMap(hebrewFinalFormPlugin(plugins)?.config);
  if (!regularToFinal) return letter;
  const regular = regularOfFinalPair(letter, regularToFinal);
  if (!regular) return letter;
  if (!isEndOfWord) return regular;
  return regularToFinal[regular] ?? regular;
}

/**
 * Hebrew final forms: when a letter is at the end of the word, replace with its final form.
 * - Keyboard shows only non-final (מ, נ, צ, פ, כ)
 * - When at end of word, substitute with final (ם, ן, ץ, ף, ך)
 * - Config: { regularToFinal: { "מ":"ם", "נ":"ן", ... }, exceptions?: string[] }
 * - exceptions: words that do not use final form at end (optional)
 * Summary rows use the same map via letterWithFinalForm.
 */
registerInputPlugin('hebrewFinalForms', (key, currentGuess, wordLength, rtl, config) => {
  const regularToFinal = regularToFinalMap(config);
  if (!regularToFinal || !Object.prototype.hasOwnProperty.call(regularToFinal, key)) return key;

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
