/** Fixed puzzle day for showcase scenes. Recordings stay on this date. */
export const SHOWCASE_DATE = '2024-06-01';

export function showcasePinnedDate() {
  if (typeof location === 'undefined') return null;
  try {
    if (new URLSearchParams(location.search).get('showcase') !== '1') return null;
  } catch {
    return null;
  }
  return SHOWCASE_DATE;
}
