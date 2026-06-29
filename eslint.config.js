import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Reglas de "React Compiler readiness" (plugin v7): marcan patrones que
      // funcionan bien pero no son compiler-safe (cargar datos al montar,
      // mutar variables en callbacks). Las dejamos como aviso, no error, para
      // que el lint quede limpio y los errores reales no se escondan.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  {
    // Service worker de FCM: corre en contexto worker (self, clients,
    // importScripts) y usa `firebase` cargado vía importScripts.
    files: ['public/**/*-sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, firebase: 'readonly' },
    },
  },
])
