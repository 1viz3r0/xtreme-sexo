import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/, maxSize: 300_000 }],
        },
      },
    },
  },
  server: {
    watch: {
      // Native SDKs may contain recursive symlinks; none are frontend inputs.
      ignored: ['**/target/**', '**/src-tauri/**', '**/NET0ZE_RELEASE/**'],
      followSymlinks: false,
    },
  },
})
