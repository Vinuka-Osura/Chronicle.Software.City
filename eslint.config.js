import js from "@eslint/js";
// Named imports rather than the documented default ones: both packages ship a default
// export AND named exports of the same members, and import-x flags reaching the members
// through the default as a likely mistake. It is right that it is ambiguous.
import { config, configs as tsConfigs } from "typescript-eslint";
import { flatConfigs as importConfigs } from "eslint-plugin-import-x";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * The layering from CLAUDE.md:
 *
 *     react/  ->  render/  ->  (nothing)
 *             ->  engine/  ->  contract/
 *
 * Each zone reads "files in `target` may not import from `from`". The matrix is written
 * out in full rather than inferred, because a boundary you have to derive is one nobody
 * checks.
 *
 * `no-restricted-paths` resolves both aliases and relative paths to real files before
 * testing them, which is why it is used instead of `no-restricted-imports`. The latter
 * matches the import string, so `@render/city` would be caught and `../render/city`
 * would not - and the relative one is exactly what somebody reaches for when the rule is
 * in their way. tests/architecture.test.ts proves both forms are caught.
 */
const layering = [
  {
    target: "./src/contract",
    from: ["./src/engine", "./src/render", "./src/react"],
    message:
      "contract/ is the boundary with the outside world and depends on nothing internal. It describes the document format; it does not know there is a renderer.",
  },
  {
    target: "./src/engine",
    from: ["./src/render", "./src/react"],
    message:
      "engine/ decides what exists at a date and must not know what a mesh is. If you need something from render/ here, the thing you need belongs in engine/.",
  },
  {
    target: "./src/render",
    from: ["./src/contract", "./src/engine", "./src/react"],
    message:
      "render/ draws what it is handed and has never heard of a career, a skill or a JSON schema. Declare the shape it needs as its own interface; react/ is the layer allowed to see both sides.",
  },
];

export default config(
  { ignores: ["dist/**", "coverage/**", "node_modules/**"] },

  js.configs.recommended,
  tsConfigs.strictTypeChecked,
  tsConfigs.stylisticTypeChecked,
  importConfigs.recommended,
  importConfigs.typescript,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      // Resolves through tsconfig `paths`, so the zones above see the real file rather
      // than the alias string.
      "import-x/resolver-next": [createTypeScriptImportResolver({ alwaysTryTypes: true })],
    },
    rules: {
      "import-x/no-restricted-paths": ["error", { zones: layering }],

      // A type-only import still creates a dependency in the reader's head, and the
      // layering rule is about what a layer is allowed to know. Marking them explicitly
      // stops `import type` becoming a way round the boundary by accident.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // Float32Array indexing under noUncheckedIndexedAccess yields `number | undefined`,
      // so the hot loops in engine/ will want assertions. An error rather than a warning:
      // warnings are errors here, and the way through is a scoped eslint-disable carrying
      // the reason at the point of use. That leaves an argument in the file rather than a
      // policy that quietly erodes.
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },

  {
    // Hook rules are worth their noise here: an effect with the wrong dependencies inside
    // a render loop is a class of bug that reproduces as "it gets slower the longer you
    // leave it open", which is close to undiagnosable from a report.
    files: ["**/*.tsx"],
    // `configs.flat` rather than `configs["recommended-latest"]`: the top-level ones are
    // still eslintrc-shaped, and ESLint 10 rejects them outright rather than adapting.
    extends: [reactHooks.configs.flat["recommended-latest"]],
  },

  {
    // THE ONE STANDING SUPPRESSION, and it is scoped to the layer that earns it.
    //
    // `immutability` is a React Compiler rule: it forbids mutating anything a hook
    // returned, because the compiler may memoise around it. That is right for ordinary
    // React and wrong for react-three-fiber, where the camera, the scene and every mesh
    // are Three.js objects that live outside React's render model entirely. Moving a
    // camera IS mutating it, `useFrame` runs outside render, and drei's own controls do
    // exactly this. The alternative - copying a camera per frame to satisfy a rule about
    // memoisation - would be slower and no safer.
    //
    // Scoped to src/render/three so that a genuine mutation bug anywhere else still fails.
    files: ["src/render/three/**/*.tsx"],
    rules: { "react-hooks/immutability": "off" },
  },

  {
    // Config files are plain JS and are not in the TypeScript project, so the
    // type-checked rules have no program to consult and would error on every one.
    files: ["**/*.js"],
    extends: [tsConfigs.disableTypeChecked],
  },
);
