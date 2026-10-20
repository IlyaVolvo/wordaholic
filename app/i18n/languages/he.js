/**
 * Hebrew: five letters take a final form at the end of a word (מ → ם, נ → ן, צ → ץ, פ → ף, כ → ך)
 * and their regular form everywhere else. Keyboards and falling letters use only regular forms.
 */

const REGULAR_TO_FINAL = { 'מ': 'ם', 'נ': 'ן', 'צ': 'ץ', 'פ': 'ף', 'כ': 'ך' };
const FINAL_TO_REGULAR = Object.fromEntries(Object.entries(REGULAR_TO_FINAL).map(([regular, final]) => [final, regular]));

/** Words that keep a regular letter at the end. */
const EXCEPTIONS = new Set([]);

/** @param {string} letter */
function baseLetter(letter) {
  return FINAL_TO_REGULAR[letter] ?? letter;
}

/**
 * @param {string} letter
 * @param {{ end: boolean, word?: string }} place
 */
function formAt(letter, place) {
  const regular = baseLetter(letter);
  const final = REGULAR_TO_FINAL[regular];
  if (!final) return letter;
  if (!place?.end) return regular;
  if (place.word && EXCEPTIONS.has(Array.from(place.word, baseLetter).join(''))) return regular;
  return final;
}

export default { formAt, baseLetter };
