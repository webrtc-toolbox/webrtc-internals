console.log("配置为", window.RTC_INTERNALS__PARAMS);
// 关闭图像
window.RTC_INTERNALS__PARAMS.open_graph = false;

const localVideo = document.querySelector("#local-video");
const remoteVideo = document.querySelector("#remote-video");
const button = document.querySelector(".start-button");

localVideo.onloadeddata = () => {
  console.log("播放本地视频");
  localVideo.play();
};
remoteVideo.onloadeddata = () => {
  console.log("播放对方视频");
  remoteVideo.play();
};

const offerPeer = new Peer("offer", localVideo);
const answerPeer = new Peer("answer", remoteVideo);

function startLive() {
  offerPeer.startLive();
  button.style.display = "none";
}

function send() {
  offerPeer.channel.send();
}

function resetSDP() {
  offerPeer.startLive();
}

function close() {
  offerPeer.close();
  answerPeer.close();
}
