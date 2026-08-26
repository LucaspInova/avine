import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // O arquivo de ambiente do repositório fica um nível acima do app Vite.
  // Sem isso, as credenciais do Supabase não são incluídas no cliente local.
  envDir: '.',
  plugins: [react()],
  build: {
    manifest: true,
    chunkSizeWarningLimit: 450,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom)/,
              priority: 30,
            },
            {
              name: 'supabase-vendor',
              test: /node_modules[\\/]@supabase/,
              priority: 20,
            },
            {
              name: 'query-vendor',
              test: /node_modules[\\/]@tanstack/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['tests/e2e/**'],
  },
})
