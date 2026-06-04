import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router.tsx';
import { initTheme } from './app/theme.ts';
import './index.css';

// Apply the persisted theme before first paint to avoid a light/dark flash.
initTheme();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
