import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig(({ mode }) => {
  const isFirefox = mode === 'firefox';
  const manifestFile = isFirefox ? 'manifest.firefox.json' : 'manifest.json';
  const outDir = isFirefox ? 'dist-firefox' : 'dist';

  return {
    plugins: [
      react(),
      webExtension({
        manifest: resolve(__dirname, manifestFile),
        additionalInputs: ['src/dashboard/index.html'],
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir,
    },
  };
});
