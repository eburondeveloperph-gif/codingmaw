/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './**/*.{ts,tsx}',
    '!./node_modules/**',
    '!./backend/**',
    '!./referece-ui/**',
    '!./dist/**',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      borderRadius: {
        '6': '6px',
      },
    },
  },
  plugins: [],
};
