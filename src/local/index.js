import "webrtc-adapter";

const AgoraRTCInternals = {
  start: createWebUIEvents,
  statsUpdateInterval: 1000,
};

let ws;
// create listeners for all the updates that get sent from RTCPeerConnection.
function createWebUIEvents(url) {
  ws = new WebSocket(url);
  ws.onopen = () => {
    // ws.send("send");
  };
  let id = Math.random().toString(16);
  const origPeerConnection = window.RTCPeerConnection;
  if (!origPeerConnection) {
    throw new Error("cannot find RTCPeerConnection in window");
  }

  // Rewrite RTCPeerConnection
  window.RTCPeerConnection = function () {
    const pc = new origPeerConnection(...arguments);
    pc._id = Math.random().toString(16);
    console.error("pc", id);
    trace("create", pc._id, arguments);

    pc.addEventListener("icecandidate", function (e) {
      trace("icecandidate", pc._id, e.candidate);
    });
    pc.addEventListener("addstream", function (e) {
      trace(
        "onaddstream",
        pc._id,
        e.stream.id +
          " " +
          e.stream.getTracks().map(function (t) {
            return t.kind + ":" + t.id;
          })
      );
    });
    pc.addEventListener("removestream", function (e) {
      trace(
        "onremovestream",
        pc._id,
        e.stream.id +
          " " +
          e.stream.getTracks().map(function (t) {
            return t.kind + ":" + t.id;
          })
      );
    });
    pc.addEventListener("track", function (e) {
      trace(
        "ontrack",
        pc._id,
        e.track.kind +
          ":" +
          e.track.id +
          " " +
          e.streams.map(function (s) {
            return "stream:" + s.id;
          })
      );
    });
    pc.addEventListener("signalingstatechange", function () {
      trace("signalingstatechange", pc._id, pc.signalingState);
    });
    pc.addEventListener("iceconnectionstatechange", function () {
      trace("iceconnectionstatechange", pc._id, pc.iceConnectionState);
    });
    pc.addEventListener("connectionstatechange", function () {
      trace("connectionstatechange", pc._id, pc.connectionState);
    });
    pc.addEventListener("icegatheringstatechange", function () {
      trace("onicegatheringstatechange", pc._id, pc.iceGatheringState);
    });
    pc.addEventListener("negotiationneeded", function () {
      trace("onnegotiationneeded", pc._id, {});
    });
    pc.addEventListener("datachannel", function (event) {
      trace("ondatachannel", pc._id, [event.channel.id, event.channel.label]);
    });

    window.setTimeout(function poll() {
      if (pc.connectionState !== "closed") {
        window.setTimeout(poll, AgoraRTCInternals.statsUpdateInterval);
      } else {
        trace("connectionstatechange", pc._id, pc.connectionState);
      }
      pc.getStats().then(function (stats) {
        trace("getStats", pc._id, map2obj(stats));
      });
    }, AgoraRTCInternals.statsUpdateInterval);
    return pc;
  };

  // get RTCPeerConnection prototype
  window.RTCPeerConnection.prototype = origPeerConnection.prototype;

  // Rewrite RTCPeerConnection prototype
  ["createOffer", "createAnswer"].forEach(function (method) {
    var nativeMethod = window.RTCPeerConnection.prototype[method];
    if (nativeMethod) {
      window.RTCPeerConnection.prototype[method] = function () {
        var pc = this;
        var args = arguments;
        var opts;
        if (arguments.length === 1 && typeof arguments[0] === "object") {
          opts = arguments[0];
        } else if (arguments.length === 3 && typeof arguments[2] === "object") {
          opts = arguments[2];
        }
        trace(method, pc._id, opts);
        return new Promise(function (resolve, reject) {
          nativeMethod.apply(pc, [
            function (description) {
              trace(method + "OnSuccess", pc._id, description);
              resolve(description);
              if (args.length > 0 && typeof args[0] === "function") {
                args[0].apply(null, [description]);
              }
            },
            function (err) {
              trace(method + "OnFailure", pc._id, err.toString());
              reject(err);
              if (args.length > 1 && typeof args[1] === "function") {
                args[1].apply(null, [err]);
              }
            },
            opts,
          ]);
        });
      };
    }
  });

  ["setLocalDescription", "setRemoteDescription", "addIceCandidate"].forEach(
    function (method) {
      var nativeMethod = window.RTCPeerConnection.prototype[method];
      if (nativeMethod) {
        window.RTCPeerConnection.prototype[method] = function () {
          var pc = this;
          var args = arguments;
          trace(method, pc._id, args[0]);
          return new Promise(function (resolve, reject) {
            nativeMethod.apply(pc, [
              args[0],
              function () {
                trace(method + "OnSuccess", pc._id);
                resolve();
                if (args.length >= 2) {
                  args[1].apply(null, []);
                }
              },
              function (err) {
                trace(method + "OnFailure", pc._id, err.toString());
                reject(err);
                if (args.length >= 3) {
                  args[2].apply(null, [err]);
                }
              },
            ]);
          });
        };
      }
    }
  );

  ["addStream", "removeStream"].forEach(function (method) {
    var nativeMethod = window.RTCPeerConnection.prototype[method];
    if (nativeMethod) {
      window.RTCPeerConnection.prototype[method] = function () {
        var pc = this;
        var stream = arguments[0];
        var streamInfo = stream.getTracks().map(function (t) {
          return t.kind + ":" + t.id;
        });

        trace(method, pc._id, stream.id + " " + streamInfo);
        return nativeMethod.apply(pc, arguments);
      };
    }
  });

  ["addTrack"].forEach(function (method) {
    var nativeMethod = window.RTCPeerConnection.prototype[method];
    if (nativeMethod) {
      window.RTCPeerConnection.prototype[method] = function () {
        var pc = this;
        var track = arguments[0];
        var streams = [].slice.call(arguments, 1);
        trace(
          method,
          pc._id,
          track.kind +
            ":" +
            track.id +
            " " +
            (streams
              .map(function (s) {
                return "stream:" + s.id;
              })
              .join(";") || "-")
        );
        var sender = nativeMethod.apply(pc, arguments);
        if (sender && sender.replaceTrack) {
          var nativeReplaceTrack = sender.replaceTrack;
          sender.replaceTrack = function (withTrack) {
            trace(
              "replaceTrack",
              pc._id,
              (sender.track
                ? sender.track.kind + ":" + sender.track.id
                : "null") +
                " with " +
                (withTrack ? withTrack.kind + ":" + withTrack.id : "null")
            );
            return nativeReplaceTrack.apply(sender, arguments);
          };
        }
        return sender;
      };
    }
  });

  ["removeTrack"].forEach(function (method) {
    var nativeMethod = window.RTCPeerConnection.prototype[method];
    if (nativeMethod) {
      window.RTCPeerConnection.prototype[method] = function () {
        var pc = this;
        var track = arguments[0].track;
        trace(method, pc._id, track ? track.kind + ":" + track.id : "null");
        return nativeMethod.apply(pc, arguments);
      };
    }
  });

  ["close", "createDataChannel"].forEach(function (method) {
    var nativeMethod = window.RTCPeerConnection.prototype[method];
    if (nativeMethod) {
      window.RTCPeerConnection.prototype[method] = function () {
        var pc = this;
        trace(method, pc._id, arguments);
        return nativeMethod.apply(pc, arguments);
      };
    }
  });

  ["addTransceiver"].forEach(function (method) {
    //args: (trackOrKind: MediaStreamTrack | string, init?: RTCRtpTransceiverInit)
    const nativeMethod = window.RTCPeerConnection.prototype[method];
    if (nativeMethod) {
      window.RTCPeerConnection.prototype[method] = function () {
        const pc = this;
        // MediaStreamTrack | string
        const kind =
          arguments[0] instanceof MediaStreamTrack
            ? arguments[0].kind
            : arguments[0];
        const transceiver = nativeMethod.apply(pc, arguments);
        const value = `
        Caused by: addTransceiver

        getTransceivers()[${pc.getTransceivers().length - 1}]:{
          mid: ${transceiver.mid},
          kind:${kind},
          sender: {
            track: ${transceiver.sender.track?.id},
          },
          receiver: {
            track: ${transceiver.receiver.track?.id},
          },
          direction: ${transceiver.direction},
          currentDirection: ${transceiver.currentDirection},
        }
        `;
        trace("transceiverAdded", pc._id, value);
        return transceiver;
      };
    }
  });

  // transceiverModified to do@xiaoshumin，暂时没有好办法， 除了监听对象，目前看功能没有必要
}

// transforms a maplike to an object. Mostly for getStats +
// JSON.parse(JSON.stringify())
function map2obj(m) {
  if (!m.entries) {
    return m;
  }
  var o = {};
  m.forEach(function (v, k) {
    o[k] = v;
  });
  return o;
}

const sendParamsCache = [];

function trace(method, id, args) {
  const params = {
    method,
    id,
    args,
  };
  if (ws && ws.readyState === 1) {
    if (sendParamsCache.length > 0) {
      sendParamsCache.forEach((params) => {
        ws.send(JSON.stringify(params));
      });
      sendParamsCache.length = 0;
    }
    ws.send(JSON.stringify(params));
  } else {
    sendParamsCache.push(params);
  }
}

window.AgoraRTCInternals = AgoraRTCInternals;
export default AgoraRTCInternals;
