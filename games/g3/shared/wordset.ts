/**
 * Group g3 word sets: games/g3/data/languages/<Language>/corpus.txt (+ optional corpus2.txt).
 * One word per line.
 */
export const LANGUAGES_BASE = '/games/g3/data/languages';

export function wordLines(text: string): string[] {
  return text.split(/\n/).map((line) => line.trim()).filter(Boolean);
}

/** `words` is required; `extraWords` comes from the optional corpus2.txt. */
export async function loadWordLists(dir: string): Promise<{ words: string[]; extraWords: string[] }> {
  const base = `${LANGUAGES_BASE}/${dir}`;
  const [wordsRes, extraRes] = await Promise.all([fetch(`${base}/corpus.txt`), fetch(`${base}/corpus2.txt`)]);
  if (!wordsRes.ok) throw new Error('Word list is missing');
  return {
    words: wordLines(await wordsRes.text()),
    extraWords: extraRes.ok ? wordLines(await extraRes.text()) : [],
  };
}
