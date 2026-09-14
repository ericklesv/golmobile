import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { Gutters } from './components/Gutters';
import './index.css';
import { detectTwa } from './lib/twa';

detectTwa(); // app da Play Store? (antes de qualquer tela)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Gutters />
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
