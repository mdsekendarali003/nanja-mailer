/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dde7ff',
          500: '#3b6ef5',
          600: '#2f5ce0',
          700: '#274db8',
        },
      },
    },
  },
  plugins: [],
}
