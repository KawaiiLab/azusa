module.exports = {
  env: {
    commonjs: true,
    node: true,
    es2020: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 11
  },
  rules: {
    indent: [
      'error',
      2
    ],
    quotes: [
      'error',
      'single'
    ],
    semi: [
      'error',
      'never'
    ],
    'prettier/prettier': 'error'
  },
  'plugins': [
    'markdown',
    'prettier'
  ]
}