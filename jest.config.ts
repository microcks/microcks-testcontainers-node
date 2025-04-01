import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest/presets/default-esm",
  resolver: "ts-jest-resolver",
  resetMocks: true,
  restoreMocks: true,
  transform: {}
};

export default config;