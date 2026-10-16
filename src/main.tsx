import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Solo en desarrollo: acceso a la generación de preguntas desde la consola para probar modos
if (import.meta.env.DEV) {
  void import('./game/build').then((m) => {
    (window as unknown as { __mg: typeof m }).__mg = m;
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
