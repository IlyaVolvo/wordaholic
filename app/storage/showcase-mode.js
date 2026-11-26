/** Demo playback (`?showcase=1`) uses its own database and localStorage keys. */

export function isShowcaseMode() {
  if (typeof location === 'undefined') return false;
  try {
    return new URLSearchParams(location.search).get('showcase') === '1';
  } catch {
    return false;
  }
}

/** @param {string} key */
export function showcaseLocalKey(key) {
  return isShowcaseMode() ? `showcase.${key}` : key;
}

export function showcaseDbName() {
  return isShowcaseMode() ? 'wordaholic-showcase' : 'wordaholic';
}

export function showcaseSceneId() {
  if (!isShowcaseMode()) return '';
  try {
    return new URLSearchParams(location.search).get('scene') || '';
  } catch {
    return '';
  }
}

export function showcaseDetail() {
  try {
    const value = new URLSearchParams(location.search).get('detail') || 'tour';
    if (value === 'glance' || value === 'tour' || value === 'deep') return value;
  } catch {
    /* fall through */
  }
  return 'tour';
}
