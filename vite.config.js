import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `--mode demo` (npm run dev:demo / build:demo) builds the portfolio demo:
// fake in-browser data (src/lib/demoClient.js), a made-up clinic name, and
// public-demo/ in place of public/ so no real logos ship.
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
            .replace(/<title>.*<\/title>/, '<title>Sunrise Family Clinic — Scheduler (Demo)</title>')
            .replace('type="image/png" href="/logo.png"', 'type="image/svg+xml" href="/logo.svg"'),
      },
    ],
    publicDir: demo ? 'public-demo' : 'public',
    define: demo ? { 'import.meta.env.VITE_DEMO': JSON.stringify('true') } : {},
  }
})
