import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  server: {
    host: '0.0.0.0',
    proxy: {
      '/graphql': 'http://localhost:4000',
      '/health': 'http://localhost:4000',
    },
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
});
