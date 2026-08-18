import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { mountPortraitGate } from '../../../app/play/portrait-gate.js';
import '../../../app/play/portrait-gate.css';
import './styles.css';

mountPortraitGate();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
