import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F5F5F2',
        line: '#E3E3DE',
        side: '#16181D',
        accent: '#0E6B6B',
        loss: '#B4501A',
        gain: '#1E7A50',
        opp: '#9A4A12',
        ink: '#1B1D22',
        muted: '#5A5E66',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
      },
      borderRadius: { card: '12px' },
    },
  },
  plugins: [],
} satisfies Config;
