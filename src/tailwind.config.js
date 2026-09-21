/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // 👈 أضف هذا السطر ليصبح خط تجول هو الخط الافتراضي لعائلة sans
        sans: ['Tajawal', 'sans-serif'], 
      },
    },
  },
  plugins: [],
}