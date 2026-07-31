import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// The path aliases are declared once, in tsconfig.json, and read from there. Declaring
// them again here is the obvious alternative and the one that drifts: the day the two
// disagree, the type checker and the bundler resolve the same import to different files.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // The architecture test runs ESLint over the whole project, which is slow relative
    // to a unit test. It is not slow relative to finding out in three weeks that the
    // boundary rule stopped working.
    testTimeout: 60_000,
  },
});
