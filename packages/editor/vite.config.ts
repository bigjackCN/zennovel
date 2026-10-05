import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repo>/, so the workflow sets BASE_PATH=/zennovel/.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
});
