import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'


// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),tailwindcss()],
  server: {
    proxy: {
      // Proxy requests from /api to the backend server on port 3001
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true, // Recommended for virtual-hosted sites
        // The 'rewrite' option has been removed.
        // Vite will now forward the request path as-is.
        // e.g., /api/search/loco/123 -> http://localhost:3001/api/search/loco/123
      },
    },
  },
})