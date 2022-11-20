const PeerConnection =
  self.RTCPeerConnection ||
  self.mozRTCPeerConnection ||
  self.webkitRTCPeerConnection;
!PeerConnection && this.error("浏览器不支持WebRTC！");

class Peer {
  peer = new PeerConnection();
  constructor(type, element) {
    this.type = type;
    this.element = element;
    this.peer.ontrack = (e) => {
      if (e && e.streams) {
        this.log("收到对方音频/视频流数据...");
        element.srcObject = e.streams[0];
      }
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
        if (this.type === "answer") {
          this.getReceiver();
        }
      }
    };
  }

  async startLive(offerSdp) {
    if (!offerSdp) {
      let stream;
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      this.log("摄像头/麦克风获取成功！");
      localVideo.srcObject = stream;
      const videoTrack = stream.getVideoTracks()[0];
      this.peer.addTransceiver(videoTrack, {
        direction: "sendonly",
      });

      this.log("创建本地SDP");
      const offer = await this.peer.createOffer();
      await this.peer.setLocalDescription(offer);

      await answerPeer.peer.setRemoteDescription(offer);
      const answer = await answerPeer.peer.createAnswer();
      await answerPeer.peer.setLocalDescription(answer);
      await this.peer.setRemoteDescription(answer);
    }
  }

  log(...args) {
    console.log(`[${this.type}]`, `[${getDateStr()}]`, ...args);
  }

  getReceiver() {
    const videoTrack = this.peer.getTransceivers()[0].receiver.track;
    const stream = new MediaStream();
    stream.addTrack(videoTrack);
    remoteVideo.srcObject = stream;
    remoteVideo.play();
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
