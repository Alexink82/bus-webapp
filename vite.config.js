import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'webapp'),
  base: '/',
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'webapp/index.html'),
        booking: resolve(__dirname, 'webapp/booking.html'),
        profile: resolve(__dirname, 'webapp/profile.html'),
        success: resolve(__dirname, 'webapp/success.html'),
        faq: resolve(__dirname, 'webapp/faq.html'),
        admin: resolve(__dirname, 'webapp/admin.html'),
        dispatcher: resolve(__dirname, 'webapp/dispatcher.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    target: 'es2020',
    minify: 'esbuild',
    cssCodeSplit: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: '/index.html',
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8000', ws: true },
    },
  },
});
