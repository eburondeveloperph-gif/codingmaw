import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:4000',
            changeOrigin: true,
          },
          '/asr': {
            target: 'http://localhost:5000',
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/asr/, ''),
          },
          '/openclaw': {
            target: 'http://localhost:18789',
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/openclaw/, ''),
          }
        },
      },
      plugins: [react()],
      define: {
        'process.env.OLLAMA_API_KEY': JSON.stringify(env.VITE_OLLAMA_API_KEY),
        'process.env.OLLAMA_CLOUD_URL': JSON.stringify(env.VITE_OLLAMA_CLOUD_URL)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
