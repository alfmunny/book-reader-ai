const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const customConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    "^react-markdown$": "<rootDir>/src/__mocks__/react-markdown.tsx",
    "^remark-gfm$": "<rootDir>/src/__mocks__/remark-gfm.ts",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

module.exports = createJestConfig(customConfig);
