const path = require('path');

module.exports = {
  mode: 'development',
  target: 'electron-main',
  entry: './src/main/main.ts',
  output: {
    path: path.resolve(__dirname, 'dist/main'),
    filename: 'main.js',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@main': path.resolve(__dirname, 'src/main'),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  externals: {
    'node-pty': 'commonjs node-pty',
    'electron-store': 'commonjs electron-store',
    'simple-git': 'commonjs simple-git',
  },
  node: {
    __dirname: false,
    __filename: false,
  },
};
