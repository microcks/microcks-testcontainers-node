import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest/presets/default-esm",
  resetMocks: true,
  restoreMocks: true,
  transform: {}
};

export default config;