# WebRTC-Internals

English | [简体中文](./README-zh_CN.md)

demo: https://ltsg123.github.io/webrtc-internals/

Usage:

1、Mac safari plugin: first download Stay2 / Userscripts, the packaged js, copy to the script can be;

2, for safari/firefox/mobile, demo integration, you can place it under the body, <script src="webrtc-internals.js"></script>, add under the body on it!

# config

Configuration parameters are stored in the window RTC_INTERNALS_PARAMS and can be changed/referenced directly.

# ⚠️

Since it involves changing the PC prototype method, it must be loaded before the pc is built or it will fail!!!

# Known limitations

The tool has introduced the webrtc-adapter, but there are still some issues caused by differences between other browsers and chrome, as follows:

1. safari/firefox has limitations on ICE Candidate pair/grid data, (can judge candidate by looking at sdp)

# release/1.0.0

npm install
npm install webrtc-internals

import "webrtc-internals".

cdn import

<script src="https://ltsg123.github.io/webrtc-internals/dist/index.js"></script>

Any questions you can contact me at ltsg0317@outlook.com
