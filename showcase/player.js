import { scenes } from './registry.js';

const SESSION = 'wordaholic.showcaseRun';
const list = document.querySelector('[data-scenes]');

function detail() {
  const picked = document.querySelector('input[name="detail"]:checked');
  return picked instanceof HTMLInputElement ? picked.value : 'tour';
}

scenes.forEach((scene, index) => {
  const item = document.createElement('li');
  item.className = 'showcase-scene';
  item.innerHTML = `
    <span class="showcase-index">${index + 1}</span>
    <div>
      <h2></h2>
      <p></p>
    </div>
    <button type="button" class="showcase-play">Play</button>
  `;
  item.querySelector('h2').textContent = scene.title;
  item.querySelector('p').textContent = scene.summary;
  item.querySelector('button').addEventListener('click', () => {
    sessionStorage.removeItem(SESSION);
    const url = new URL(scene.start, location.origin);
    url.searchParams.set('showcase', '1');
    url.searchParams.set('scene', scene.id);
    url.searchParams.set('detail', detail());
    location.assign(`${url.pathname}${url.search}`);
  });
  list.appendChild(item);
});
