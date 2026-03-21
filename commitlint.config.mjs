export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      ['game', 'ai', 'ui', 'rendering', 'replay', 'history', 'config', 'map'],
    ],
  },
};
