import { isShowcaseMode, showcaseSceneId } from '../storage/showcase-mode.js';

export async function prepareShowcase() {
  if (!isShowcaseMode() || !showcaseSceneId()) return;
  window.alert = (message) => {
    console.info('[showcase]', message);
  };
  window.open = (url) => {
    console.info('[showcase] stayed on the page', url);
    return null;
  };
  const { prepareShowcaseRun } = await loadRunner();
  await prepareShowcaseRun();
}

export async function startShowcase() {
  if (!isShowcaseMode() || !showcaseSceneId()) return;
  const { startShowcaseRun } = await loadRunner();
  await startShowcaseRun();
}

function loadRunner() {
  const href = '/showcase/runner.js';
  return import(/* @vite-ignore */ href);
}
