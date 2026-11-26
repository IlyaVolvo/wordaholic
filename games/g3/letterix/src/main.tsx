import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { mountPortraitGate } from '../../../../app/play/portrait-gate.js';
import { prepareShowcase, startShowcase } from '../../../../app/shell/showcase-boot.js';
import '../../../../app/play/portrait-gate.css';
import '../../../../app/play/header-chrome.css';
import '../../../../app/help/help.css';
import './styles.css';

mountPortraitGate();

void prepareShowcase().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  void startShowcase();
});
