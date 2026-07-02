/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#20242B",
        paper: "#F4F1EA",
        leaf: "#2F7D4F",
      },
    },
  },
  plugins: [],
};
