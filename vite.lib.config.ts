import { resolve } from "node:path";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import dts from "vite-plugin-dts";

/**
 * The package build.
 *
 * Two entries rather than one. The 3D renderer is reached through a dynamic import so that
 * a host pays for three.js only on a device that will actually use it, and Rollup needs to
 * see that as a real entry to keep the split intact through bundling.
 *
 * React, react-dom and three are **external**. Bundling React into a component library is
 * how you end up with two copies of it in one page, which breaks hooks in ways nobody
 * should have to debug inside somebody else's application.
 */
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    dts({
      // The path aliases are a build-time convenience; a consumer cannot resolve `@engine`.
      // Bundling the declarations into one file resolves them away, and gives a consumer a
      // single `index.d.ts` rather than a shadow copy of the source tree.
      //
      // `bundleTypes`, not `rollupTypes` - it was renamed when the plugin moved to
      // unplugin-dts. The old name is silently ignored, so the build looked fine and
      // emitted a whole tree of declarations instead. Only the typecheck caught it.
      bundleTypes: true,
      include: ["src"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.json"),
    }),
  ],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "software-city",
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        /^react-dom\//,
        /^three($|\/)/,
        /^@react-three\//,
      ],
      output: { chunkFileNames: "[name]-[hash].js" },
    },
    sourcemap: true,
    // A consumer's own bundler minifies; shipping unminified keeps stack traces readable
    // and lets tree-shaking see more.
    minify: false,
    target: "es2022",
  },
});
