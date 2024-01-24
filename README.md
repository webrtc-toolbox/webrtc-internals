# WebRTC-Internals

English | [简体中文](./README-zh_CN.md)

demo: https://ltsg123.github.io/webrtc-internals/

Usage:

1、Mac safari plugin: first download Stay2 / Userscripts, the packaged js, copy to the script can be;

2, for safari/firefox/mobile, demo integration, you can place it under the body, <script src="webrtc-internals.js"></script>, add under the body on it!

Example image:
![safari](./img/demo_1.jpg)
![ios](./img/demo_2.jpg)
![ios](./img/demo_3.jpg)

## build

yarn

yarn build

## dev

yarn

yarn dev

http-sever

## config

Configuration parameters are stored in the window RTC_INTERNALS\_\_PARAMS and can be changed/referenced directly.

## ⚠️

Since it involves changing the PC prototype method, it must be loaded before the pc is built or it will fail!!!

## Known limitations

The tool has introduced the webrtc-adapter, but there are still some issues caused by differences between other browsers and chrome, as follows:

1. safari/firefox has limitations on ICE Candidate pair/grid data, (can judge candidate by looking at sdp)

## Install

Use `npm`

```
# with npm
npm i webrtc-internals-adapter
```

CDN is also provided

```
<script src="https://ltsg123.github.io/webrtc-internals/dist/index.js"></script>
```

Any questions you can contact me at ltsg0317@outlook.com
