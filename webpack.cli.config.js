const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: './src/cli/cumx-cli.ts',
  output: {
    path: path.resolve(__dirname, 'dist/cli'),
    filename: 'wumx.js',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
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
  node: {
    __dirname: false,
    __filename: false,
  },
};
