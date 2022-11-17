/*
 * @Author: ltsg xiaoshumin@agora.io
 * @Date: 2022-11-16 18:32:35
 * @LastEditors: ltsg xiaoshumin@agora.io
 * @LastEditTime: 2022-11-16 23:41:08
 * @FilePath: /webrtc-internals-safari/src/index.js
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */

// root
const root = document.createElement("p");
root.id = "content-root";
root.className = "webrtc-internals-content-root";
root.style.zIndex = 10000;
root.hidden = true;
document.body.appendChild(root);

const button = document.createElement("div");
button.innerText = "WebRTC-Internals";
button.className = "webrtc-internals-switch";
button.style.zIndex = 10000;
document.body.appendChild(button);

button.onclick = () => {
  root.hidden = !root.hidden;
};

import "./inject";
import "./css";
import { initialize } from "./webrtc-internals";

initialize();
