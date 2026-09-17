/** @type {import('webpack').Configuration} */
module.exports = {
  module: {
    rules: [
      {
        test: /pdf\.worker\.min\.mjs$/,
        type: "asset/resource",
        generator: {
          filename: "pdf.worker.min.[contenthash:8].mjs",
        },
      },
    ],
  },
};
