import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 4026,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8031'
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 4026,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8031'
    }
  }
});
