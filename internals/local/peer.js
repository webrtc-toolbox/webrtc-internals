import "../../dist/local/index.js";
AgoraRTCInternals.start("wss:/192.168.31.110:8043");
// AgoraRTCInternals.start("wss://10.93.0.47:8043");

const PeerConnection =
  self.RTCPeerConnection ||
  self.mozRTCPeerConnection ||
  self.webkitRTCPeerConnection;
!PeerConnection && this.error("浏览器不支持WebRTC！");

const isUseWebAudio = false;
let isFirst = true;

export class Peer {
  peer = new PeerConnection();
  localVideoTrack;
  constructor(type, element) {
    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;
    this.type = type;
    this.element = element;
    this.peer.ontrack = (e) => {
      if (e && e.streams) {
        //   console.error(e.streams.forEach((st) => console.log(st)));
        // this.log("收到对方音频/视频流数据...");
        //   element.srcObject = e.streams[0];
      }
      // const transceiver = this.peer.getTransceivers();
      // transceiver.forEach((tr) => {
      //   if (tr.receiver.track.kind === "video") {
      //     console.error(tr.receiver.track);
      //     element.srcObject = new MediaStream([tr.receiver.track]);
      //   } else {
      //     console.error(this.audioEl);
      //     // this.audioEl.srcObject = new MediaStream([tr.receiver.track]);
      //   }
      // });
      // console.error("receive", transceiver);
    };

    this.peer.onicecandidate = (e) => {
      if (e.candidate) {
        this.log("搜集并发送候选人", `${type}_ice`);
        if (this.type === "offer") {
          answerPeer.peer.addIceCandidate(e.candidate);
        } else {
          offerPeer.peer.addIceCandidate(e.candidate);
        }
      } else {
        this.log("候选人收集完成！");
        // if (this.type === "answer") {
        //   this.getReceiver();
        // }
      }
    };
  }

  async startLive(offerSdp) {
    if (!offerSdp) {
      if (isFirst) {
        this.log("摄像头/麦克风获取成功！");
        const videoTrack = localStream.video;
        this.peer.addTransceiver(videoTrack, {
          direction: "sendonly",
        });
        isFirst = false;
      }

      const audioTrack = localStream.audio;
      this.peer.addTransceiver(audioTrack, {
        direction: "sendonly",
      });
      this.log("创建本地SDP");
      const offer = await this.peer.createOffer();
      await this.peer.setLocalDescription(offer);

      await answerPeer.peer.setRemoteDescription(offer);
      const answer = await answerPeer.peer.createAnswer();
      await answerPeer.peer.setLocalDescription(answer);
      await this.peer.setRemoteDescription(answer);
      answerPeer.getReceiver();
    }
  }

  async exchangeSDP() {
    this.log("本地交换SDP");
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);

    await answerPeer.peer.setRemoteDescription(offer);
    const answer = await answerPeer.peer.createAnswer();
    await answerPeer.peer.setLocalDescription(answer);
    await this.peer.setRemoteDescription(answer);
  }

  log(...args) {
    console.log(`[${this.type}]`, `[${getDateStr()}]`, ...args);
  }

  getReceiver() {
    this.peer.getTransceivers().forEach((transceiver) => {
      console.error(transceiver);
      const track = transceiver.receiver.track;
      if (track.readyState !== "live") {
        return;
      }
      if (
        track.kind === "video" &&
        (this.localVideoTrack?.id !== track.id || !this.localVideoTrack)
      ) {
        this.localVideoTrack = track;
        const stream = new MediaStream();
        stream.addTrack(track);
        remoteVideo.srcObject = stream;
        remoteVideo.play();
      } else if (track.kind === "audio") {
        const stream = new MediaStream();
        stream.addTrack(track);

        remoteAudio.srcObject = stream;
        // const WebAudioContext =
        //   window.AudioContext || window.webkitAudioContext;
        // const context = new WebAudioContext();
        // const sourceNode = context.createMediaStreamSource(stream);
        // const analyserNode = context.createAnalyser();
        // analyserNode.fftSize = 2048;
        // analyserNode.smoothingTimeConstant = 0.4;
        remoteAudio.play();
      }
    });
  }

  getVolume(analyserNode) {
    const dataArray = new Float32Array(analyserNode.fftSize);
    if (analyserNode.getFloatTimeDomainData) {
      analyserNode.getFloatTimeDomainData(dataArray);
    } else {
      const scaledDataArray = new Uint8Array(analyserNode.fftSize);
      analyserNode.getByteTimeDomainData(scaledDataArray);
      for (let i = 0; i < dataArray.length; ++i) {
        dataArray[i] = scaledDataArray[i] / 128.0 - 1.0;
      }
    }

    const sumSquare = dataArray.reduce((acc, value) => acc + value * value, 0);
    const meanSquare = sumSquare / dataArray.length;
    const minLevel = 100.0;
    const level = Math.max(10.0 * Math.log10(meanSquare) + minLevel, 0);
    return level / minLevel;
  }

  close() {
    this.peer.close();
  }
}

function getDateStr() {
  const date = new Date();
  const dateStr =
    date.toTimeString().split(" ")[0] + ":" + date.getMilliseconds();
  return dateStr;
}
