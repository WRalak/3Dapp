import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: ["src/generated/**", ".next/**", "public/vendor/**", "playwright-report/**"] },
];
export default config;
