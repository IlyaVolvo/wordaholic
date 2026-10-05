import assert from 'node:assert/strict';
import test from 'node:test';
import { completedRecordId, pickRecordToKeep, toStoredRecord } from '../../../app/storage/export-records.js';

test('letterix keeps the first score and replaces the record when the best score rises', () => {
  const local = toStoredRecord('letterix', {
    language: 'en',
    W: 8,
    H: 16,
    game_date: '2026-10-03',
    first_score: 12,
    best_score: 20,
    is_complete: 1,
    completed_at: '2026-10-03T00:00:00.000Z',
  });
  const incoming = toStoredRecord('letterix', {
    language: 'en',
    W: 8,
    H: 16,
    game_date: '2026-10-03',
    first_score: 40,
    best_score: 40,
    is_complete: 1,
    completed_at: '2026-10-03T01:00:00.000Z',
  });
  assert.equal(local.id, 'letterix:game:en|8|16|2026-10-03');
  assert.equal(completedRecordId('letterix', local), local.id);
  const kept = pickRecordToKeep(local, incoming);
  assert.equal(kept, incoming);
  assert.equal(kept.first_score, 12);
  assert.equal(kept.best_score, 40);
});
