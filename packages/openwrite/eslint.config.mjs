import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".openwrite/**", "dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-namespace": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*/*", "!@/*/index"],
              message: "Import from module index only (e.g. '@/session').",
            },
          ],
        },
      ],
    },
  },
);
