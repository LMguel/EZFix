/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f4ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#5b5fcf',
          700: '#4f46e5',
        },
        purple: {
          400: '#a855f7',
          500: '#9333ea',
          600: '#7c3aed',
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}