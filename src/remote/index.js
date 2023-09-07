/*
 * @Author: ltsg xiaoshumin@agora.io
 * @Date: 2022-11-16 18:32:35
 * @LastEditors: ltsg xiaoshumin@agora.io
 * @LastEditTime: 2022-11-16 23:41:08
 * @FilePath: /webrtc-internals-safari/src/index.js
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */

import "webrtc-adapter";
import { initUI } from "./html";
import "./css";
import "./inject";

import { initialize } from "./webrtc-internals";

const AgoraRTCInternals = {
  start: (url) => {
    initUI();
    initialize(url);
  },
};

window.AgoraRTCInternals = AgoraRTCInternals;
export default AgoraRTCInternals;
