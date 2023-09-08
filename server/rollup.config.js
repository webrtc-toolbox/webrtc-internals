// import commonjs from "@rollup/plugin-commonjs";
// import resovle from "@rollup/plugin-node-resolve";
// import { terser } from "rollup-plugin-terser";
// const path = require("path");
const commonjs = require("@rollup/plugin-commonjs");
const resovle = require("@rollup/plugin-node-resolve");
const { terser } = require("rollup-plugin-terser");

module.exports = {
  input: "index.js",
  output: [
    {
      name: "internals-server",
      file: `dist/index.js`,
      format: "umd",
    },
  ],
  plugins: [
    //https://github.com/rollup/plugins
    commonjs({
      transformMixedEsModules: true,
    }),
    resovle(),
    // terser(),
  ],
};
