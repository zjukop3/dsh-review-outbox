const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]

export default {
  entry: { client: 'client/index.jsx' },
  outDir: 'dist',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  inputOptions: {
    resolve: {
      conditionNames: ['browser', 'import', 'require', 'default'],
    },
  },
  deps: {
    neverBundle: [...CLIENT_EXTERNALS],
    onlyBundle: ['@deepseek-ai/dsh-util-workspace-path'],
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify('dsh-review-outbox')}, factory: (require) => {`,
    footer: `return module.exports; } });`,
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    codeSplitting: false,
  },
}
