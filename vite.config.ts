import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const KORTEXT_PORT = process.env.KORTEXT_PORT ?? '3200';
const API_TARGET = process.env.KORTEXT_API_URL ?? `http://localhost:${KORTEXT_PORT}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Honor an injected PORT (the preview harness assigns a free one when 5173
    // is taken); fall back to the conventional 5173 for plain `npm run dev`.
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    sourcemap: true,
  },
});
