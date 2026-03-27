import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MyWebnicekApp } from './components/MyWebnicekApp.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');
createRoot(root).render(
  <StrictMode>
    <MyWebnicekApp />
  </StrictMode>,
);
