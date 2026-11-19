import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    rules: {
      "no-undef": "error",
      "no-use-before-define": [
        "error",
        { functions: false, classes: true, variables: true },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next*/**",
    "out/**",
    "build/**",
    "cli/app/.next-cli-build/**",
    "cli/.build-home/**",
    "node_modules/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
