import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#f5f2eb',
        ink: '#0a0a0f',
        cream: '#ede9df',
        accent: '#1a472a',
        'accent-light': '#2d6a4f',
        signal: '#e8f4ea',
        amber: '#c9a84c',
        muted: '#6b6860',
        border: '#d4cfc3',
        card: '#faf8f3',
      },
    },
  },
  plugins: [],
}

export default config
