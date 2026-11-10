import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `--mode demo` (npm run dev:demo / build:demo) builds the portfolio demo:
// fake in-browser data (src/lib/demoClient.js), a "(Demo)" page title, and
// public-demo/ in place of public/ (only the main logo and banner ship).
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo'
  return {
    plugins: [
      react(),
      tailwindcss(),
      demo && {
        name: 'demo-branding',
        transformIndexHtml: (html) =>
          html
            .replace(/<title>.*<\/title>/, '<title>Hofileña Medical Centrum — Scheduler (Demo)</title>')
      },
    ],
    publicDir: demo ? 'public-demo' : 'public',
    define: demo ? { 'import.meta.env.VITE_DEMO': JSON.stringify('true') } : {},
  }
})
