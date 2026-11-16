import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyWordText } from './verify-words.js';

const english = {
  menu: 'English',
  layout: [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
  ],
  normalization: {},
};
const russian = {
  menu: 'Русский',
  layout: [['й', 'е', 'а']],
  normalization: { ё: 'е' },
};
const french = {
  menu: 'Français',
  layout: [['a', 'e']],
  normalization: { 'èé': 'e' },
};

function check(relPath, text, language, languages = []) {
  return verifyWordText(relPath, text, {
    readLanguage: () => language,
    languages,
  });
}

test('a word may use only that language keyboard', () => {
  const ok = check('games/g3/data/languages/English/corpus.txt', 'apple\n', english);
  const bad = check('games/g3/data/languages/English/corpus.txt', 'app1e\n', english);
  assert.deepEqual(ok, []);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /not on the English keyboard: 1/);
});

test('folded letters such as ё and é are allowed', () => {
  assert.deepEqual(check('games/g3/data/languages/Russian/corpus.txt', 'ёе\n', russian), []);
  assert.deepEqual(check('games/g3/data/languages/French/corpus.txt', 'éé\n', french), []);
});

test('g1 requires the length named by the file', () => {
  const languages = [{ code: 'en', polywordlotLengths: [5] }];
  const ok = check('games/g1/data/languages/English/answers-5.txt', 'apple 10,NOUN\n', english, languages);
  const bad = check('games/g1/data/languages/English/answers-5.txt', 'app 10,NOUN\n', english, languages);
  assert.deepEqual(ok, []);
  assert.match(bad[0], /is 3 characters, expected 5/);
});

test('g1 rejects a length the language does not play', () => {
  const languages = [{ code: 'fr', polywordlotLengths: [5, 6, 7] }];
  const errors = check('games/g1/data/languages/French/answers-4.txt', 'étée\n', french, languages);
  assert.match(errors[0], /length 4 is not a Français length/);
});

test('g3 rejects a leftover number and keeps a # note', () => {
  const leftover = check('games/g3/data/languages/Russian/corpus.txt', 'люди\t1\n', russian);
  const note = check('games/g3/data/languages/Russian/corpus2.txt', 'ёе # singular=е\n', russian);
  assert.match(leftover[0], /extra text after the word/);
  assert.deepEqual(note, []);
});

test('g2 keeps the level separate from the word', () => {
  const ok = check('games/g2/data/languages/English/corpus.txt', 'apple\t2\n', english);
  const bad = check('games/g2/data/languages/English/corpus.txt', 'apple\tx\n', english);
  assert.deepEqual(ok, []);
  assert.match(bad[0], /level "x"/);
});
