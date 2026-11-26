/**
 * @typedef {{ selector?: string, text: string, place?: 'top'|'bottom'|'left'|'right' }} Callout
 * @typedef {{ type: string, selector?: string, text?: string, value?: string, keys?: string[], ms?: number, path?: string }} Action
 * @typedef {{ detail: 'glance'|'tour'|'deep', callout?: Callout, do?: Action, reveal?: boolean, read?: number, after?: number }} Step
 * @typedef {{ id: string, title: string, summary: string, start: string, steps: Step[] }} Scene
 */

import languages from './scenes/languages.js';
import backup from './scenes/backup.js';
import reports from './scenes/reports.js';
import polywordlot from './scenes/polywordlot.js';
import hydra from './scenes/hydra.js';
import transword from './scenes/transword.js';
import letterix from './scenes/letterix.js';

/** @type {Scene[]} */
export const scenes = [languages, backup, reports, polywordlot, hydra, transword, letterix];

/** @param {string} id */
export function sceneById(id) {
  return scenes.find((scene) => scene.id === id) || null;
}
