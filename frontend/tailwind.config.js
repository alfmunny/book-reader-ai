/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        parchment: "#f5f0e8",
        ink: "#2c2416",
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
};
