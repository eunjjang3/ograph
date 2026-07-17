import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  define: {
    __OGRAPH_DEBUG_RUNTIME__: 'false'
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'src/components/graph/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: ['d3-force', 'react', 'react/jsx-runtime', 'react-dom'],
      output: {
        banner: '"use client";',
        globals: {
          'd3-force': 'd3Force',
          react: 'React',
          'react-dom': 'ReactDOM'
        }
      }
    }
  }
});
