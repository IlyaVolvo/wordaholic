/** Overlay that blocks play on phone-sized landscape screens. */

export function mountPortraitGate() {
  if (document.querySelector('.portrait-gate')) return;
  const el = document.createElement('div');
  el.className = 'portrait-gate';
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="portrait-gate-card">
      <svg class="portrait-gate-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="16" y="6" width="16" height="28" rx="3" stroke="currentColor" stroke-width="2.5"/>
        <circle cx="24" cy="30" r="1.4" fill="currentColor"/>
        <path d="M10 38c4 4 10 6 14 6s10-2 14-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
      <p class="portrait-gate-title">Turn your phone upright</p>
      <p class="portrait-gate-body">This game is meant to be played in portrait.</p>
    </div>
  `;
  document.body.appendChild(el);
}
