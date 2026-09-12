/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: { 0: '#04101B', 1: '#0A1B2B', 2: '#11253C', 3: '#16324F' },
        line: '#22405F',
        turf: { DEFAULT: '#22E58A', deep: '#0E3B2A', dark: '#16A86A' },
        chalk: '#EDF4F3',
        haze: '#8098AE',
        hazedim: '#54697E',
        flood: '#FFC24B',
        card: '#FF5470',
        pitch: { DEFAULT: '#1E8F4E', light: '#25A75B', dark: '#187A42' },
      },
      fontFamily: {
        poster: ['Anton', 'Impact', 'sans-serif'],
        score: ['"Saira Condensed"', 'Oswald', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(34,229,138,0.35)',
        flood: '0 0 24px rgba(255,194,75,0.35)',
        red: '0 0 24px rgba(255,84,112,0.35)',
      },
      keyframes: {
        pop: { '0%': { transform: 'scale(0.6)', opacity: '0' }, '60%': { transform: 'scale(1.15)', opacity: '1' }, '100%': { transform: 'scale(1)' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-6px)' }, '75%': { transform: 'translateX(6px)' } },
        pulseGlow: { '0%,100%': { boxShadow: '0 0 12px rgba(34,229,138,0.3)' }, '50%': { boxShadow: '0 0 32px rgba(34,229,138,0.7)' } },
      },
      animation: { pop: 'pop 0.5s cubic-bezier(.2,.9,.3,1.4) both', shake: 'shake 0.4s ease both', pulseGlow: 'pulseGlow 1.6s ease-in-out infinite' },
    },
  },
  plugins: [],
};
