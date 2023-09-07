console.log("配置为", window.RTC_INTERNALS__PARAMS);
// 关闭图像
window.RTC_INTERNALS__PARAMS &&
  (window.RTC_INTERNALS__PARAMS.open_graph = false);

const localVideo = document.querySelector("#local-video");
const remoteVideo = document.querySelector("#remote-video");
const remoteAudio = document.querySelector("#remote-audio");
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

const localStream = {
  video: null,
  audio: null,
};
async function main() {
  let stream;
  stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  console.log("摄像头/麦克风获取成功！");
  localStream.video = stream.getVideoTracks()[0];
  localStream.audio = stream.getAudioTracks()[0];
  localVideo.srcObject = new MediaStream([localStream.video]);
}
main();

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

function sub() {
  offerPeer.startLive();
}

function unsub() {
  answerPeer.peer.getTransceivers().forEach((tr) => {
    if (tr.receiver.track?.kind === "video") {
      return;
    }
    tr.direction = "inactive";
    tr.stop();
  });
  offerPeer.peer.getTransceivers().forEach((tr) => {
    if (tr.sender.track?.kind === "video") {
      return;
    }
    offerPeer.peer.removeTrack(tr.sender);
    tr.direction = "inactive";
    // tr.stop();
  });
  offerPeer.exchangeSDP();

  // const ofTransceiver = offerPeer.peer.getTransceivers();
  // ofTransceiver.forEach((tr) => {
  //   ofTransceiver.direction = "inactive";
  //   tr.stop();
  // });
  // const AnTransceiver = answerPeer.peer.getTransceivers();
  // AnTransceiver.forEach((tr) => {
  //   AnTransceiver.direction = "inactive";
  //   tr.stop();
  // });
  // answerPeer.exchangeSDP();
}

let interval = null;
let isSub = true;
function test() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  } else {
    interval = setInterval(() => {
      if (isSub) {
        unsub();
      } else {
        sub();
      }
      isSub = !isSub;
    }, 3000);
  }
}
