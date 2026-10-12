import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
    ],
    server: {
        // In development the app calls /api on its own origin and Vite forwards it to
        // Laravel, so there is no cross-origin setup to get wrong locally.
        proxy: {
            '/api': process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000',
        },
    },
    build: {
        outDir: 'dist',
    }
});
