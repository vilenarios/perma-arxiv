/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // arXiv Official Color Palette
        arxiv: {
          grey: '#6b6459',
          red: '#b31b1b',
          pink: '#fb595a',
          'warm-bg': '#f9f7f7',
          blue: '#1f5e96',
          'light-blue': '#a5d6fe',
          'cool-bg': '#f7fafc',
          lime: '#c4d82e',
          link: '#1e8bc3',
          text: '#1c1a17',
        }
      },
      fontFamily: {
        // arXiv Typography System
        body: ['"Frank Ruhl Libre"', 'Georgia', 'serif'],
        heading: ['Catamaran', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        label: ['"IBM Plex Sans Condensed"', '"IBM Plex Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
