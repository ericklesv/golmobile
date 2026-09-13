/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sky: { DEFAULT: '#2EA8FF', light: '#7FD0FF', deep: '#1467D9' },
        navy: { DEFAULT: '#123C8A', deep: '#0B2D6B', ink: '#14335F' },
        cream: '#FFFFFF',
        muted: '#6B86B3',
        orange: { DEFAULT: '#FF8A2A', deep: '#E8641A' },
        gold: { DEFAULT: '#FFC63D', deep: '#E9A400' },
        grass: { DEFAULT: '#4CD137', deep: '#2BA83A' },
        danger: '#F0413E',
      },
      fontFamily: {
        display: ['"Lilita One"', 'Impact', 'sans-serif'],
        body: ['Nunito', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pop: { '0%': { transform: 'scale(0.6)', opacity: '0' }, '60%': { transform: 'scale(1.15)', opacity: '1' }, '100%': { transform: 'scale(1)' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-6px)' }, '75%': { transform: 'translateX(6px)' } },
        bob: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-4px)' } },
        spinSlow: { to: { transform: 'rotate(360deg)' } },
      },
      animation: { pop: 'pop 0.5s cubic-bezier(.2,.9,.3,1.4) both', shake: 'shake 0.4s ease both', bob: 'bob 1.8s ease-in-out infinite', spinSlow: 'spinSlow 14s linear infinite' },
    },
  },
  plugins: [],
};
