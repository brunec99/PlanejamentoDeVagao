import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/** Regras do Next com TypeScript. As telas usam JSX denso; o lint cuida do que quebra em
 * produção (hooks, imagens, acessibilidade), não de estilo, que é do Prettier. */
export default [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-empty-object-type': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      // Regras do React Compiler: apontam padrões a revisar, mas o projeto não usa o compilador e
      // sincroniza estado com DOM, worker 3D e localStorage em efeitos de propósito.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // Texto em português usa aspas e apóstrofos no JSX de propósito.
      'react/no-unescaped-entities': 'off',
    },
  },
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'scripts/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts'] },
];
