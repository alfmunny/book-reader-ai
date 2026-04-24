const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const customConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    "^react-markdown$": "<rootDir>/src/__mocks__/react-markdown.tsx",
    "^remark-gfm$": "<rootDir>/src/__mocks__/remark-gfm.ts",
    "^isomorphic-dompurify$": "<rootDir>/src/__mocks__/isomorphic-dompurify.ts",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/__mocks__/**",
    "!src/__tests__/**",
    "!src/app/layout.tsx",
    "!src/auth.ts",
    "!src/middleware.ts",
    "!src/app/api/auth/**",
  ],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/src/auth\\.ts$",
    "/src/middleware\\.ts$",
    "/src/app/api/",
  ],
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/e2e/", "<rootDir>/.next/"],
  coverageReporters: ["text", "lcov", "json-summary"],
  coverageDirectory: "coverage",
};

module.exports = createJestConfig(customConfig);
