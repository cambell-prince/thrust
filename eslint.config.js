// ESLint with typescript-eslint's type-aware rules. Types themselves are checked by `npm run typecheck`.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{ ignores: ['dist/', 'node_modules/', 'playwright-report/', 'test-results/', 'src/', 'public/', '.claude/'] },
	js.configs.recommended,
	tseslint.configs.recommendedTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			eqeqeq: 'error',
			'no-var': 'error',
			'prefer-const': 'error',
		},
	},
	{
		// Plain JS: this file and the deploy helpers.
		files: ['**/*.js'],
		extends: [tseslint.configs.disableTypeChecked],
		languageOptions: { globals: globals.node },
	},
);
