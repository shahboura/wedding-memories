import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',

      // General rules
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],

      // React rules
      'react/no-unescaped-entities': 'error',
      '@next/next/no-html-link-for-pages': 'error',

      // Disable set-state-in-effect — mount-time initialization via
      // useEffect(() => setState(...), []) is the standard React pattern
      // for SSR hydration and client-only state.
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  {
    files: ['**/*.config.{js,ts}', '**/scripts/**/*.{js,cjs}'],
    rules: {
      'no-console': 'off', // Allow console in config/scripts
    },
  },

  {
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off', // CJS files use require()
    },
  },

  globalIgnores([
    '.next/**',
    'node_modules/**',
    'out/**',
    'build/**',
    'dist/**',
    '.env*',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
