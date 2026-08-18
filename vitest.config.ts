import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      setupFiles: ["./src/test/setup.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "lcov"],
        include: ["scripts/build-icons.mjs", "src/App.tsx", "src/icon/Icon.tsx"],
        thresholds: {
          lines: 90,
          functions: 90,
          statements: 90,
          branches: 85,
        },
      },
    },
  }),
);
