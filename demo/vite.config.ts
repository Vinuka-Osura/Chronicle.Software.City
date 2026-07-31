import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

/**
 * The demo's own config, separate from the root one, which exists for Vitest.
 *
 * Aliases still come from the root tsconfig rather than being restated here: the day the
 * two disagree, the type checker and the bundler resolve the same import to different
 * files, and nothing about the resulting error says so.
 */
export default defineConfig({
  root: here,
  plugins: [tsconfigPaths({ root: repoRoot })],
  server: {
    // fixtures/ and src/ live above the demo root, so the dev server has to be told they
    // are legitimately part of this project.
    fs: { allow: [repoRoot] },
  },
  build: {
    outDir: resolve(repoRoot, "dist/demo"),
    emptyOutDir: true,
  },
});
