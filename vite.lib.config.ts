import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __OGRAPH_DEBUG_RUNTIME__: 'false'
  },
  worker: {
    format: 'es',
    rolldownOptions: {
      output: {
        entryFileNames: 'workers/[name]-[hash].js',
        chunkFileNames: 'workers/[name]-[hash].js',
        assetFileNames: 'workers/[name]-[hash][extname]'
      }
    }
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'src/components/graph/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: [
        'd3-force',
        'pixi.js',
        'pixi.js/unsafe-eval',
        'react',
        'react/jsx-runtime',
        'react-dom'
      ],
      output: {
        banner: '"use client";',
        chunkFileNames: 'chunks/[name]-[hash].js',
        globals: {
          'd3-force': 'd3Force',
          react: 'React',
          'react-dom': 'ReactDOM'
        }
      }
    }
  }
});
