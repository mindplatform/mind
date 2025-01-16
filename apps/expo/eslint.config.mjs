import baseConfig from '@mindworld/eslint-config/base'
import reactConfig from '@mindworld/eslint-config/react'

/** @type {import('typescript-eslint').Config} */
export default [
  {
    ignores: ['.expo/**', 'expo-plugins/**'],
  },
  ...baseConfig,
  ...reactConfig,
]
