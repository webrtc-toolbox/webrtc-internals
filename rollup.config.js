/*
 * @Author: ltsg xiaoshumin@agora.io
 * @Date: 2022-11-16 18:31:38
 * @LastEditors: ltsg xiaoshumin@agora.io
 * @LastEditTime: 2022-11-16 20:33:32
 * @FilePath: /webrtc-internals-safari/rollup.config.js
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import commonjs from "@rollup/plugin-commonjs";
import resovle from "@rollup/plugin-node-resolve";
import { terser } from "rollup-plugin-terser";

export default [
  {
    input: "src/index.js",
    output: [
      {
        name: "RTCInternals",
        file: `dist/index.js`,
        format: "umd",
      },
    ],
    watch: {
      exclude: "node_modules/**",
    },
    plugins: [
      //https://github.com/rollup/plugins
      commonjs({
        transformMixedEsModules: true,
      }),
      resovle(),
      // terser(),
    ],
  },
  {
    input: "src/local/index.js",
    output: [
      {
        name: "RTCLocal",
        file: `dist/local/index.js`,
        format: "umd",
      },
    ],
    watch: {
      exclude: "node_modules/**",
    },
    plugins: [
      //https://github.com/rollup/plugins
      commonjs({
        transformMixedEsModules: true,
      }),
      resovle(),
      // terser(),
    ],
  },
  {
    input: "src/remote/index.js",
    output: [
      {
        name: "RTCRemote",
        file: `dist/remote/index.js`,
        format: "umd",
      },
    ],
    watch: {
      exclude: "node_modules/**",
    },
    plugins: [
      //https://github.com/rollup/plugins
      commonjs({
        transformMixedEsModules: true,
      }),
      resovle(),
      // terser(),
    ],
  },
];
