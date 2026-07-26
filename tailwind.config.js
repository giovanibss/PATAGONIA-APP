/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        titulo: ['Oswald', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
