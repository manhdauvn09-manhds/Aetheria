import config from "@aetheria/config/eslint/node";

export default [
  ...config,
  { ignores: ["src/generated/**", "prisma/**"] }
];
