import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Add the specific polyfills needed by eccrypto
      include: ['buffer', 'crypto']
    }),
  ],
  resolve: {
    alias: {
      // If you have path alias requirements
      '@': '/src',
    },
  },
})