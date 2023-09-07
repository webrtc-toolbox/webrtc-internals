// ==UserScript==
// @name         New Userscript
// @version      0.1
// @description  Template userscript created by Stay
// @author       You
// @match        *://*/*
// @grant        none
// ==/UserScript==
(function () {
  "use strict";
  // you code
  (function (global, factory) {
    typeof exports === "object" && typeof module !== "undefined"
      ? (module.exports = factory())
      : typeof define === "function" && define.amd
      ? define(factory)
      : ((global =
          typeof globalThis !== "undefined" ? globalThis : global || self),
        (global.RTCLocal = factory()));
  })(this, function () {
    "use strict";

    function _mergeNamespaces(n, m) {
      m.forEach(function (e) {
        e &&
          typeof e !== "string" &&
          !Array.isArray(e) &&
          Object.keys(e).forEach(function (k) {
            if (k !== "default" && !(k in n)) {
              var d = Object.getOwnPropertyDescriptor(e, k);
              Object.defineProperty(
                n,
                k,
                d.get
                  ? d
                  : {
                      enumerable: true,
                      get: function () {
                        return e[k];
                      },
                    }
              );
            }
          });
      });
      return Object.freeze(n);
    }

    /*
     *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
     *
     *  Use of this source code is governed by a BSD-style license
     *  that can be found in the LICENSE file in the root of the source
     *  tree.
     */

    let logDisabled_ = true;
    let deprecationWarnings_ = true;

    /**
     * Extract browser version out of the provided user agent string.
     *
     * @param {!string} uastring userAgent string.
     * @param {!string} expr Regular expression used as match criteria.
     * @param {!number} pos position in the version string to be returned.
     * @return {!number} browser version.
     */
    function extractVersion(uastring, expr, pos) {
      const match = uastring.match(expr);
      return match && match.length >= pos && parseInt(match[pos], 10);
    }

    // Wraps the peerconnection event eventNameToWrap in a function
    // which returns the modified event object (or false to prevent
    // the event).
    function wrapPeerConnectionEvent(window, eventNameToWrap, wrapper) {
      if (!window.RTCPeerConnection) {
        return;
      }
      const proto = window.RTCPeerConnection.prototype;
      const nativeAddEventListener = proto.addEventListener;
      proto.addEventListener = function (nativeEventName, cb) {
        if (nativeEventName !== eventNameToWrap) {
          return nativeAddEventListener.apply(this, arguments);
        }
        const wrappedCallback = (e) => {
          const modifiedEvent = wrapper(e);
          if (modifiedEvent) {
            if (cb.handleEvent) {
              cb.handleEvent(modifiedEvent);
            } else {
              cb(modifiedEvent);
            }
          }
        };
        this._eventMap = this._eventMap || {};
        if (!this._eventMap[eventNameToWrap]) {
          this._eventMap[eventNameToWrap] = new Map();
        }
        this._eventMap[eventNameToWrap].set(cb, wrappedCallback);
        return nativeAddEventListener.apply(this, [
          nativeEventName,
          wrappedCallback,
        ]);
      };

      const nativeRemoveEventListener = proto.removeEventListener;
      proto.removeEventListener = function (nativeEventName, cb) {
        if (
          nativeEventName !== eventNameToWrap ||
          !this._eventMap ||
          !this._eventMap[eventNameToWrap]
        ) {
          return nativeRemoveEventListener.apply(this, arguments);
        }
        if (!this._eventMap[eventNameToWrap].has(cb)) {
          return nativeRemoveEventListener.apply(this, arguments);
        }
        const unwrappedCb = this._eventMap[eventNameToWrap].get(cb);
        this._eventMap[eventNameToWrap].delete(cb);
        if (this._eventMap[eventNameToWrap].size === 0) {
          delete this._eventMap[eventNameToWrap];
        }
        if (Object.keys(this._eventMap).length === 0) {
          delete this._eventMap;
        }
        return nativeRemoveEventListener.apply(this, [
          nativeEventName,
          unwrappedCb,
        ]);
      };

      Object.defineProperty(proto, "on" + eventNameToWrap, {
        get() {
          return this["_on" + eventNameToWrap];
        },
        set(cb) {
          if (this["_on" + eventNameToWrap]) {
            this.removeEventListener(
              eventNameToWrap,
              this["_on" + eventNameToWrap]
            );
            delete this["_on" + eventNameToWrap];
          }
          if (cb) {
            this.addEventListener(
              eventNameToWrap,
              (this["_on" + eventNameToWrap] = cb)
            );
          }
        },
        enumerable: true,
        configurable: true,
      });
    }

    function disableLog(bool) {
      if (typeof bool !== "boolean") {
        return new Error(
          "Argument type: " + typeof bool + ". Please use a boolean."
        );
      }
      logDisabled_ = bool;
      return bool
        ? "adapter.js logging disabled"
        : "adapter.js logging enabled";
    }

    /**
     * Disable or enable deprecation warnings
     * @param {!boolean} bool set to true to disable warnings.
     */
    function disableWarnings(bool) {
      if (typeof bool !== "boolean") {
        return new Error(
          "Argument type: " + typeof bool + ". Please use a boolean."
        );
      }
      deprecationWarnings_ = !bool;
      return (
        "adapter.js deprecation warnings " + (bool ? "disabled" : "enabled")
      );
    }

    function log() {
      if (typeof window === "object") {
        if (logDisabled_) {
          return;
        }
        if (
          typeof console !== "undefined" &&
          typeof console.log === "function"
        ) {
          console.log.apply(console, arguments);
        }
      }
    }

    /**
     * Shows a deprecation warning suggesting the modern and spec-compatible API.
     */
    function deprecated(oldMethod, newMethod) {
      if (!deprecationWarnings_) {
        return;
      }
      console.warn(
        oldMethod + " is deprecated, please use " + newMethod + " instead."
      );
    }

    /**
     * Browser detector.
     *
     * @return {object} result containing browser and version
     *     properties.
     */
    function detectBrowser(window) {
      // Returned result object.
      const result = { browser: null, version: null };

      // Fail early if it's not a browser
      if (typeof window === "undefined" || !window.navigator) {
        result.browser = "Not a browser.";
        return result;
      }

      const { navigator } = window;

      if (navigator.mozGetUserMedia) {
        // Firefox.
        result.browser = "firefox";
        result.version = extractVersion(
          navigator.userAgent,
          /Firefox\/(\d+)\./,
          1
        );
      } else if (
        navigator.webkitGetUserMedia ||
        (window.isSecureContext === false && window.webkitRTCPeerConnection)
      ) {
        // Chrome, Chromium, Webview, Opera.
        // Version matches Chrome/WebRTC version.
        // Chrome 74 removed webkitGetUserMedia on http as well so we need the
        // more complicated fallback to webkitRTCPeerConnection.
        result.browser = "chrome";
        result.version = extractVersion(
          navigator.userAgent,
          /Chrom(e|ium)\/(\d+)\./,
          2
        );
      } else if (
        window.RTCPeerConnection &&
        navigator.userAgent.match(/AppleWebKit\/(\d+)\./)
      ) {
        // Safari.
        result.browser = "safari";
        result.version = extractVersion(
          navigator.userAgent,
          /AppleWebKit\/(\d+)\./,
          1
        );
        result.supportsUnifiedPlan =
          window.RTCRtpTransceiver &&
          "currentDirection" in window.RTCRtpTransceiver.prototype;
      } else {
        // Default fallthrough: not supported.
        result.browser = "Not a supported browser.";
        return result;
      }

      return result;
    }

    /**
     * Checks if something is an object.
     *
     * @param {*} val The something you want to check.
     * @return true if val is an object, false otherwise.
     */
    function isObject(val) {
      return Object.prototype.toString.call(val) === "[object Object]";
    }

    /**
     * Remove all empty objects and undefined values
     * from a nested object -- an enhanced and vanilla version
     * of Lodash's `compact`.
     */
    function compactObject(data) {
      if (!isObject(data)) {
        return data;
      }

      return Object.keys(data).reduce(function (accumulator, key) {
        const isObj = isObject(data[key]);
        const value = isObj ? compactObject(data[key]) : data[key];
        const isEmptyObject = isObj && !Object.keys(value).length;
        if (value === undefined || isEmptyObject) {
          return accumulator;
        }
        return Object.assign(accumulator, { [key]: value });
      }, {});
    }

    /* iterates the stats graph recursively. */
    function walkStats(stats, base, resultSet) {
      if (!base || resultSet.has(base.id)) {
        return;
      }
      resultSet.set(base.id, base);
      Object.keys(base).forEach((name) => {
        if (name.endsWith("Id")) {
          walkStats(stats, stats.get(base[name]), resultSet);
        } else if (name.endsWith("Ids")) {
          base[name].forEach((id) => {
            walkStats(stats, stats.get(id), resultSet);
          });
        }
      });
    }

    /* filter getStats for a sender/receiver track. */
    function filterStats(result, track, outbound) {
      const streamStatsType = outbound ? "outbound-rtp" : "inbound-rtp";
      const filteredResult = new Map();
      if (track === null) {
        return filteredResult;
      }
      const trackStats = [];
      result.forEach((value) => {
        if (value.type === "track" && value.trackIdentifier === track.id) {
          trackStats.push(value);
        }
      });
      trackStats.forEach((trackStat) => {
        result.forEach((stats) => {
          if (
            stats.type === streamStatsType &&
            stats.trackId === trackStat.id
          ) {
            walkStats(result, stats, filteredResult);
          }
        });
      });
      return filteredResult;
    }

    /*
     *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
     *
     *  Use of this source code is governed by a BSD-style license
     *  that can be found in the LICENSE file in the root of the source
     *  tree.
     */
    const logging = log;

    function shimGetUserMedia$2(window, browserDetails) {
      const navigator = window && window.navigator;

      if (!navigator.mediaDevices) {
        return;
      }

      const constraintsToChrome_ = function (c) {
        if (typeof c !== "object" || c.mandatory || c.optional) {
          return c;
        }
        const cc = {};
        Object.keys(c).forEach((key) => {
          if (
            key === "require" ||
            key === "advanced" ||
            key === "mediaSource"
          ) {
            return;
          }
          const r = typeof c[key] === "object" ? c[key] : { ideal: c[key] };
          if (r.exact !== undefined && typeof r.exact === "number") {
            r.min = r.max = r.exact;
          }
          const oldname_ = function (prefix, name) {
            if (prefix) {
              return prefix + name.charAt(0).toUpperCase() + name.slice(1);
            }
            return name === "deviceId" ? "sourceId" : name;
          };
          if (r.ideal !== undefined) {
            cc.optional = cc.optional || [];
            let oc = {};
            if (typeof r.ideal === "number") {
              oc[oldname_("min", key)] = r.ideal;
              cc.optional.push(oc);
              oc = {};
              oc[oldname_("max", key)] = r.ideal;
              cc.optional.push(oc);
            } else {
              oc[oldname_("", key)] = r.ideal;
              cc.optional.push(oc);
            }
          }
          if (r.exact !== undefined && typeof r.exact !== "number") {
            cc.mandatory = cc.mandatory || {};
            cc.mandatory[oldname_("", key)] = r.exact;
          } else {
            ["min", "max"].forEach((mix) => {
              if (r[mix] !== undefined) {
                cc.mandatory = cc.mandatory || {};
                cc.mandatory[oldname_(mix, key)] = r[mix];
              }
            });
          }
        });
        if (c.advanced) {
          cc.optional = (cc.optional || []).concat(c.advanced);
        }
        return cc;
      };

      const shimConstraints_ = function (constraints, func) {
        if (browserDetails.version >= 61) {
          return func(constraints);
        }
        constraints = JSON.parse(JSON.stringify(constraints));
        if (constraints && typeof constraints.audio === "object") {
          const remap = function (obj, a, b) {
            if (a in obj && !(b in obj)) {
              obj[b] = obj[a];
              delete obj[a];
            }
          };
          constraints = JSON.parse(JSON.stringify(constraints));
          remap(constraints.audio, "autoGainControl", "googAutoGainControl");
          remap(constraints.audio, "noiseSuppression", "googNoiseSuppression");
          constraints.audio = constraintsToChrome_(constraints.audio);
        }
        if (constraints && typeof constraints.video === "object") {
          // Shim facingMode for mobile & surface pro.
          let face = constraints.video.facingMode;
          face = face && (typeof face === "object" ? face : { ideal: face });
          const getSupportedFacingModeLies = browserDetails.version < 66;

          if (
            face &&
            (face.exact === "user" ||
              face.exact === "environment" ||
              face.ideal === "user" ||
              face.ideal === "environment") &&
            !(
              navigator.mediaDevices.getSupportedConstraints &&
              navigator.mediaDevices.getSupportedConstraints().facingMode &&
              !getSupportedFacingModeLies
            )
          ) {
            delete constraints.video.facingMode;
            let matches;
            if (face.exact === "environment" || face.ideal === "environment") {
              matches = ["back", "rear"];
            } else if (face.exact === "user" || face.ideal === "user") {
              matches = ["front"];
            }
            if (matches) {
              // Look for matches in label, or use last cam for back (typical).
              return navigator.mediaDevices
                .enumerateDevices()
                .then((devices) => {
                  devices = devices.filter((d) => d.kind === "videoinput");
                  let dev = devices.find((d) =>
                    matches.some((match) =>
                      d.label.toLowerCase().includes(match)
                    )
                  );
                  if (!dev && devices.length && matches.includes("back")) {
                    dev = devices[devices.length - 1]; // more likely the back cam
                  }
                  if (dev) {
                    constraints.video.deviceId = face.exact
                      ? { exact: dev.deviceId }
                      : { ideal: dev.deviceId };
                  }
                  constraints.video = constraintsToChrome_(constraints.video);
                  logging("chrome: " + JSON.stringify(constraints));
                  return func(constraints);
                });
            }
          }
          constraints.video = constraintsToChrome_(constraints.video);
        }
        logging("chrome: " + JSON.stringify(constraints));
        return func(constraints);
      };

      const shimError_ = function (e) {
        if (browserDetails.version >= 64) {
          return e;
        }
        return {
          name:
            {
              PermissionDeniedError: "NotAllowedError",
              PermissionDismissedError: "NotAllowedError",
              InvalidStateError: "NotAllowedError",
              DevicesNotFoundError: "NotFoundError",
              ConstraintNotSatisfiedError: "OverconstrainedError",
              TrackStartError: "NotReadableError",
              MediaDeviceFailedDueToShutdown: "NotAllowedError",
              MediaDeviceKillSwitchOn: "NotAllowedError",
              TabCaptureError: "AbortError",
              ScreenCaptureError: "AbortError",
              DeviceCaptureError: "AbortError",
            }[e.name] || e.name,
          message: e.message,
          constraint: e.constraint || e.constraintName,
          toString() {
            return this.name + (this.message && ": ") + this.message;
          },
        };
      };

      const getUserMedia_ = function (constraints, onSuccess, onError) {
        shimConstraints_(constraints, (c) => {
          navigator.webkitGetUserMedia(c, onSuccess, (e) => {
            if (onError) {
              onError(shimError_(e));
            }
          });
        });
      };
      navigator.getUserMedia = getUserMedia_.bind(navigator);

      // Even though Chrome 45 has navigator.mediaDevices and a getUserMedia
      // function which returns a Promise, it does not accept spec-style
      // constraints.
      if (navigator.mediaDevices.getUserMedia) {
        const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
          navigator.mediaDevices
        );
        navigator.mediaDevices.getUserMedia = function (cs) {
          return shimConstraints_(cs, (c) =>
            origGetUserMedia(c).then(
              (stream) => {
                if (
                  (c.audio && !stream.getAudioTracks().length) ||
                  (c.video && !stream.getVideoTracks().length)
                ) {
                  stream.getTracks().forEach((track) => {
                    track.stop();
                  });
                  throw new DOMException("", "NotFoundError");
                }
                return stream;
              },
              (e) => Promise.reject(shimError_(e))
            )
          );
        };
      }
    }

    /*
     *  Copyright (c) 2018 The adapter.js project authors. All Rights Reserved.
     *
     *  Use of this source code is governed by a BSD-style license
     *  that can be found in the LICENSE file in the root of the source
     *  tree.
     */
    function shimGetDisplayMedia$1(window, getSourceId) {
      if (
        window.navigator.mediaDevices &&
        "getDisplayMedia" in window.navigator.mediaDevices
      ) {
        return;
      }
      if (!window.navigator.mediaDevices) {
        return;
      }
      // getSourceId is a function that returns a promise resolving with
      // the sourceId of the screen/window/tab to be shared.
      if (typeof getSourceId !== "function") {
        console.error(
          "shimGetDisplayMedia: getSourceId argument is not " + "a function"
        );
        return;
      }
      window.navigator.mediaDevices.getDisplayMedia = function getDisplayMedia(
        constraints
      ) {
        return getSourceId(constraints).then((sourceId) => {
          const widthSpecified = constraints.video && constraints.video.width;
          const heightSpecified = constraints.video && constraints.video.height;
          const frameRateSpecified =
            constraints.video && constraints.video.frameRate;
          constraints.video = {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: sourceId,
              maxFrameRate: frameRateSpecified || 3,
            },
          };
          if (widthSpecified) {
            constraints.video.mandatory.maxWidth = widthSpecified;
          }
          if (heightSpecified) {
            constraints.video.mandatory.maxHeight = heightSpecified;
          }
          return window.navigator.mediaDevices.getUserMedia(constraints);
        });
      };
    }

    /*
     *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
     *
     *  Use of this source code is governed by a BSD-style license
     *  that can be found in the LICENSE file in the root of the source
     *  tree.
     */

    function shimMediaStream(window) {
      window.MediaStream = window.MediaStream || window.webkitMediaStream;
    }

    function shimOnTrack$1(window) {
      if (
        typeof window === "object" &&
        window.RTCPeerConnection &&
        !("ontrack" in window.RTCPeerConnection.prototype)
      ) {
        Object.defineProperty(window.RTCPeerConnection.prototype, "ontrack", {
          get() {
            return this._ontrack;
          },
          set(f) {
            if (this._ontrack) {
              this.removeEventListener("track", this._ontrack);
            }
            this.addEventListener("track", (this._ontrack = f));
          },
          enumerable: true,
          configurable: true,
        });
        const origSetRemoteDescription =
          window.RTCPeerConnection.prototype.setRemoteDescription;
        window.RTCPeerConnection.prototype.setRemoteDescription =
          function setRemoteDescription() {
            if (!this._ontrackpoly) {
              this._ontrackpoly = (e) => {
                // onaddstream does not fire when a track is added to an existing
                // stream. But stream.onaddtrack is implemented so we use that.
                e.stream.addEventListener("addtrack", (te) => {
                  let receiver;
                  if (window.RTCPeerConnection.prototype.getReceivers) {
                    receiver = this.getReceivers().find(
                      (r) => r.track && r.track.id === te.track.id
                    );
                  } else {
                    receiver = { track: te.track };
                  }

                  const event = new Event("track");
                  event.track = te.track;
                  event.receiver = receiver;
                  event.transceiver = { receiver };
                  event.streams = [e.stream];
                  this.dispatchEvent(event);
                });
                e.stream.getTracks().forEach((track) => {
                  let receiver;
                  if (window.RTCPeerConnection.prototype.getReceivers) {
                    receiver = this.getReceivers().find(
                      (r) => r.track && r.track.id === track.id
                    );
                  } else {
                    receiver = { track };
                  }
                  const event = new Event("track");
                  event.track = track;
                  event.receiver = receiver;
                  event.transceiver = { receiver };
                  event.streams = [e.stream];
                  this.dispatchEvent(event);
                });
              };
              this.addEventListener("addstream", this._ontrackpoly);
            }
            return origSetRemoteDescription.apply(this, arguments);
          };
      } else {
        // even if RTCRtpTransceiver is in window, it is only used and
        // emitted in unified-plan. Unfortunately this means we need
        // to unconditionally wrap the event.
        wrapPeerConnectionEvent(window, "track", (e) => {
          if (!e.transceiver) {
            Object.defineProperty(e, "transceiver", {
              value: { receiver: e.receiver },
            });
          }
          return e;
        });
      }
    }

    function shimGetSendersWithDtmf(window) {
      // Overrides addTrack/removeTrack, depends on shimAddTrackRemoveTrack.
      if (
        typeof window === "object" &&
        window.RTCPeerConnection &&
        !("getSenders" in window.RTCPeerConnection.prototype) &&
        "createDTMFSender" in window.RTCPeerConnection.prototype
      ) {
        const shimSenderWithDtmf = function (pc, track) {
          return {
            track,
            get dtmf() {
              if (this._dtmf === undefined) {
                if (track.kind === "audio") {
                  this._dtmf = pc.createDTMFSender(track);
                } else {
                  this._dtmf = null;
                }
              }
              return this._dtmf;
            },
            _pc: pc,
          };
        };

        // augment addTrack when getSenders is not available.
        if (!window.RTCPeerConnection.prototype.getSenders) {
          window.RTCPeerConnection.prototype.getSenders =
            function getSenders() {
              this._senders = this._senders || [];
              return this._senders.slice(); // return a copy of the internal state.
            };
          const origAddTrack = window.RTCPeerConnection.prototype.addTrack;
          window.RTCPeerConnection.prototype.addTrack = function addTrack(
            track,
            stream
          ) {
            let sender = origAddTrack.apply(this, arguments);
            if (!sender) {
              sender = shimSenderWithDtmf(this, track);
              this._senders.push(sender);
            }
            return sender;
          };

          const origRemoveTrack =
            window.RTCPeerConnection.prototype.removeTrack;
          window.RTCPeerConnection.prototype.removeTrack = function removeTrack(
            sender
          ) {
            origRemoveTrack.apply(this, arguments);
            const idx = this._senders.indexOf(sender);
            if (idx !== -1) {
              this._senders.splice(idx, 1);
            }
          };
        }
        const origAddStream = window.RTCPeerConnection.prototype.addStream;
        window.RTCPeerConnection.prototype.addStream = function addStream(
          stream
        ) {
          this._senders = this._senders || [];
          origAddStream.apply(this, [stream]);
          stream.getTracks().forEach((track) => {
            this._senders.push(shimSenderWithDtmf(this, track));
          });
        };

        const origRemoveStream =
          window.RTCPeerConnection.prototype.removeStream;
        window.RTCPeerConnection.prototype.removeStream = function removeStream(
          stream
        ) {
          this._senders = this._senders || [];
          origRemoveStream.apply(this, [stream]);

          stream.getTracks().forEach((track) => {
            const sender = this._senders.find((s) => s.track === track);
            if (sender) {
              // remove sender
              this._senders.splice(this._senders.indexOf(sender), 1);
            }
          });
        };
      } else if (
        typeof window === "object" &&
        window.RTCPeerConnection &&
        "getSenders" in window.RTCPeerConnection.prototype &&
        "createDTMFSender" in window.RTCPeerConnection.prototype &&
        window.RTCRtpSender &&
        !("dtmf" in window.RTCRtpSender.prototype)
      ) {
        const origGetSenders = window.RTCPeerConnection.prototype.getSenders;
        window.RTCPeerConnection.prototype.getSenders = function getSenders() {
          const senders = origGetSenders.apply(this, []);
          senders.forEach((sender) => (sender._pc = this));
          return senders;
        };

        Object.defineProperty(window.RTCRtpSender.prototype, "dtmf", {
          get() {
            if (this._dtmf === undefined) {
              if (this.track.kind === "audio") {
                this._dtmf = this._pc.createDTMFSender(this.track);
              } else {
                this._dtmf = null;
              }
            }
            return this._dtmf;
          },
        });
      }
    }

    function shimGetStats(window) {
      if (!window.RTCPeerConnection) {
        return;
      }

      const origGetStats = window.RTCPeerConnection.prototype.getStats;
      window.RTCPeerConnection.prototype.getStats = function getStats() {
        const [selector, onSucc, onErr] = arguments;

        // If selector is a function then we are in the old style stats so just
        // pass back the original getStats format to avoid breaking old users.
        if (arguments.length > 0 && typeof selector === "function") {
          return origGetStats.apply(this, arguments);
        }

        // When spec-style getStats is supported, return those when called with
        // either no arguments or the selector argument is null.
        if (
          origGetStats.length === 0 &&
          (arguments.length === 0 || typeof selector !== "function")
        ) {
          return origGetStats.apply(this, []);
        }

        const fixChromeStats_ = function (response) {
          const standardReport = {};
          const reports = response.result();
          reports.forEach((report) => {
            const standardStats = {
              id: report.id,
              timestamp: report.timestamp,
              type:
                {
                  localcandidate: "local-candidate",
                  remotecandidate: "remote-candidate",
                }[report.type] || report.type,
            };
            report.names().forEach((name) => {
              standardStats[name] = report.stat(name);
            });
            standardReport[standardStats.id] = standardStats;
          });

          return standardReport;
        };

        // shim getStats with maplike support
        const makeMapStats = function (stats) {
          return new Map(Object.keys(stats).map((key) => [key, stats[key]]));
        };

        if (arguments.length >= 2) {
          const successCallbackWrapper_ = function (response) {
            onSucc(makeMapStats(fixChromeStats_(response)));
          };

          return origGetStats.apply(this, [successCallbackWrapper_, selector]);
        }

        // promise-support
        return new Promise((resolve, reject) => {
          origGetStats.apply(this, [
            function (response) {
              resolve(makeMapStats(fixChromeStats_(response)));
            },
            reject,
          ]);
        }).then(onSucc, onErr);
      };
    }

    function shimSenderReceiverGetStats(window) {
      if (
        !(
          typeof window === "object" &&
          window.RTCPeerConnection &&
          window.RTCRtpSender &&
          window.RTCRtpReceiver
        )
      ) {
        return;
      }

      // shim sender stats.
      if (!("getStats" in window.RTCRtpSender.prototype)) {
        const origGetSenders = window.RTCPeerConnection.prototype.getSenders;
        if (origGetSenders) {
          window.RTCPeerConnection.prototype.getSenders =
            function getSenders() {
              const senders = origGetSenders.apply(this, []);
              senders.forEach((sender) => (sender._pc = this));
              return senders;
            };
        }

        const origAddTrack = window.RTCPeerConnection.prototype.addTrack;
        if (origAddTrack) {
          window.RTCPeerConnection.prototype.addTrack = function addTrack() {
            const sender = origAddTrack.apply(this, arguments);
            sender._pc = this;
            return sender;
          };
        }
        window.RTCRtpSender.prototype.getStats = function getStats() {
          const sender = this;
          return this._pc.getStats().then((result) =>
            /* Note: this will include stats of all senders that
             *   send a track with the same id as sender.track as
             *   it is not possible to identify the RTCRtpSender.
             */
            filterStats(result, sender.track, true)
          );
        };
      }

      // shim receiver stats.
      if (!("getStats" in window.RTCRtpReceiver.prototype)) {
        const origGetReceivers =
          window.RTCPeerConnection.prototype.getReceivers;
        if (origGetReceivers) {
          window.RTCPeerConnection.prototype.getReceivers =
            function getReceivers() {
              const receivers = origGetReceivers.apply(this, []);
              receivers.forEach((receiver) => (receiver._pc = this));
              return receivers;
            };
        }
        wrapPeerConnectionEvent(window, "track", (e) => {
          e.receiver._pc = e.srcElement;
          return e;
        });
        window.RTCRtpReceiver.prototype.getStats = function getStats() {
          const receiver = this;
          return this._pc
            .getStats()
            .then((result) => filterStats(result, receiver.track, false));
        };
      }

      if (
        !(
          "getStats" in window.RTCRtpSender.prototype &&
          "getStats" in window.RTCRtpReceiver.prototype
        )
      ) {
        return;
      }

      // shim RTCPeerConnection.getStats(track).
      const origGetStats = window.RTCPeerConnection.prototype.getStats;
      window.RTCPeerConnection.prototype.getStats = function getStats() {
        if (
          arguments.length > 0 &&
          arguments[0] instanceof window.MediaStreamTrack
        ) {
          const track = arguments[0];
          let sender;
          let receiver;
          let err;
          this.getSenders().forEach((s) => {
            if (s.track === track) {
              if (sender) {
                err = true;
              } else {
                sender = s;
              }
            }
          });
          this.getReceivers().forEach((r) => {
            if (r.track === track) {
              if (receiver) {
                err = true;
              } else {
                receiver = r;
              }
            }
            return r.track === track;
          });
          if (err || (sender && receiver)) {
            return Promise.reject(
              new DOMException(
                "There are more than one sender or receiver for the track.",
                "InvalidAccessError"
              )
            );
          } else if (sender) {
            return sender.getStats();
          } else if (receiver) {
            return receiver.getStats();
          }
          return Promise.reject(
            new DOMException(
              "There is no sender or receiver for the track.",
              "InvalidAccessError"
            )
          );
        }
        return origGetStats.apply(this, arguments);
      };
    }

    function shimAddTrackRemoveTrackWithNative(window) {
      // shim addTrack/removeTrack with native variants in order to make
      // the interactions with legacy getLocalStreams behave as in other browsers.
      // Keeps a mapping stream.id => [stream, rtpsenders...]
      window.RTCPeerConnection.prototype.getLocalStreams =
        function getLocalStreams() {
          this._shimmedLocalStreams = this._shimmedLocalStreams || {};
          return Object.keys(this._shimmedLocalStreams).map(
            (streamId) => this._shimmedLocalStreams[streamId][0]
          );
        };

      const origAddTrack = window.RTCPeerConnection.prototype.addTrack;
      window.RTCPeerConnection.prototype.addTrack = function addTrack(
        track,
        stream
      ) {
        if (!stream) {
          return origAddTrack.apply(this, arguments);
        }
        this._shimmedLocalStreams = this._shimmedLocalStreams || {};

        const sender = origAddTrack.apply(this, arguments);
        if (!this._shimmedLocalStreams[stream.id]) {
          this._shimmedLocalStreams[stream.id] = [stream, sender];
        } else if (
          this._shimmedLocalStreams[stream.id].indexOf(sender) === -1
        ) {
          this._shimmedLocalStreams[stream.id].push(sender);
        }
        return sender;
      };

      const origAddStream = window.RTCPeerConnection.prototype.addStream;
      window.RTCPeerConnection.prototype.addStream = function addStream(
        stream
      ) {
        this._shimmedLocalStreams = this._shimmedLocalStreams || {};

        stream.getTracks().forEach((track) => {
          const alreadyExists = this.getSenders().find(
            (s) => s.track === track
          );
          if (alreadyExists) {
            throw new DOMException(
              "Track already exists.",
              "InvalidAccessError"
            );
          }
        });
        const existingSenders = this.getSenders();
        origAddStream.apply(this, arguments);
        const newSenders = this.getSenders().filter(
          (newSender) => existingSenders.indexOf(newSender) === -1
        );
        this._shimmedLocalStreams[stream.id] = [stream].concat(newSenders);
      };

      const origRemoveStream = window.RTCPeerConnection.prototype.removeStream;
      window.RTCPeerConnection.prototype.removeStream = function removeStream(
        stream
      ) {
        this._shimmedLocalStreams = this._shimmedLocalStreams || {};
        delete this._shimmedLocalStreams[stream.id];
        return origRemoveStream.apply(this, arguments);
      };

      const origRemoveTrack = window.RTCPeerConnection.prototype.removeTrack;
      window.RTCPeerConnection.prototype.removeTrack = function removeTrack(
        sender
      ) {
        this._shimmedLocalStreams = this._shimmedLocalStreams || {};
        if (sender) {
          Object.keys(this._shimmedLocalStreams).forEach((streamId) => {
            const idx = this._shimmedLocalStreams[streamId].indexOf(sender);
            if (idx !== -1) {
              this._shimmedLocalStreams[streamId].splice(idx, 1);
            }
            if (this._shimmedLocalStreams[streamId].length === 1) {
              delete this._shimmedLocalStreams[streamId];
            }
          });
        }
        return origRemoveTrack.apply(this, arguments);
      };
    }

    function shimAddTrackRemoveTrack(window, browserDetails) {
      if (!window.RTCPeerConnection) {
        return;
      }
      // shim addTrack and removeTrack.
      if (
        window.RTCPeerConnection.prototype.addTrack &&
        browserDetails.version >= 65
      ) {
        return shimAddTrackRemoveTrackWithNative(window);
      }

      // also shim pc.getLocalStreams when addTrack is shimmed
      // to return the original streams.
      const origGetLocalStreams =
        window.RTCPeerConnection.prototype.getLocalStreams;
      window.RTCPeerConnection.prototype.getLocalStreams =
        function getLocalStreams() {
          const nativeStreams = origGetLocalStreams.apply(this);
          this._reverseStreams = this._reverseStreams || {};
          return nativeStreams.map((stream) => this._reverseStreams[stream.id]);
        };

      const origAddStream = window.RTCPeerConnection.prototype.addStream;
      window.RTCPeerConnection.prototype.addStream = function addStream(
        stream
      ) {
        this._streams = this._streams || {};
        this._reverseStreams = this._reverseStreams || {};

        stream.getTracks().forEach((track) => {
          const alreadyExists = this.getSenders().find(
            (s) => s.track === track
          );
          if (alreadyExists) {
            throw new DOMException(
              "Track already exists.",
              "InvalidAccessError"
            );
          }
        });
        // Add identity mapping for consistency with addTrack.
        // Unless this is being used with a stream from addTrack.
        if (!this._reverseStreams[stream.id]) {
          const newStream = new window.MediaStream(stream.getTracks());
          this._streams[stream.id] = newStream;
          this._reverseStreams[newStream.id] = stream;
          stream = newStream;
        }
        origAddStream.apply(this, [stream]);
      };

      const origRemoveStream = window.RTCPeerConnection.prototype.removeStream;
      window.RTCPeerConnection.prototype.removeStream = function removeStream(
        stream
      ) {
        this._streams = this._streams || {};
        this._reverseStreams = this._reverseStreams || {};

        origRemoveStream.apply(this, [this._streams[stream.id] || stream]);
        delete this._reverseStreams[
          this._streams[stream.id] ? this._streams[stream.id].id : stream.id
        ];
        delete this._streams[stream.id];
      };

      window.RTCPeerConnection.prototype.addTrack = function addTrack(
        track,
        stream
      ) {
        if (this.signalingState === "closed") {
          throw new DOMException(
            "The RTCPeerConnection's signalingState is 'closed'.",
            "InvalidStateError"
          );
        }
        const streams = [].slice.call(arguments, 1);
        if (
          streams.length !== 1 ||
          !streams[0].getTracks().find((t) => t === track)
        ) {
          // this is not fully correct but all we can manage without
          // [[associated MediaStreams]] internal slot.
          throw new DOMException(
            "The adapter.js addTrack polyfill only supports a single " +
              " stream which is associated with the specified track.",
            "NotSupportedError"
          );
        }

        const alreadyExists = this.getSenders().find((s) => s.track === track);
        if (alreadyExists) {
          throw new DOMException("Track already exists.", "InvalidAccessError");
        }

        this._streams = this._streams || {};
        this._reverseStreams = this._reverseStreams || {};
        const oldStream = this._streams[stream.id];
        if (oldStream) {
          // this is using odd Chrome behaviour, use with caution:
          // https://bugs.chromium.org/p/webrtc/issues/detail?id=7815
          // Note: we rely on the high-level addTrack/dtmf shim to
          // create the sender with a dtmf sender.
          oldStream.addTrack(track);

          // Trigger ONN async.
          Promise.resolve().then(() => {
            this.dispatchEvent(new Event("negotiationneeded"));
          });
        } else {
          const newStream = new window.MediaStream([track]);
          this._streams[stream.id] = newStream;
          this._reverseStreams[newStream.id] = stream;
          this.addStream(newStream);
        }
        return this.getSenders().find((s) => s.track === track);
      };

      // replace the internal stream id with the external one and
      // vice versa.
      function replaceInternalStreamId(pc, description) {
        let sdp = description.sdp;
        Object.keys(pc._reverseStreams || []).forEach((internalId) => {
          const externalStream = pc._reverseStreams[internalId];
          const internalStream = pc._streams[externalStream.id];
          sdp = sdp.replace(
            new RegExp(internalStream.id, "g"),
            externalStream.id
          );
        });
        return new RTCSessionDescription({
          type: description.type,
          sdp,
        });
      }
      function replaceExternalStreamId(pc, description) {
        let sdp = description.sdp;
        Object.keys(pc._reverseStreams || []).forEach((internalId) => {
          const externalStream = pc._reverseStreams[internalId];
          const internalStream = pc._streams[externalStream.id];
          sdp = sdp.replace(
            new RegExp(externalStream.id, "g"),
            internalStream.id
          );
        });
        return new RTCSessionDescription({
          type: description.type,
          sdp,
        });
      }
      ["createOffer", "createAnswer"].forEach(function (method) {
        const nativeMethod = window.RTCPeerConnection.prototype[method];
        const methodObj = {
          [method]() {
            const args = arguments;
            const isLegacyCall =
              arguments.length && typeof arguments[0] === "function";
            if (isLegacyCall) {
              return nativeMethod.apply(this, [
                (description) => {
                  const desc = replaceInternalStreamId(this, description);
                  args[0].apply(null, [desc]);
                },
                (err) => {
                  if (args[1]) {
                    args[1].apply(null, err);
                  }
                },
                arguments[2],
              ]);
            }
            return nativeMethod
              .apply(this, arguments)
              .then((description) =>
                replaceInternalStreamId(this, description)
              );
          },
        };
        window.RTCPeerConnection.prototype[method] = methodObj[method];
      });

      const origSetLocalDescription =
        window.RTCPeerConnection.prototype.setLocalDescription;
      window.RTCPeerConnection.prototype.setLocalDescription =
        function setLocalDescription() {
          if (!arguments.length || !arguments[0].type) {
            return origSetLocalDescription.apply(this, arguments);
          }
          arguments[0] = replaceExternalStreamId(this, arguments[0]);
          return origSetLocalDescription.apply(this, arguments);
        };

      // TODO: mangle getStats: https://w3c.github.io/webrtc-stats/#dom-rtcmediastreamstats-streamidentifier

      const origLocalDescription = Object.getOwnPropertyDescriptor(
        window.RTCPeerConnection.prototype,
        "localDescription"
      );
      Object.defineProperty(
        window.RTCPeerConnection.prototype,
        "localDescription",
        {
          get() {
            const description = origLocalDescription.get.apply(this);
            if (description.type === "") {
              return description;
            }
            return replaceInternalStreamId(this, description);
          },
        }
      );

      window.RTCPeerConnection.prototype.removeTrack = function removeTrack(
        sender
      ) {
        if (this.signalingState === "closed") {
          throw new DOMException(
            "The RTCPeerConnection's signalingState is 'closed'.",
            "InvalidStateError"
          );
        }
        // We can not yet check for sender instanceof RTCRtpSender
        // since we shim RTPSender. So we check if sender._pc is set.
        if (!sender._pc) {
          throw new DOMException(
            "Argument 1 of RTCPeerConnection.removeTrack " +
              "does not implement interface RTCRtpSender.",
            "TypeError"
          );
        }
        const isLocal = sender._pc === this;
        if (!isLocal) {
          throw new DOMException(
            "Sender was not created by this connection.",
            "InvalidAccessError"
          );
        }

        // Search for the native stream the senders track belongs to.
        this._streams = this._streams || {};
        let stream;
        Object.keys(this._streams).forEach((streamid) => {
          const hasTrack = this._streams[streamid]
            .getTracks()
            .find((track) => sender.track === track);
          if (hasTrack) {
            stream = this._streams[streamid];
          }
        });

        if (stream) {
          if (stream.getTracks().length === 1) {
            // if this is the last track of the stream, remove the stream. This
            // takes care of any shimmed _senders.
            this.removeStream(this._reverseStreams[stream.id]);
          } else {
            // relying on the same odd chrome behaviour as above.
            stream.removeTrack(sender.track);
          }
          this.dispatchEvent(new Event("negotiationneeded"));
        }
      };
    }

    function shimPeerConnection$1(window, browserDetails) {
      if (!window.RTCPeerConnection && window.webkitRTCPeerConnection) {
        // very basic support for old versions.
        window.RTCPeerConnection = window.webkitRTCPeerConnection;
      }
      if (!window.RTCPeerConnection) {
        return;
      }

      // shim implicit creation of RTCSessionDescription/RTCIceCandidate
      if (browserDetails.version < 53) {
        [
          "setLocalDescription",
          "setRemoteDescription",
          "addIceCandidate",
        ].forEach(function (method) {
          const nativeMethod = window.RTCPeerConnection.prototype[method];
          const methodObj = {
            [method]() {
              arguments[0] = new (
                method === "addIceCandidate"
                  ? window.RTCIceCandidate
                  : window.RTCSessionDescription
              )(arguments[0]);
              return nativeMethod.apply(this, arguments);
            },
          };
          window.RTCPeerConnection.prototype[method] = methodObj[method];
        });
      }
    }

    // Attempt to fix ONN in plan-b mode.
    function fixNegotiationNeeded(window, browserDetails) {
      wrapPeerConnectionEvent(window, "negotiationneeded", (e) => {
        const pc = e.target;
        if (
          browserDetails.version < 72 ||
          (pc.getConfiguration &&
            pc.getConfiguration().sdpSemantics === "plan-b")
        ) {
          if (pc.signalingState !== "stable") {
            return;
          }
        }
        return e;
      });
    }

    var chromeShim = /*#__PURE__*/ Object.freeze({
      __proto__: null,
      shimMediaStream: shimMediaStream,
      shimOnTrack: shimOnTrack$1,
      shimGetSendersWithDtmf: shimGetSendersWithDtmf,
      shimGetStats: shimGetStats,
      shimSenderReceiverGetStats: shimSenderReceiverGetStats,
      shimAddTrackRemoveTrackWithNative: shimAddTrackRemoveTrackWithNative,
      shimAddTrackRemoveTrack: shimAddTrackRemoveTrack,
      shimPeerConnection: shimPeerConnection$1,
      fixNegotiationNeeded: fixNegotiationNeeded,
      shimGetUserMedia: shimGetUserMedia$2,
      shimGetDisplayMedia: shimGetDisplayMedia$1,
    });

    /*
     *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
     *
     *  Use of this source code is governed by a BSD-style license
     *  that can be found in the LICENSE file in the root of the source
     *  tree.
     */

    function shimGetUserMedia$1(window, browserDetails) {
      const navigator = window && window.navigator;
      const MediaStreamTrack = window && window.MediaStreamTrack;

      navigator.getUserMedia = function (constraints, onSuccess, onError) {
        // Replace Firefox 44+'s deprecation warning with unprefixed version.
        deprecated(
          "navigator.getUserMedia",
          "navigator.mediaDevices.getUserMedia"
        );
        navigator.mediaDevices
          .getUserMedia(constraints)
          .then(onSuccess, onError);
      };

      if (
        !(
          browserDetails.version > 55 &&
          "autoGainControl" in navigator.mediaDevices.getSupportedConstraints()
        )
      ) {
        const remap = function (obj, a, b) {
          if (a in obj && !(b in obj)) {
            obj[b] = obj[a];
            delete obj[a];
          }
        };

        const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
          navigator.mediaDevices
        );
        navigator.mediaDevices.getUserMedia = function (c) {
          if (typeof c === "object" && typeof c.audio === "object") {
            c = JSON.parse(JSON.stringify(c));
            remap(c.audio, "autoGainControl", "mozAutoGainControl");
            remap(c.audio, "noiseSuppression", "mozNoiseSuppression");
          }
          return nativeGetUserMedia(c);
        };

        if (MediaStreamTrack && MediaStreamTrack.prototype.getSettings) {
          const nativeGetSettings = MediaStreamTrack.prototype.getSettings;
          MediaStreamTrack.prototype.getSettings = function () {
            const obj = nativeGetSettings.apply(this, arguments);
            remap(obj, "mozAutoGainControl", "autoGainControl");
            remap(obj, "mozNoiseSuppression", "noiseSuppression");
            return obj;
          };
        }

        if (MediaStreamTrack && MediaStreamTrack.prototype.applyConstraints) {
          const nativeApplyConstraints =
            MediaStreamTrack.prototype.applyConstraints;
          MediaStreamTrack.prototype.applyConstraints = function (c) {
            if (this.kind === "audio" && typeof c === "object") {
              c = JSON.parse(JSON.stringify(c));
              remap(c, "autoGainControl", "mozAutoGainControl");
              remap(c, "noiseSuppression", "mozNoiseSuppression");
            }
            return nativeApplyConstraints.apply(this, [c]);
          };
        }
      }
    }

    /*
     *  Copyright (c) 2018 The adapter.js project authors. All Rights Reserved.
     *
     *  Use of this source code is governed by a BSD-style license
     *  that can be found in the LICENSE file in the root of the source
     *  tree.
     */

    function shimGetDisplayMedia(window, preferredMediaSource) {
      if (
        window.navigator.mediaDevices &&
        "getDisplayMedia" in window.navigator.mediaDevices
      ) {
        return;
      }
      if (!window.navigator.mediaDevices) {
        return;
      }
      window.navigator.mediaDevices.getDisplayMedia = function getDisplayMedia(
        constraints
      ) {
        if (!(constraints && constraints.video)) {
          const err = new DOMException(
            "getDisplayMedia without video " + "constraints is undefined"
          );
          err.name = "NotFoundError";
          // from https://heycam.github.io/webidl/#idl-DOMException-error-names
          err.code = 8;
          return Promise.reject(err);
        }
        if (constraints.video === true) {
          constraints.video = { mediaSource: preferredMediaSource };
        } else {
          constraints.video.mediaSource = preferredMediaSource;
        }
        return window.navigator.mediaDevices.getUserMedia(constraints);
      };
    }

    /*
     *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
     *
     *  Use of this source code is governed by a BSD-style license
     *  that can be found in the LICENSE file in the root of the source
     *  tree.
     */

    function shimOnTrack(window) {
      if (
        typeof window === "object" &&
        window.RTCTrackEvent &&
        "receiver" in window.RTCTrackEvent.prototype &&
        !("transceiver" in window.RTCTrackEvent.prototype)
      ) {
        Object.defineProperty(window.RTCTrackEvent.prototype, "transceiver", {
          get() {
            return { receiver: this.receiver };
          },
        });
      }
    }

    function shimPeerConnection(window, browserDetails) {
      if (
        typeof window !== "object" ||
        !(window.RTCPeerConnection || window.mozRTCPeerConnection)
      ) {
        return; // probably media.peerconnection.enabled=false in about:config
      }
      if (!window.RTCPeerConnection && window.mozRTCPeerConnection) {
        // very basic support for old versions.
        window.RTCPeerConnection = window.mozRTCPeerConnection;
      }

      if (browserDetails.version < 53) {
        // shim away need for obsolete RTCIceCandidate/RTCSessionDescription.
        [
          "setLocalDescription",
          "setRemoteDescription",
          "addIceCandidate",
        ].forEach(function (method) {
          const nativeMethod = window.RTCPeerConnection.prototype[method];
          const methodObj = {
            [method]() {
              arguments[0] = new (
                method === "addIceCandidate"
                  ? window.RTCIceCandidate
                  : window.RTCSessionDescription
              )(arguments[0]);
              return nativeMethod.apply(this, arguments);
            },
          };
          window.RTCPeerConnection.prototype[method] = methodObj[method];
        });
      }

      const modernStatsTypes = {
        inboundrtp: "inbound-rtp",
        outboundrtp: "outbound-rtp",
        candidatepair: "candidate-pair",
        localcandidate: "local-candidate",
        remotecandidate: "remote-candidate",
      };

      const nativeGetStats = window.RTCPeerConnection.prototype.getStats;
      window.RTCPeerConnection.prototype.getStats = function getStats() {
        const [selector, onSucc, onErr] = arguments;
        return nativeGetStats
          .apply(this, [selector || null])
          .then((stats) => {
            if (browserDetails.version < 53 && !onSucc) {
              // Shim only promise getStats with spec-hyphens in type names
              // Leave callback version alone; misc old uses of forEach before Map
              try {
                stats.forEach((stat) => {
                  stat.type = modernStatsTypes[stat.type] || stat.type;
                });
              } catch (e) {
                if (e.name !== "TypeError") {
                  throw e;
                }
                // Avoid TypeError: "type" is read-only, in old versions. 34-43ish
                stats.forEach((stat, i) => {
                  stats.set(
                    i,
                    Object.assign({}, stat, {
                      type: modernStatsTypes[stat.type] || stat.type,
                    })
                  );
                });
              }
            }
            return stats;
          })
          .then(onSucc, onErr);
      };
    }

    function shimSenderGetStats(window) {
      if (
        !(
          typeof window === "object" &&
          window.RTCPeerConnection &&
          window.RTCRtpSender
        )
      ) {
        return;
      }
      if (window.RTCRtpSender && "getStats" in window.RTCRtpSender.prototype) {
        return;
      }
      const origGetSenders = window.RTCPeerConnection.prototype.getSenders;
      if (origGetSenders) {
        window.RTCPeerConnection.prototype.getSenders = function getSenders() {
          const senders = origGetSenders.apply(this, []);
          senders.forEach((sender) => (sender._pc = this));
          return senders;
        };
      }

      const origAddTrack = window.RTCPeerConnection.prototype.addTrack;
      if (origAddTrack) {
        window.RTCPeerConnection.prototype.addTrack = function addTrack() {
          const sender = origAddTrack.apply(this, arguments);
          sender._pc = this;
          return sender;
        };
      }
      window.RTCRtpSender.prototype.getStats = function getStats() {
        return this.track
          ? this._pc.getStats(this.track)
          : Promise.resolve(new Map());
      };
    }

    function shimReceiverGetStats(window) {
      if (
        !(
          typeof window === "object" &&
          window.RTCPeerConnection &&
          window.RTCRtpSender
        )
      ) {
        return;
      }
      if (
        window.RTCRtpSender &&
        "getStats" in window.RTCRtpReceiver.prototype
      ) {
        return;
      }
      const origGetReceivers = window.RTCPeerConnection.prototype.getReceivers;
      if (origGetReceivers) {
        window.RTCPeerConnection.prototype.getReceivers =
          function getReceivers() {
            const receivers = origGetReceivers.apply(this, []);
            receivers.forEach((receiver) => (receiver._pc = this));
            return receivers;
          };
      }
      wrapPeerConnectionEvent(window, "track", (e) => {
        e.receiver._pc = e.srcElement;
        return e;
      });
      window.RTCRtpReceiver.prototype.getStats = function getStats() {
        return this._pc.getStats(this.track);
      };
    }

    function shimRemoveStream(window) {
      if (
        !window.RTCPeerConnection ||
        "removeStream" in window.RTCPeerConnection.prototype
      ) {
        return;
      }
      window.RTCPeerConnection.prototype.removeStream = function removeStream(
        stream
      ) {
        deprecated("removeStream", "removeTrack");
        this.getSenders().forEach((sender) => {
          if (sender.track && stream.getTracks().includes(sender.track)) {
            this.removeTrack(sender);
          }
        });
      };
    }

    function shimRTCDataChannel(window) {
      // rename DataChannel to RTCDataChannel (native fix in FF60):
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1173851
      if (window.DataChannel && !window.RTCDataChannel) {
        window.RTCDataChannel = window.DataChannel;
      }
    }

    function shimAddTransceiver(window) {
      // https://github.com/webrtcHacks/adapter/issues/998#issuecomment-516921647
      // Firefox ignores the init sendEncodings options passed to addTransceiver
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1396918
      if (!(typeof window === "object" && window.RTCPeerConnection)) {
        return;
      }
      const origAddTransceiver =
        window.RTCPeerConnection.prototype.addTransceiver;
      if (origAddTransceiver) {
        window.RTCPeerConnection.prototype.addTransceiver =
          function addTransceiver() {
            this.setParametersPromises = [];
            // WebIDL input coercion and validation
            let sendEncodings = arguments[1] && arguments[1].sendEncodings;
            if (sendEncodings === undefined) {
              sendEncodings = [];
            }
            sendEncodings = [...sendEncodings];
            const shouldPerformCheck = sendEncodings.length > 0;
            if (shouldPerformCheck) {
              // If sendEncodings params are provided, validate grammar
              sendEncodings.forEach((encodingParam) => {
                if ("rid" in encodingParam) {
                  const ridRegex = /^[a-z0-9]{0,16}$/i;
                  if (!ridRegex.test(encodingParam.rid)) {
                    throw new TypeError("Invalid RID value provided.");
                  }
                }
                if ("scaleResolutionDownBy" in encodingParam) {
                  if (
                    !(parseFloat(encodingParam.scaleResolutionDownBy) >= 1.0)
                  ) {
                    throw new RangeError(
                      "scale_resolution_down_by must be >= 1.0"
                    );
                  }
                }
                if ("maxFramerate" in encodingParam) {
                  if (!(parseFloat(encodingParam.maxFramerate) >= 0)) {
                    throw new RangeError("max_framerate must be >= 0.0");
                  }
                }
              });
            }
            const transceiver = origAddTransceiver.apply(this, arguments);
            if (shouldPerformCheck) {
              // Check if the init options were applied. If not we do this in an
              // asynchronous way and save the promise reference in a global object.
              // This is an ugly hack, but at the same time is way more robust than
              // checking the sender parameters before and after the createOffer
              // Also note that after the createoffer we are not 100% sure that
              // the params were asynchronously applied so we might miss the
              // opportunity to recreate offer.
              const { sender } = transceiver;
              const params = sender.getParameters();
              if (
                !("encodings" in params) ||
                // Avoid being fooled by patched getParameters() below.
                (params.encodings.length === 1 &&
                  Object.keys(params.encodings[0]).length === 0)
              ) {
                params.encodings = sendEncodings;
                sender.sendEncodings = sendEncodings;
                this.setParametersPromises.push(
                  sender
                    .setParameters(params)
                    .then(() => {
                      delete sender.sendEncodings;
                    })
                    .catch(() => {
                      delete sender.sendEncodings;
                    })
                );
              }
            }
            return transceiver;
          };
      }
    }

    function shimGetParameters(window) {
      if (!(typeof window === "object" && window.RTCRtpSender)) {
        return;
      }
      const origGetParameters = window.RTCRtpSender.prototype.getParameters;
      if (origGetParameters) {
        window.RTCRtpSender.prototype.getParameters = function getParameters() {
          const params = origGetParameters.apply(this, arguments);
          if (!("encodings" in params)) {
            params.encodings = [].concat(this.sendEncodings || [{}]);
          }
          return params;
        };
      }
    }

    function shimCreateOffer(window) {
      // https://github.com/webrtcHacks/adapter/issues/998#issuecomment-516921647
      // Firefox ignores the init sendEncodings options passed to addTransceiver
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1396918
      if (!(typeof window === "object" && window.RTCPeerConnection)) {
        return;
      }
      const origCreateOffer = window.RTCPeerConnection.prototype.createOffer;
      window.RTCPeerConnection.prototype.createOffer = function createOffer() {
        if (this.setParametersPromises && this.setParametersPromises.length) {
          return Promise.all(this.setParametersPromises)
            .then(() => {
              return origCreateOffer.apply(this, arguments);
            })
            .finally(() => {
              this.setParametersPromises = [];
            });
        }
        return origCreateOffer.apply(this, arguments);
      };
    }

    function shimCreateAnswer(window) {
      // https://github.com/webrtcHacks/adapter/issues/998#issuecomment-516921647
      // Firefox ignores the init sendEncodings options passed to addTransceiver
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1396918
      if (!(typeof window === "object" && window.RTCPeerConnection)) {
        return;
      }
      const origCreateAnswer = window.RTCPeerConnection.prototype.createAnswer;
      window.RTCPeerConnection.prototype.createAnswer =
        function createAnswer() {
          if (this.setParametersPromises && this.setParametersPromises.length) {
            return Promise.all(this.setParametersPromises)
              .then(() => {
                return origCreateAnswer.apply(this, arguments);
              })
              .finally(() => {
                this.setParametersPromises = [];
              });
          }
          return origCreateAnswer.apply(this, arguments);
        };
    }

    var firefoxShim = /*#__PURE__*/ Object.freeze({
      __proto__: null,
      shimOnTrack: shimOnTrack,
      shimPeerConnection: shimPeerConnection,
      shimSenderGetStats: shimSenderGetStats,
      shimReceiverGetStats: shimReceiverGetStats,
      shimRemoveStream: shimRemoveStream,
      shimRTCDataChannel: shimRTCDataChannel,
      shimAddTransceiver: shimAddTransceiver,
      shimGetParameters: shimGetParameters,
      shimCreateOffer: shimCreateOffer,
      shimCreateAnswer: shimCreateAnswer,
      shimGetUserMedia: shimGetUserMedia$1,
      shimGetDisplayMedia: shimGetDisplayMedia,
    });

    /*
     *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
     *
     *  Use of this source code is governed by a BSD-style license
     *  that can be found in the LICENSE file in the root of the source
     *  tree.
     */

    function shimLocalStreamsAPI(window) {
      if (typeof window !== "object" || !window.RTCPeerConnection) {
        return;
      }
      if (!("getLocalStreams" in window.RTCPeerConnection.prototype)) {
        window.RTCPeerConnection.prototype.getLocalStreams =
          function getLocalStreams() {
            if (!this._localStreams) {
              this._localStreams = [];
            }
            return this._localStreams;
          };
      }
      if (!("addStream" in window.RTCPeerConnection.prototype)) {
        const _addTrack = window.RTCPeerConnection.prototype.addTrack;
        window.RTCPeerConnection.prototype.addStream = function addStream(
          stream
        ) {
          if (!this._localStreams) {
            this._localStreams = [];
          }
          if (!this._localStreams.includes(stream)) {
            this._localStreams.push(stream);
          }
          // Try to emulate Chrome's behaviour of adding in audio-video order.
          // Safari orders by track id.
          stream
            .getAudioTracks()
            .forEach((track) => _addTrack.call(this, track, stream));
          stream
            .getVideoTracks()
            .forEach((track) => _addTrack.call(this, track, stream));
        };

        window.RTCPeerConnection.prototype.addTrack = function addTrack(
          track,
          ...streams
        ) {
          if (streams) {
            streams.forEach((stream) => {
              if (!this._localStreams) {
                this._localStreams = [stream];
              } else if (!this._localStreams.includes(stream)) {
                this._localStreams.push(stream);
              }
            });
          }
          return _addTrack.apply(this, arguments);
        };
      }
      if (!("removeStream" in window.RTCPeerConnection.prototype)) {
        window.RTCPeerConnection.prototype.removeStream = function removeStream(
          stream
        ) {
          if (!this._localStreams) {
            this._localStreams = [];
          }
          const index = this._localStreams.indexOf(stream);
          if (index === -1) {
            return;
          }
          this._localStreams.splice(index, 1);
          const tracks = stream.getTracks();
          this.getSenders().forEach((sender) => {
            if (tracks.includes(sender.track)) {
              this.removeTrack(sender);
            }
          });
        };
      }
    }

    function shimRemoteStreamsAPI(window) {
      if (typeof window !== "object" || !window.RTCPeerConnection) {
        return;
      }
      if (!("getRemoteStreams" in window.RTCPeerConnection.prototype)) {
        window.RTCPeerConnection.prototype.getRemoteStreams =
          function getRemoteStreams() {
            return this._remoteStreams ? this._remoteStreams : [];
          };
      }
      if (!("onaddstream" in window.RTCPeerConnection.prototype)) {
        Object.defineProperty(
          window.RTCPeerConnection.prototype,
          "onaddstream",
          {
            get() {
              return this._onaddstream;
            },
            set(f) {
              if (this._onaddstream) {
                this.removeEventListener("addstream", this._onaddstream);
                this.removeEventListener("track", this._onaddstreampoly);
              }
              this.addEventListener("addstream", (this._onaddstream = f));
              this.addEventListener(
                "track",
                (this._onaddstreampoly = (e) => {
                  e.streams.forEach((stream) => {
                    if (!this._remoteStreams) {
                      this._remoteStreams = [];
                    }
                    if (this._remoteStreams.includes(stream)) {
                      return;
                    }
                    this._remoteStreams.push(stream);
                    const event = new Event("addstream");
                    event.stream = stream;
                    this.dispatchEvent(event);
                  });
                })
              );
            },
          }
        );
        const origSetRemoteDescription =
          window.RTCPeerConnection.prototype.setRemoteDescription;
        window.RTCPeerConnection.prototype.setRemoteDescription =
          function setRemoteDescription() {
            const pc = this;
            if (!this._onaddstreampoly) {
              this.addEventListener(
                "track",
                (this._onaddstreampoly = function (e) {
                  e.streams.forEach((stream) => {
                    if (!pc._remoteStreams) {
                      pc._remoteStreams = [];
                    }
                    if (pc._remoteStreams.indexOf(stream) >= 0) {
                      return;
                    }
                    pc._remoteStreams.push(stream);
                    const event = new Event("addstream");
                    event.stream = stream;
                    pc.dispatchEvent(event);
                  });
                })
              );
            }
            return origSetRemoteDescription.apply(pc, arguments);
          };
      }
    }

    function shimCallbacksAPI(window) {
      if (typeof window !== "object" || !window.RTCPeerConnection) {
        return;
      }
      const prototype = window.RTCPeerConnection.prototype;
      const origCreateOffer = prototype.createOffer;
      const origCreateAnswer = prototype.createAnswer;
      const setLocalDescription = prototype.setLocalDescription;
      const setRemoteDescription = prototype.setRemoteDescription;
      const addIceCandidate = prototype.addIceCandidate;

      prototype.createOffer = function createOffer(
        successCallback,
        failureCallback
      ) {
        const options = arguments.length >= 2 ? arguments[2] : arguments[0];
        const promise = origCreateOffer.apply(this, [options]);
        if (!failureCallback) {
          return promise;
        }
        promise.then(successCallback, failureCallback);
        return Promise.resolve();
      };

      prototype.createAnswer = function createAnswer(
        successCallback,
        failureCallback
      ) {
        const options = arguments.length >= 2 ? arguments[2] : arguments[0];
        const promise = origCreateAnswer.apply(this, [options]);
        if (!failureCallback) {
          return promise;
        }
        promise.then(successCallback, failureCallback);
        return Promise.resolve();
      };

      let withCallback = function (
        description,
        successCallback,
        failureCallback
      ) {
        const promise = setLocalDescription.apply(this, [description]);
        if (!failureCallback) {
          return promise;
        }
        promise.then(successCallback, failureCallback);
        return Promise.resolve();
      };
      prototype.setLocalDescription = withCallback;

      withCallback = function (description, successCallback, failureCallback) {
        const promise = setRemoteDescription.apply(this, [description]);
        if (!failureCallback) {
          return promise;
        }
        promise.then(successCallback, failureCallback);
        return Promise.resolve();
      };
      prototype.setRemoteDescription = withCallback;

      withCallback = function (candidate, successCallback, failureCallback) {
        const promise = addIceCandidate.apply(this, [candidate]);
        if (!failureCallback) {
          return promise;
        }
        promise.then(successCallback, failureCallback);
        return Promise.resolve();
      };
      prototype.addIceCandidate = withCallback;
    }

    function shimGetUserMedia(window) {
      const navigator = window && window.navigator;

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // shim not needed in Safari 12.1
        const mediaDevices = navigator.mediaDevices;
        const _getUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
        navigator.mediaDevices.getUserMedia = (constraints) => {
          return _getUserMedia(shimConstraints(constraints));
        };
      }

      if (
        !navigator.getUserMedia &&
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia
      ) {
        navigator.getUserMedia = function getUserMedia(constraints, cb, errcb) {
          navigator.mediaDevices.getUserMedia(constraints).then(cb, errcb);
        }.bind(navigator);
      }
    }

    function shimConstraints(constraints) {
      if (constraints && constraints.video !== undefined) {
        return Object.assign({}, constraints, {
          video: compactObject(constraints.video),
        });
      }

      return constraints;
    }

    function shimRTCIceServerUrls(window) {
      if (!window.RTCPeerConnection) {
        return;
      }
      // migrate from non-spec RTCIceServer.url to RTCIceServer.urls
      const OrigPeerConnection = window.RTCPeerConnection;
      window.RTCPeerConnection = function RTCPeerConnection(
        pcConfig,
        pcConstraints
      ) {
        if (pcConfig && pcConfig.iceServers) {
          const newIceServers = [];
          for (let i = 0; i < pcConfig.iceServers.length; i++) {
            let server = pcConfig.iceServers[i];
            if (
              !server.hasOwnProperty("urls") &&
              server.hasOwnProperty("url")
            ) {
              deprecated("RTCIceServer.url", "RTCIceServer.urls");
              server = JSON.parse(JSON.stringify(server));
              server.urls = server.url;
              delete server.url;
              newIceServers.push(server);
            } else {
              newIceServers.push(pcConfig.iceServers[i]);
            }
          }
          pcConfig.iceServers = newIceServers;
        }
        return new OrigPeerConnection(pcConfig, pcConstraints);
      };
      window.RTCPeerConnection.prototype = OrigPeerConnection.prototype;
      // wrap static methods. Currently just generateCertificate.
      if ("generateCertificate" in OrigPeerConnection) {
        Object.defineProperty(window.RTCPeerConnection, "generateCertificate", {
          get() {
            return OrigPeerConnection.generateCertificate;
          },
        });
      }
    }

    function shimTrackEventTransceiver(window) {
      // Add event.transceiver member over deprecated event.receiver
      if (
        typeof window === "object" &&
        window.RTCTrackEvent &&
        "receiver" in window.RTCTrackEvent.prototype &&
        !("transceiver" in window.RTCTrackEvent.prototype)
      ) {
        Object.defineProperty(window.RTCTrackEvent.prototype, "transceiver", {
          get() {
            return { receiver: this.receiver };
          },
        });
      }
    }

    function shimCreateOfferLegacy(window) {
      const origCreateOffer = window.RTCPeerConnection.prototype.createOffer;
      window.RTCPeerConnection.prototype.createOffer = function createOffer(
        offerOptions
      ) {
        if (offerOptions) {
          if (typeof offerOptions.offerToReceiveAudio !== "undefined") {
            // support bit values
            offerOptions.offerToReceiveAudio =
              !!offerOptions.offerToReceiveAudio;
          }
          const audioTransceiver = this.getTransceivers().find(
            (transceiver) => transceiver.receiver.track.kind === "audio"
          );
          if (offerOptions.offerToReceiveAudio === false && audioTransceiver) {
            if (audioTransceiver.direction === "sendrecv") {
              if (audioTransceiver.setDirection) {
                audioTransceiver.setDirection("sendonly");
              } else {
                audioTransceiver.direction = "sendonly";
              }
            } else if (audioTransceiver.direction === "recvonly") {
              if (audioTransceiver.setDirection) {
                audioTransceiver.setDirection("inactive");
              } else {
                audioTransceiver.direction = "inactive";
              }
            }
          } else if (
            offerOptions.offerToReceiveAudio === true &&
            !audioTransceiver
          ) {
            this.addTransceiver("audio", { direction: "recvonly" });
          }

          if (typeof offerOptions.offerToReceiveVideo !== "undefined") {
            // support bit values
            offerOptions.offerToReceiveVideo =
              !!offerOptions.offerToReceiveVideo;
          }
          const videoTransceiver = this.getTransceivers().find(
            (transceiver) => transceiver.receiver.track.kind === "video"
          );
          if (offerOptions.offerToReceiveVideo === false && videoTransceiver) {
            if (videoTransceiver.direction === "sendrecv") {
              if (videoTransceiver.setDirection) {
                videoTransceiver.setDirection("sendonly");
              } else {
                videoTransceiver.direction = "sendonly";
              }
            } else if (videoTransceiver.direction === "recvonly") {
              if (videoTransceiver.setDirection) {
                videoTransceiver.setDirection("inactive");
              } else {
                videoTransceiver.direction = "inactive";
              }
            }
          } else if (
            offerOptions.offerToReceiveVideo === true &&
            !videoTransceiver
          ) {
            this.addTransceiver("video", { direction: "recvonly" });
          }
        }
        return origCreateOffer.apply(this, arguments);
      };
    }

    function shimAudioContext(window) {
      if (typeof window !== "object" || window.AudioContext) {
        return;
      }
      window.AudioContext = window.webkitAudioContext;
    }

    var safariShim = /*#__PURE__*/ Object.freeze({
      __proto__: null,
      shimLocalStreamsAPI: shimLocalStreamsAPI,
      shimRemoteStreamsAPI: shimRemoteStreamsAPI,
      shimCallbacksAPI: shimCallbacksAPI,
      shimGetUserMedia: shimGetUserMedia,
      shimConstraints: shimConstraints,
      shimRTCIceServerUrls: shimRTCIceServerUrls,
      shimTrackEventTransceiver: shimTrackEventTransceiver,
      shimCreateOfferLegacy: shimCreateOfferLegacy,
      shimAudioContext: shimAudioContext,
    });

    var sdp$1 = { exports: {} };

    /* eslint-env node */

    (function (module) {
      // SDP helpers.
      const SDPUtils = {};

      // Generate an alphanumeric identifier for cname or mids.
      // TODO: use UUIDs instead? https://gist.github.com/jed/982883
      SDPUtils.generateIdentifier = function () {
        return Math.random().toString(36).substr(2, 10);
      };

      // The RTCP CNAME used by all peerconnections from the same JS.
      SDPUtils.localCName = SDPUtils.generateIdentifier();

      // Splits SDP into lines, dealing with both CRLF and LF.
      SDPUtils.splitLines = function (blob) {
        return blob
          .trim()
          .split("\n")
          .map((line) => line.trim());
      };
      // Splits SDP into sessionpart and mediasections. Ensures CRLF.
      SDPUtils.splitSections = function (blob) {
        const parts = blob.split("\nm=");
        return parts.map(
          (part, index) => (index > 0 ? "m=" + part : part).trim() + "\r\n"
        );
      };

      // Returns the session description.
      SDPUtils.getDescription = function (blob) {
        const sections = SDPUtils.splitSections(blob);
        return sections && sections[0];
      };

      // Returns the individual media sections.
      SDPUtils.getMediaSections = function (blob) {
        const sections = SDPUtils.splitSections(blob);
        sections.shift();
        return sections;
      };

      // Returns lines that start with a certain prefix.
      SDPUtils.matchPrefix = function (blob, prefix) {
        return SDPUtils.splitLines(blob).filter(
          (line) => line.indexOf(prefix) === 0
        );
      };

      // Parses an ICE candidate line. Sample input:
      // candidate:702786350 2 udp 41819902 8.8.8.8 60769 typ relay raddr 8.8.8.8
      // rport 55996"
      // Input can be prefixed with a=.
      SDPUtils.parseCandidate = function (line) {
        let parts;
        // Parse both variants.
        if (line.indexOf("a=candidate:") === 0) {
          parts = line.substring(12).split(" ");
        } else {
          parts = line.substring(10).split(" ");
        }

        const candidate = {
          foundation: parts[0],
          component: { 1: "rtp", 2: "rtcp" }[parts[1]] || parts[1],
          protocol: parts[2].toLowerCase(),
          priority: parseInt(parts[3], 10),
          ip: parts[4],
          address: parts[4], // address is an alias for ip.
          port: parseInt(parts[5], 10),
          // skip parts[6] == 'typ'
          type: parts[7],
        };

        for (let i = 8; i < parts.length; i += 2) {
          switch (parts[i]) {
            case "raddr":
              candidate.relatedAddress = parts[i + 1];
              break;
            case "rport":
              candidate.relatedPort = parseInt(parts[i + 1], 10);
              break;
            case "tcptype":
              candidate.tcpType = parts[i + 1];
              break;
            case "ufrag":
              candidate.ufrag = parts[i + 1]; // for backward compatibility.
              candidate.usernameFragment = parts[i + 1];
              break;
            default: // extension handling, in particular ufrag. Don't overwrite.
              if (candidate[parts[i]] === undefined) {
                candidate[parts[i]] = parts[i + 1];
              }
              break;
          }
        }
        return candidate;
      };

      // Translates a candidate object into SDP candidate attribute.
      // This does not include the a= prefix!
      SDPUtils.writeCandidate = function (candidate) {
        const sdp = [];
        sdp.push(candidate.foundation);

        const component = candidate.component;
        if (component === "rtp") {
          sdp.push(1);
        } else if (component === "rtcp") {
          sdp.push(2);
        } else {
          sdp.push(component);
        }
        sdp.push(candidate.protocol.toUpperCase());
        sdp.push(candidate.priority);
        sdp.push(candidate.address || candidate.ip);
        sdp.push(candidate.port);

        const type = candidate.type;
        sdp.push("typ");
        sdp.push(type);
        if (
          type !== "host" &&
          candidate.relatedAddress &&
          candidate.relatedPort
        ) {
          sdp.push("raddr");
          sdp.push(candidate.relatedAddress);
          sdp.push("rport");
          sdp.push(candidate.relatedPort);
        }
        if (candidate.tcpType && candidate.protocol.toLowerCase() === "tcp") {
          sdp.push("tcptype");
          sdp.push(candidate.tcpType);
        }
        if (candidate.usernameFragment || candidate.ufrag) {
          sdp.push("ufrag");
          sdp.push(candidate.usernameFragment || candidate.ufrag);
        }
        return "candidate:" + sdp.join(" ");
      };

      // Parses an ice-options line, returns an array of option tags.
      // Sample input:
      // a=ice-options:foo bar
      SDPUtils.parseIceOptions = function (line) {
        return line.substr(14).split(" ");
      };

      // Parses a rtpmap line, returns RTCRtpCoddecParameters. Sample input:
      // a=rtpmap:111 opus/48000/2
      SDPUtils.parseRtpMap = function (line) {
        let parts = line.substr(9).split(" ");
        const parsed = {
          payloadType: parseInt(parts.shift(), 10), // was: id
        };

        parts = parts[0].split("/");

        parsed.name = parts[0];
        parsed.clockRate = parseInt(parts[1], 10); // was: clockrate
        parsed.channels = parts.length === 3 ? parseInt(parts[2], 10) : 1;
        // legacy alias, got renamed back to channels in ORTC.
        parsed.numChannels = parsed.channels;
        return parsed;
      };

      // Generates a rtpmap line from RTCRtpCodecCapability or
      // RTCRtpCodecParameters.
      SDPUtils.writeRtpMap = function (codec) {
        let pt = codec.payloadType;
        if (codec.preferredPayloadType !== undefined) {
          pt = codec.preferredPayloadType;
        }
        const channels = codec.channels || codec.numChannels || 1;
        return (
          "a=rtpmap:" +
          pt +
          " " +
          codec.name +
          "/" +
          codec.clockRate +
          (channels !== 1 ? "/" + channels : "") +
          "\r\n"
        );
      };

      // Parses a extmap line (headerextension from RFC 5285). Sample input:
      // a=extmap:2 urn:ietf:params:rtp-hdrext:toffset
      // a=extmap:2/sendonly urn:ietf:params:rtp-hdrext:toffset
      SDPUtils.parseExtmap = function (line) {
        const parts = line.substr(9).split(" ");
        return {
          id: parseInt(parts[0], 10),
          direction:
            parts[0].indexOf("/") > 0 ? parts[0].split("/")[1] : "sendrecv",
          uri: parts[1],
        };
      };

      // Generates an extmap line from RTCRtpHeaderExtensionParameters or
      // RTCRtpHeaderExtension.
      SDPUtils.writeExtmap = function (headerExtension) {
        return (
          "a=extmap:" +
          (headerExtension.id || headerExtension.preferredId) +
          (headerExtension.direction && headerExtension.direction !== "sendrecv"
            ? "/" + headerExtension.direction
            : "") +
          " " +
          headerExtension.uri +
          "\r\n"
        );
      };

      // Parses a fmtp line, returns dictionary. Sample input:
      // a=fmtp:96 vbr=on;cng=on
      // Also deals with vbr=on; cng=on
      SDPUtils.parseFmtp = function (line) {
        const parsed = {};
        let kv;
        const parts = line.substr(line.indexOf(" ") + 1).split(";");
        for (let j = 0; j < parts.length; j++) {
          kv = parts[j].trim().split("=");
          parsed[kv[0].trim()] = kv[1];
        }
        return parsed;
      };

      // Generates a fmtp line from RTCRtpCodecCapability or RTCRtpCodecParameters.
      SDPUtils.writeFmtp = function (codec) {
        let line = "";
        let pt = codec.payloadType;
        if (codec.preferredPayloadType !== undefined) {
          pt = codec.preferredPayloadType;
        }
        if (codec.parameters && Object.keys(codec.parameters).length) {
          const params = [];
          Object.keys(codec.parameters).forEach((param) => {
            if (codec.parameters[param] !== undefined) {
              params.push(param + "=" + codec.parameters[param]);
            } else {
              params.push(param);
            }
          });
          line += "a=fmtp:" + pt + " " + params.join(";") + "\r\n";
        }
        return line;
      };

      // Parses a rtcp-fb line, returns RTCPRtcpFeedback object. Sample input:
      // a=rtcp-fb:98 nack rpsi
      SDPUtils.parseRtcpFb = function (line) {
        const parts = line.substr(line.indexOf(" ") + 1).split(" ");
        return {
          type: parts.shift(),
          parameter: parts.join(" "),
        };
      };

      // Generate a=rtcp-fb lines from RTCRtpCodecCapability or RTCRtpCodecParameters.
      SDPUtils.writeRtcpFb = function (codec) {
        let lines = "";
        let pt = codec.payloadType;
        if (codec.preferredPayloadType !== undefined) {
          pt = codec.preferredPayloadType;
        }
        if (codec.rtcpFeedback && codec.rtcpFeedback.length) {
          // FIXME: special handling for trr-int?
          codec.rtcpFeedback.forEach((fb) => {
            lines +=
              "a=rtcp-fb:" +
              pt +
              " " +
              fb.type +
              (fb.parameter && fb.parameter.length ? " " + fb.parameter : "") +
              "\r\n";
          });
        }
        return lines;
      };

      // Parses a RFC 5576 ssrc media attribute. Sample input:
      // a=ssrc:3735928559 cname:something
      SDPUtils.parseSsrcMedia = function (line) {
        const sp = line.indexOf(" ");
        const parts = {
          ssrc: parseInt(line.substr(7, sp - 7), 10),
        };
        const colon = line.indexOf(":", sp);
        if (colon > -1) {
          parts.attribute = line.substr(sp + 1, colon - sp - 1);
          parts.value = line.substr(colon + 1);
        } else {
          parts.attribute = line.substr(sp + 1);
        }
        return parts;
      };

      // Parse a ssrc-group line (see RFC 5576). Sample input:
      // a=ssrc-group:semantics 12 34
      SDPUtils.parseSsrcGroup = function (line) {
        const parts = line.substr(13).split(" ");
        return {
          semantics: parts.shift(),
          ssrcs: parts.map((ssrc) => parseInt(ssrc, 10)),
        };
      };

      // Extracts the MID (RFC 5888) from a media section.
      // Returns the MID or undefined if no mid line was found.
      SDPUtils.getMid = function (mediaSection) {
        const mid = SDPUtils.matchPrefix(mediaSection, "a=mid:")[0];
        if (mid) {
          return mid.substr(6);
        }
      };

      // Parses a fingerprint line for DTLS-SRTP.
      SDPUtils.parseFingerprint = function (line) {
        const parts = line.substr(14).split(" ");
        return {
          algorithm: parts[0].toLowerCase(), // algorithm is case-sensitive in Edge.
          value: parts[1].toUpperCase(), // the definition is upper-case in RFC 4572.
        };
      };

      // Extracts DTLS parameters from SDP media section or sessionpart.
      // FIXME: for consistency with other functions this should only
      //   get the fingerprint line as input. See also getIceParameters.
      SDPUtils.getDtlsParameters = function (mediaSection, sessionpart) {
        const lines = SDPUtils.matchPrefix(
          mediaSection + sessionpart,
          "a=fingerprint:"
        );
        // Note: a=setup line is ignored since we use the 'auto' role in Edge.
        return {
          role: "auto",
          fingerprints: lines.map(SDPUtils.parseFingerprint),
        };
      };

      // Serializes DTLS parameters to SDP.
      SDPUtils.writeDtlsParameters = function (params, setupType) {
        let sdp = "a=setup:" + setupType + "\r\n";
        params.fingerprints.forEach((fp) => {
          sdp += "a=fingerprint:" + fp.algorithm + " " + fp.value + "\r\n";
        });
        return sdp;
      };

      // Parses a=crypto lines into
      //   https://rawgit.com/aboba/edgertc/master/msortc-rs4.html#dictionary-rtcsrtpsdesparameters-members
      SDPUtils.parseCryptoLine = function (line) {
        const parts = line.substr(9).split(" ");
        return {
          tag: parseInt(parts[0], 10),
          cryptoSuite: parts[1],
          keyParams: parts[2],
          sessionParams: parts.slice(3),
        };
      };

      SDPUtils.writeCryptoLine = function (parameters) {
        return (
          "a=crypto:" +
          parameters.tag +
          " " +
          parameters.cryptoSuite +
          " " +
          (typeof parameters.keyParams === "object"
            ? SDPUtils.writeCryptoKeyParams(parameters.keyParams)
            : parameters.keyParams) +
          (parameters.sessionParams
            ? " " + parameters.sessionParams.join(" ")
            : "") +
          "\r\n"
        );
      };

      // Parses the crypto key parameters into
      //   https://rawgit.com/aboba/edgertc/master/msortc-rs4.html#rtcsrtpkeyparam*
      SDPUtils.parseCryptoKeyParams = function (keyParams) {
        if (keyParams.indexOf("inline:") !== 0) {
          return null;
        }
        const parts = keyParams.substr(7).split("|");
        return {
          keyMethod: "inline",
          keySalt: parts[0],
          lifeTime: parts[1],
          mkiValue: parts[2] ? parts[2].split(":")[0] : undefined,
          mkiLength: parts[2] ? parts[2].split(":")[1] : undefined,
        };
      };

      SDPUtils.writeCryptoKeyParams = function (keyParams) {
        return (
          keyParams.keyMethod +
          ":" +
          keyParams.keySalt +
          (keyParams.lifeTime ? "|" + keyParams.lifeTime : "") +
          (keyParams.mkiValue && keyParams.mkiLength
            ? "|" + keyParams.mkiValue + ":" + keyParams.mkiLength
            : "")
        );
      };

      // Extracts all SDES parameters.
      SDPUtils.getCryptoParameters = function (mediaSection, sessionpart) {
        const lines = SDPUtils.matchPrefix(
          mediaSection + sessionpart,
          "a=crypto:"
        );
        return lines.map(SDPUtils.parseCryptoLine);
      };

      // Parses ICE information from SDP media section or sessionpart.
      // FIXME: for consistency with other functions this should only
      //   get the ice-ufrag and ice-pwd lines as input.
      SDPUtils.getIceParameters = function (mediaSection, sessionpart) {
        const ufrag = SDPUtils.matchPrefix(
          mediaSection + sessionpart,
          "a=ice-ufrag:"
        )[0];
        const pwd = SDPUtils.matchPrefix(
          mediaSection + sessionpart,
          "a=ice-pwd:"
        )[0];
        if (!(ufrag && pwd)) {
          return null;
        }
        return {
          usernameFragment: ufrag.substr(12),
          password: pwd.substr(10),
        };
      };

      // Serializes ICE parameters to SDP.
      SDPUtils.writeIceParameters = function (params) {
        let sdp =
          "a=ice-ufrag:" +
          params.usernameFragment +
          "\r\n" +
          "a=ice-pwd:" +
          params.password +
          "\r\n";
        if (params.iceLite) {
          sdp += "a=ice-lite\r\n";
        }
        return sdp;
      };

      // Parses the SDP media section and returns RTCRtpParameters.
      SDPUtils.parseRtpParameters = function (mediaSection) {
        const description = {
          codecs: [],
          headerExtensions: [],
          fecMechanisms: [],
          rtcp: [],
        };
        const lines = SDPUtils.splitLines(mediaSection);
        const mline = lines[0].split(" ");
        for (let i = 3; i < mline.length; i++) {
          // find all codecs from mline[3..]
          const pt = mline[i];
          const rtpmapline = SDPUtils.matchPrefix(
            mediaSection,
            "a=rtpmap:" + pt + " "
          )[0];
          if (rtpmapline) {
            const codec = SDPUtils.parseRtpMap(rtpmapline);
            const fmtps = SDPUtils.matchPrefix(
              mediaSection,
              "a=fmtp:" + pt + " "
            );
            // Only the first a=fmtp:<pt> is considered.
            codec.parameters = fmtps.length ? SDPUtils.parseFmtp(fmtps[0]) : {};
            codec.rtcpFeedback = SDPUtils.matchPrefix(
              mediaSection,
              "a=rtcp-fb:" + pt + " "
            ).map(SDPUtils.parseRtcpFb);
            description.codecs.push(codec);
            // parse FEC mechanisms from rtpmap lines.
            switch (codec.name.toUpperCase()) {
              case "RED":
              case "ULPFEC":
                description.fecMechanisms.push(codec.name.toUpperCase());
                break;
            }
          }
        }
        SDPUtils.matchPrefix(mediaSection, "a=extmap:").forEach((line) => {
          description.headerExtensions.push(SDPUtils.parseExtmap(line));
        });
        // FIXME: parse rtcp.
        return description;
      };

      // Generates parts of the SDP media section describing the capabilities /
      // parameters.
      SDPUtils.writeRtpDescription = function (kind, caps) {
        let sdp = "";

        // Build the mline.
        sdp += "m=" + kind + " ";
        sdp += caps.codecs.length > 0 ? "9" : "0"; // reject if no codecs.
        sdp += " UDP/TLS/RTP/SAVPF ";
        sdp +=
          caps.codecs
            .map((codec) => {
              if (codec.preferredPayloadType !== undefined) {
                return codec.preferredPayloadType;
              }
              return codec.payloadType;
            })
            .join(" ") + "\r\n";

        sdp += "c=IN IP4 0.0.0.0\r\n";
        sdp += "a=rtcp:9 IN IP4 0.0.0.0\r\n";

        // Add a=rtpmap lines for each codec. Also fmtp and rtcp-fb.
        caps.codecs.forEach((codec) => {
          sdp += SDPUtils.writeRtpMap(codec);
          sdp += SDPUtils.writeFmtp(codec);
          sdp += SDPUtils.writeRtcpFb(codec);
        });
        let maxptime = 0;
        caps.codecs.forEach((codec) => {
          if (codec.maxptime > maxptime) {
            maxptime = codec.maxptime;
          }
        });
        if (maxptime > 0) {
          sdp += "a=maxptime:" + maxptime + "\r\n";
        }

        if (caps.headerExtensions) {
          caps.headerExtensions.forEach((extension) => {
            sdp += SDPUtils.writeExtmap(extension);
          });
        }
        // FIXME: write fecMechanisms.
        return sdp;
      };

      // Parses the SDP media section and returns an array of
      // RTCRtpEncodingParameters.
      SDPUtils.parseRtpEncodingParameters = function (mediaSection) {
        const encodingParameters = [];
        const description = SDPUtils.parseRtpParameters(mediaSection);
        const hasRed = description.fecMechanisms.indexOf("RED") !== -1;
        const hasUlpfec = description.fecMechanisms.indexOf("ULPFEC") !== -1;

        // filter a=ssrc:... cname:, ignore PlanB-msid
        const ssrcs = SDPUtils.matchPrefix(mediaSection, "a=ssrc:")
          .map((line) => SDPUtils.parseSsrcMedia(line))
          .filter((parts) => parts.attribute === "cname");
        const primarySsrc = ssrcs.length > 0 && ssrcs[0].ssrc;
        let secondarySsrc;

        const flows = SDPUtils.matchPrefix(
          mediaSection,
          "a=ssrc-group:FID"
        ).map((line) => {
          const parts = line.substr(17).split(" ");
          return parts.map((part) => parseInt(part, 10));
        });
        if (
          flows.length > 0 &&
          flows[0].length > 1 &&
          flows[0][0] === primarySsrc
        ) {
          secondarySsrc = flows[0][1];
        }

        description.codecs.forEach((codec) => {
          if (codec.name.toUpperCase() === "RTX" && codec.parameters.apt) {
            let encParam = {
              ssrc: primarySsrc,
              codecPayloadType: parseInt(codec.parameters.apt, 10),
            };
            if (primarySsrc && secondarySsrc) {
              encParam.rtx = { ssrc: secondarySsrc };
            }
            encodingParameters.push(encParam);
            if (hasRed) {
              encParam = JSON.parse(JSON.stringify(encParam));
              encParam.fec = {
                ssrc: primarySsrc,
                mechanism: hasUlpfec ? "red+ulpfec" : "red",
              };
              encodingParameters.push(encParam);
            }
          }
        });
        if (encodingParameters.length === 0 && primarySsrc) {
          encodingParameters.push({
            ssrc: primarySsrc,
          });
        }

        // we support both b=AS and b=TIAS but interpret AS as TIAS.
        let bandwidth = SDPUtils.matchPrefix(mediaSection, "b=");
        if (bandwidth.length) {
          if (bandwidth[0].indexOf("b=TIAS:") === 0) {
            bandwidth = parseInt(bandwidth[0].substr(7), 10);
          } else if (bandwidth[0].indexOf("b=AS:") === 0) {
            // use formula from JSEP to convert b=AS to TIAS value.
            bandwidth =
              parseInt(bandwidth[0].substr(5), 10) * 1000 * 0.95 - 50 * 40 * 8;
          } else {
            bandwidth = undefined;
          }
          encodingParameters.forEach((params) => {
            params.maxBitrate = bandwidth;
          });
        }
        return encodingParameters;
      };

      // parses http://draft.ortc.org/#rtcrtcpparameters*
      SDPUtils.parseRtcpParameters = function (mediaSection) {
        const rtcpParameters = {};

        // Gets the first SSRC. Note that with RTX there might be multiple
        // SSRCs.
        const remoteSsrc = SDPUtils.matchPrefix(mediaSection, "a=ssrc:")
          .map((line) => SDPUtils.parseSsrcMedia(line))
          .filter((obj) => obj.attribute === "cname")[0];
        if (remoteSsrc) {
          rtcpParameters.cname = remoteSsrc.value;
          rtcpParameters.ssrc = remoteSsrc.ssrc;
        }

        // Edge uses the compound attribute instead of reducedSize
        // compound is !reducedSize
        const rsize = SDPUtils.matchPrefix(mediaSection, "a=rtcp-rsize");
        rtcpParameters.reducedSize = rsize.length > 0;
        rtcpParameters.compound = rsize.length === 0;

        // parses the rtcp-mux attrіbute.
        // Note that Edge does not support unmuxed RTCP.
        const mux = SDPUtils.matchPrefix(mediaSection, "a=rtcp-mux");
        rtcpParameters.mux = mux.length > 0;

        return rtcpParameters;
      };

      SDPUtils.writeRtcpParameters = function (rtcpParameters) {
        let sdp = "";
        if (rtcpParameters.reducedSize) {
          sdp += "a=rtcp-rsize\r\n";
        }
        if (rtcpParameters.mux) {
          sdp += "a=rtcp-mux\r\n";
        }
        if (rtcpParameters.ssrc !== undefined && rtcpParameters.cname) {
          sdp +=
            "a=ssrc:" +
            rtcpParameters.ssrc +
            " cname:" +
            rtcpParameters.cname +
            "\r\n";
        }
        return sdp;
      };

      // parses either a=msid: or a=ssrc:... msid lines and returns
      // the id of the MediaStream and MediaStreamTrack.
      SDPUtils.parseMsid = function (mediaSection) {
        let parts;
        const spec = SDPUtils.matchPrefix(mediaSection, "a=msid:");
        if (spec.length === 1) {
          parts = spec[0].substr(7).split(" ");
          return { stream: parts[0], track: parts[1] };
        }
        const planB = SDPUtils.matchPrefix(mediaSection, "a=ssrc:")
          .map((line) => SDPUtils.parseSsrcMedia(line))
          .filter((msidParts) => msidParts.attribute === "msid");
        if (planB.length > 0) {
          parts = planB[0].value.split(" ");
          return { stream: parts[0], track: parts[1] };
        }
      };

      // SCTP
      // parses draft-ietf-mmusic-sctp-sdp-26 first and falls back
      // to draft-ietf-mmusic-sctp-sdp-05
      SDPUtils.parseSctpDescription = function (mediaSection) {
        const mline = SDPUtils.parseMLine(mediaSection);
        const maxSizeLine = SDPUtils.matchPrefix(
          mediaSection,
          "a=max-message-size:"
        );
        let maxMessageSize;
        if (maxSizeLine.length > 0) {
          maxMessageSize = parseInt(maxSizeLine[0].substr(19), 10);
        }
        if (isNaN(maxMessageSize)) {
          maxMessageSize = 65536;
        }
        const sctpPort = SDPUtils.matchPrefix(mediaSection, "a=sctp-port:");
        if (sctpPort.length > 0) {
          return {
            port: parseInt(sctpPort[0].substr(12), 10),
            protocol: mline.fmt,
            maxMessageSize,
          };
        }
        const sctpMapLines = SDPUtils.matchPrefix(mediaSection, "a=sctpmap:");
        if (sctpMapLines.length > 0) {
          const parts = sctpMapLines[0].substr(10).split(" ");
          return {
            port: parseInt(parts[0], 10),
            protocol: parts[1],
            maxMessageSize,
          };
        }
      };

      // SCTP
      // outputs the draft-ietf-mmusic-sctp-sdp-26 version that all browsers
      // support by now receiving in this format, unless we originally parsed
      // as the draft-ietf-mmusic-sctp-sdp-05 format (indicated by the m-line
      // protocol of DTLS/SCTP -- without UDP/ or TCP/)
      SDPUtils.writeSctpDescription = function (media, sctp) {
        let output = [];
        if (media.protocol !== "DTLS/SCTP") {
          output = [
            "m=" +
              media.kind +
              " 9 " +
              media.protocol +
              " " +
              sctp.protocol +
              "\r\n",
            "c=IN IP4 0.0.0.0\r\n",
            "a=sctp-port:" + sctp.port + "\r\n",
          ];
        } else {
          output = [
            "m=" +
              media.kind +
              " 9 " +
              media.protocol +
              " " +
              sctp.port +
              "\r\n",
            "c=IN IP4 0.0.0.0\r\n",
            "a=sctpmap:" + sctp.port + " " + sctp.protocol + " 65535\r\n",
          ];
        }
        if (sctp.maxMessageSize !== undefined) {
          output.push("a=max-message-size:" + sctp.maxMessageSize + "\r\n");
        }
        return output.join("");
      };

      // Generate a session ID for SDP.
      // https://tools.ietf.org/html/draft-ietf-rtcweb-jsep-20#section-5.2.1
      // recommends using a cryptographically random +ve 64-bit value
      // but right now this should be acceptable and within the right range
      SDPUtils.generateSessionId = function () {
        return Math.random().toString().substr(2, 21);
      };

      // Write boiler plate for start of SDP
      // sessId argument is optional - if not supplied it will
      // be generated randomly
      // sessVersion is optional and defaults to 2
      // sessUser is optional and defaults to 'thisisadapterortc'
      SDPUtils.writeSessionBoilerplate = function (sessId, sessVer, sessUser) {
        let sessionId;
        const version = sessVer !== undefined ? sessVer : 2;
        if (sessId) {
          sessionId = sessId;
        } else {
          sessionId = SDPUtils.generateSessionId();
        }
        const user = sessUser || "thisisadapterortc";
        // FIXME: sess-id should be an NTP timestamp.
        return (
          "v=0\r\n" +
          "o=" +
          user +
          " " +
          sessionId +
          " " +
          version +
          " IN IP4 127.0.0.1\r\n" +
          "s=-\r\n" +
          "t=0 0\r\n"
        );
      };

      // Gets the direction from the mediaSection or the sessionpart.
      SDPUtils.getDirection = function (mediaSection, sessionpart) {
        // Look for sendrecv, sendonly, recvonly, inactive, default to sendrecv.
        const lines = SDPUtils.splitLines(mediaSection);
        for (let i = 0; i < lines.length; i++) {
          switch (lines[i]) {
            case "a=sendrecv":
            case "a=sendonly":
            case "a=recvonly":
            case "a=inactive":
              return lines[i].substr(2);
            // FIXME: What should happen here?
          }
        }
        if (sessionpart) {
          return SDPUtils.getDirection(sessionpart);
        }
        return "sendrecv";
      };

      SDPUtils.getKind = function (mediaSection) {
        const lines = SDPUtils.splitLines(mediaSection);
        const mline = lines[0].split(" ");
        return mline[0].substr(2);
      };

      SDPUtils.isRejected = function (mediaSection) {
        return mediaSection.split(" ", 2)[1] === "0";
      };

      SDPUtils.parseMLine = function (mediaSection) {
        const lines = SDPUtils.splitLines(mediaSection);
        const parts = lines[0].substr(2).split(" ");
        return {
          kind: parts[0],
          port: parseInt(parts[1], 10),
          protocol: parts[2],
          fmt: parts.slice(3).join(" "),
        };
      };

      SDPUtils.parseOLine = function (mediaSection) {
        const line = SDPUtils.matchPrefix(mediaSection, "o=")[0];
        const parts = line.substr(2).split(" ");
        return {
          username: parts[0],
          sessionId: parts[1],
          sessionVersion: parseInt(parts[2], 10),
          netType: parts[3],
          addressType: parts[4],
          address: parts[5],
        };
      };

      // a very naive interpretation of a valid SDP.
      SDPUtils.isValidSDP = function (blob) {
        if (typeof blob !== "string" || blob.length === 0) {
          return false;
        }
        const lines = SDPUtils.splitLines(blob);
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].length < 2 || lines[i].charAt(1) !== "=") {
            return false;
          }
          // TODO: check the modifier a bit more.
        }
        return true;
      };

      // Expose public methods.
      {
        module.exports = SDPUtils;
      }
    })(sdp$1);

    var SDPUtils = sdp$1.exports;

    var sdp = /*#__PURE__*/ _mergeNamespaces(
      {
        __proto__: null,
        default: SDPUtils,
      },
      [sdp$1.exports]
    );

    /*
     *  Copyright (c) 2017 The WebRTC project authors. All Rights Reserved.
     *
     *  Use of this source code is governed by a BSD-style license
     *  that can be found in the LICENSE file in the root of the source
     *  tree.
     */

    function shimRTCIceCandidate(window) {
      // foundation is arbitrarily chosen as an indicator for full support for
      // https://w3c.github.io/webrtc-pc/#rtcicecandidate-interface
      if (
        !window.RTCIceCandidate ||
        (window.RTCIceCandidate &&
          "foundation" in window.RTCIceCandidate.prototype)
      ) {
        return;
      }

      const NativeRTCIceCandidate = window.RTCIceCandidate;
      window.RTCIceCandidate = function RTCIceCandidate(args) {
        // Remove the a= which shouldn't be part of the candidate string.
        if (
          typeof args === "object" &&
          args.candidate &&
          args.candidate.indexOf("a=") === 0
        ) {
          args = JSON.parse(JSON.stringify(args));
          args.candidate = args.candidate.substr(2);
        }

        if (args.candidate && args.candidate.length) {
          // Augment the native candidate with the parsed fields.
          const nativeCandidate = new NativeRTCIceCandidate(args);
          const parsedCandidate = SDPUtils.parseCandidate(args.candidate);
          const augmentedCandidate = Object.assign(
            nativeCandidate,
            parsedCandidate
          );

          // Add a serializer that does not serialize the extra attributes.
          augmentedCandidate.toJSON = function toJSON() {
            return {
              candidate: augmentedCandidate.candidate,
              sdpMid: augmentedCandidate.sdpMid,
              sdpMLineIndex: augmentedCandidate.sdpMLineIndex,
              usernameFragment: augmentedCandidate.usernameFragment,
            };
          };
          return augmentedCandidate;
        }
        return new NativeRTCIceCandidate(args);
      };
      window.RTCIceCandidate.prototype = NativeRTCIceCandidate.prototype;

      // Hook up the augmented candidate in onicecandidate and
      // addEventListener('icecandidate', ...)
      wrapPeerConnectionEvent(window, "icecandidate", (e) => {
        if (e.candidate) {
          Object.defineProperty(e, "candidate", {
            value: new window.RTCIceCandidate(e.candidate),
            writable: "false",
          });
        }
        return e;
      });
    }

    function shimRTCIceCandidateRelayProtocol(window) {
      if (
        !window.RTCIceCandidate ||
        (window.RTCIceCandidate &&
          "relayProtocol" in window.RTCIceCandidate.prototype)
      ) {
        return;
      }

      // Hook up the augmented candidate in onicecandidate and
      // addEventListener('icecandidate', ...)
      wrapPeerConnectionEvent(window, "icecandidate", (e) => {
        if (e.candidate) {
          const parsedCandidate = SDPUtils.parseCandidate(
            e.candidate.candidate
          );
          if (parsedCandidate.type === "relay") {
            // This is a libwebrtc-specific mapping of local type preference
            // to relayProtocol.
            e.candidate.relayProtocol = {
              0: "tls",
              1: "tcp",
              2: "udp",
            }[parsedCandidate.priority >> 24];
          }
        }
        return e;
      });
    }

    function shimMaxMessageSize(window, browserDetails) {
      if (!window.RTCPeerConnection) {
        return;
      }

      if (!("sctp" in window.RTCPeerConnection.prototype)) {
        Object.defineProperty(window.RTCPeerConnection.prototype, "sctp", {
          get() {
            return typeof this._sctp === "undefined" ? null : this._sctp;
          },
        });
      }

      const sctpInDescription = function (description) {
        if (!description || !description.sdp) {
          return false;
        }
        const sections = SDPUtils.splitSections(description.sdp);
        sections.shift();
        return sections.some((mediaSection) => {
          const mLine = SDPUtils.parseMLine(mediaSection);
          return (
            mLine &&
            mLine.kind === "application" &&
            mLine.protocol.indexOf("SCTP") !== -1
          );
        });
      };

      const getRemoteFirefoxVersion = function (description) {
        // TODO: Is there a better solution for detecting Firefox?
        const match = description.sdp.match(/mozilla...THIS_IS_SDPARTA-(\d+)/);
        if (match === null || match.length < 2) {
          return -1;
        }
        const version = parseInt(match[1], 10);
        // Test for NaN (yes, this is ugly)
        return version !== version ? -1 : version;
      };

      const getCanSendMaxMessageSize = function (remoteIsFirefox) {
        // Every implementation we know can send at least 64 KiB.
        // Note: Although Chrome is technically able to send up to 256 KiB, the
        //       data does not reach the other peer reliably.
        //       See: https://bugs.chromium.org/p/webrtc/issues/detail?id=8419
        let canSendMaxMessageSize = 65536;
        if (browserDetails.browser === "firefox") {
          if (browserDetails.version < 57) {
            if (remoteIsFirefox === -1) {
              // FF < 57 will send in 16 KiB chunks using the deprecated PPID
              // fragmentation.
              canSendMaxMessageSize = 16384;
            } else {
              // However, other FF (and RAWRTC) can reassemble PPID-fragmented
              // messages. Thus, supporting ~2 GiB when sending.
              canSendMaxMessageSize = 2147483637;
            }
          } else if (browserDetails.version < 60) {
            // Currently, all FF >= 57 will reset the remote maximum message size
            // to the default value when a data channel is created at a later
            // stage. :(
            // See: https://bugzilla.mozilla.org/show_bug.cgi?id=1426831
            canSendMaxMessageSize =
              browserDetails.version === 57 ? 65535 : 65536;
          } else {
            // FF >= 60 supports sending ~2 GiB
            canSendMaxMessageSize = 2147483637;
          }
        }
        return canSendMaxMessageSize;
      };

      const getMaxMessageSize = function (description, remoteIsFirefox) {
        // Note: 65536 bytes is the default value from the SDP spec. Also,
        //       every implementation we know supports receiving 65536 bytes.
        let maxMessageSize = 65536;

        // FF 57 has a slightly incorrect default remote max message size, so
        // we need to adjust it here to avoid a failure when sending.
        // See: https://bugzilla.mozilla.org/show_bug.cgi?id=1425697
        if (
          browserDetails.browser === "firefox" &&
          browserDetails.version === 57
        ) {
          maxMessageSize = 65535;
        }

        const match = SDPUtils.matchPrefix(
          description.sdp,
          "a=max-message-size:"
        );
        if (match.length > 0) {
          maxMessageSize = parseInt(match[0].substr(19), 10);
        } else if (
          browserDetails.browser === "firefox" &&
          remoteIsFirefox !== -1
        ) {
          // If the maximum message size is not present in the remote SDP and
          // both local and remote are Firefox, the remote peer can receive
          // ~2 GiB.
          maxMessageSize = 2147483637;
        }
        return maxMessageSize;
      };

      const origSetRemoteDescription =
        window.RTCPeerConnection.prototype.setRemoteDescription;
      window.RTCPeerConnection.prototype.setRemoteDescription =
        function setRemoteDescription() {
          this._sctp = null;
          // Chrome decided to not expose .sctp in plan-b mode.
          // As usual, adapter.js has to do an 'ugly worakaround'
          // to cover up the mess.
          if (
            browserDetails.browser === "chrome" &&
            browserDetails.version >= 76
          ) {
            const { sdpSemantics } = this.getConfiguration();
            if (sdpSemantics === "plan-b") {
              Object.defineProperty(this, "sctp", {
                get() {
                  return typeof this._sctp === "undefined" ? null : this._sctp;
                },
                enumerable: true,
                configurable: true,
              });
            }
          }

          if (sctpInDescription(arguments[0])) {
            // Check if the remote is FF.
            const isFirefox = getRemoteFirefoxVersion(arguments[0]);

            // Get the maximum message size the local peer is capable of sending
            const canSendMMS = getCanSendMaxMessageSize(isFirefox);

            // Get the maximum message size of the remote peer.
            const remoteMMS = getMaxMessageSize(arguments[0], isFirefox);

            // Determine final maximum message size
            let maxMessageSize;
            if (canSendMMS === 0 && remoteMMS === 0) {
              maxMessageSize = Number.POSITIVE_INFINITY;
            } else if (canSendMMS === 0 || remoteMMS === 0) {
              maxMessageSize = Math.max(canSendMMS, remoteMMS);
            } else {
              maxMessageSize = Math.min(canSendMMS, remoteMMS);
            }

            // Create a dummy RTCSctpTransport object and the 'maxMessageSize'
            // attribute.
            const sctp = {};
            Object.defineProperty(sctp, "maxMessageSize", {
              get() {
                return maxMessageSize;
              },
            });
            this._sctp = sctp;
          }

          return origSetRemoteDescription.apply(this, arguments);
        };
    }

    function shimSendThrowTypeError(window) {
      if (
        !(
          window.RTCPeerConnection &&
          "createDataChannel" in window.RTCPeerConnection.prototype
        )
      ) {
        return;
      }

      // Note: Although Firefox >= 57 has a native implementation, the maximum
      //       message size can be reset for all data channels at a later stage.
      //       See: https://bugzilla.mozilla.org/show_bug.cgi?id=1426831

      function wrapDcSend(dc, pc) {
        const origDataChannelSend = dc.send;
        dc.send = function send() {
          const data = arguments[0];
          const length = data.length || data.size || data.byteLength;
          if (
            dc.readyState === "open" &&
            pc.sctp &&
            length > pc.sctp.maxMessageSize
          ) {
            throw new TypeError(
              "Message too large (can send a maximum of " +
                pc.sctp.maxMessageSize +
                " bytes)"
            );
          }
          return origDataChannelSend.apply(dc, arguments);
        };
      }
      const origCreateDataChannel =
        window.RTCPeerConnection.prototype.createDataChannel;
      window.RTCPeerConnection.prototype.createDataChannel =
        function createDataChannel() {
          const dataChannel = origCreateDataChannel.apply(this, arguments);
          wrapDcSend(dataChannel, this);
          return dataChannel;
        };
      wrapPeerConnectionEvent(window, "datachannel", (e) => {
        wrapDcSend(e.channel, e.target);
        return e;
      });
    }

    /* shims RTCConnectionState by pretending it is the same as iceConnectionState.
     * See https://bugs.chromium.org/p/webrtc/issues/detail?id=6145#c12
     * for why this is a valid hack in Chrome. In Firefox it is slightly incorrect
     * since DTLS failures would be hidden. See
     * https://bugzilla.mozilla.org/show_bug.cgi?id=1265827
     * for the Firefox tracking bug.
     */
    function shimConnectionState(window) {
      if (
        !window.RTCPeerConnection ||
        "connectionState" in window.RTCPeerConnection.prototype
      ) {
        return;
      }
      const proto = window.RTCPeerConnection.prototype;
      Object.defineProperty(proto, "connectionState", {
        get() {
          return (
            {
              completed: "connected",
              checking: "connecting",
            }[this.iceConnectionState] || this.iceConnectionState
          );
        },
        enumerable: true,
        configurable: true,
      });
      Object.defineProperty(proto, "onconnectionstatechange", {
        get() {
          return this._onconnectionstatechange || null;
        },
        set(cb) {
          if (this._onconnectionstatechange) {
            this.removeEventListener(
              "connectionstatechange",
              this._onconnectionstatechange
            );
            delete this._onconnectionstatechange;
          }
          if (cb) {
            this.addEventListener(
              "connectionstatechange",
              (this._onconnectionstatechange = cb)
            );
          }
        },
        enumerable: true,
        configurable: true,
      });

      ["setLocalDescription", "setRemoteDescription"].forEach((method) => {
        const origMethod = proto[method];
        proto[method] = function () {
          if (!this._connectionstatechangepoly) {
            this._connectionstatechangepoly = (e) => {
              const pc = e.target;
              if (pc._lastConnectionState !== pc.connectionState) {
                pc._lastConnectionState = pc.connectionState;
                const newEvent = new Event("connectionstatechange", e);
                pc.dispatchEvent(newEvent);
              }
              return e;
            };
            this.addEventListener(
              "iceconnectionstatechange",
              this._connectionstatechangepoly
            );
          }
          return origMethod.apply(this, arguments);
        };
      });
    }

    function removeExtmapAllowMixed(window, browserDetails) {
      /* remove a=extmap-allow-mixed for webrtc.org < M71 */
      if (!window.RTCPeerConnection) {
        return;
      }
      if (browserDetails.browser === "chrome" && browserDetails.version >= 71) {
        return;
      }
      if (
        browserDetails.browser === "safari" &&
        browserDetails.version >= 605
      ) {
        return;
      }
      const nativeSRD = window.RTCPeerConnection.prototype.setRemoteDescription;
      window.RTCPeerConnection.prototype.setRemoteDescription =
        function setRemoteDescription(desc) {
          if (
            desc &&
            desc.sdp &&
            desc.sdp.indexOf("\na=extmap-allow-mixed") !== -1
          ) {
            const sdp = desc.sdp
              .split("\n")
              .filter((line) => {
                return line.trim() !== "a=extmap-allow-mixed";
              })
              .join("\n");
            // Safari enforces read-only-ness of RTCSessionDescription fields.
            if (
              window.RTCSessionDescription &&
              desc instanceof window.RTCSessionDescription
            ) {
              arguments[0] = new window.RTCSessionDescription({
                type: desc.type,
                sdp,
              });
            } else {
              desc.sdp = sdp;
            }
          }
          return nativeSRD.apply(this, arguments);
        };
    }

    function shimAddIceCandidateNullOrEmpty(window, browserDetails) {
      // Support for addIceCandidate(null or undefined)
      // as well as addIceCandidate({candidate: "", ...})
      // https://bugs.chromium.org/p/chromium/issues/detail?id=978582
      // Note: must be called before other polyfills which change the signature.
      if (!(window.RTCPeerConnection && window.RTCPeerConnection.prototype)) {
        return;
      }
      const nativeAddIceCandidate =
        window.RTCPeerConnection.prototype.addIceCandidate;
      if (!nativeAddIceCandidate || nativeAddIceCandidate.length === 0) {
        return;
      }
      window.RTCPeerConnection.prototype.addIceCandidate =
        function addIceCandidate() {
          if (!arguments[0]) {
            if (arguments[1]) {
              arguments[1].apply(null);
            }
            return Promise.resolve();
          }
          // Firefox 68+ emits and processes {candidate: "", ...}, ignore
          // in older versions.
          // Native support for ignoring exists for Chrome M77+.
          // Safari ignores as well, exact version unknown but works in the same
          // version that also ignores addIceCandidate(null).
          if (
            ((browserDetails.browser === "chrome" &&
              browserDetails.version < 78) ||
              (browserDetails.browser === "firefox" &&
                browserDetails.version < 68) ||
              browserDetails.browser === "safari") &&
            arguments[0] &&
            arguments[0].candidate === ""
          ) {
            return Promise.resolve();
          }
          return nativeAddIceCandidate.apply(this, arguments);
        };
    }

    // Note: Make sure to call this ahead of APIs that modify
    // setLocalDescription.length
    function shimParameterlessSetLocalDescription(window, browserDetails) {
      if (!(window.RTCPeerConnection && window.RTCPeerConnection.prototype)) {
        return;
      }
      const nativeSetLocalDescription =
        window.RTCPeerConnection.prototype.setLocalDescription;
      if (
        !nativeSetLocalDescription ||
        nativeSetLocalDescription.length === 0
      ) {
        return;
      }
      window.RTCPeerConnection.prototype.setLocalDescription =
        function setLocalDescription() {
          let desc = arguments[0] || {};
          if (typeof desc !== "object" || (desc.type && desc.sdp)) {
            return nativeSetLocalDescription.apply(this, arguments);
          }
          // The remaining steps should technically happen when SLD comes off the
          // RTCPeerConnection's operations chain (not ahead of going on it), but
          // this is too difficult to shim. Instead, this shim only covers the
          // common case where the operations chain is empty. This is imperfect, but
          // should cover many cases. Rationale: Even if we can't reduce the glare
          // window to zero on imperfect implementations, there's value in tapping
          // into the perfect negotiation pattern that several browsers support.
          desc = { type: desc.type, sdp: desc.sdp };
          if (!desc.type) {
            switch (this.signalingState) {
              case "stable":
              case "have-local-offer":
              case "have-remote-pranswer":
                desc.type = "offer";
                break;
              default:
                desc.type = "answer";
                break;
            }
          }
          if (desc.sdp || (desc.type !== "offer" && desc.type !== "answer")) {
            return nativeSetLocalDescription.apply(this, [desc]);
          }
          const func =
            desc.type === "offer" ? this.createOffer : this.createAnswer;
          return func
            .apply(this)
            .then((d) => nativeSetLocalDescription.apply(this, [d]));
        };
    }

    var commonShim = /*#__PURE__*/ Object.freeze({
      __proto__: null,
      shimRTCIceCandidate: shimRTCIceCandidate,
      shimRTCIceCandidateRelayProtocol: shimRTCIceCandidateRelayProtocol,
      shimMaxMessageSize: shimMaxMessageSize,
      shimSendThrowTypeError: shimSendThrowTypeError,
      shimConnectionState: shimConnectionState,
      removeExtmapAllowMixed: removeExtmapAllowMixed,
      shimAddIceCandidateNullOrEmpty: shimAddIceCandidateNullOrEmpty,
      shimParameterlessSetLocalDescription:
        shimParameterlessSetLocalDescription,
    });

    /*
     *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
     *
     *  Use of this source code is governed by a BSD-style license
     *  that can be found in the LICENSE file in the root of the source
     *  tree.
     */

    // Shimming starts here.
    function adapterFactory(
      { window } = {},
      options = {
        shimChrome: true,
        shimFirefox: true,
        shimSafari: true,
      }
    ) {
      // Utils.
      const logging = log;
      const browserDetails = detectBrowser(window);

      const adapter = {
        browserDetails,
        commonShim,
        extractVersion: extractVersion,
        disableLog: disableLog,
        disableWarnings: disableWarnings,
        // Expose sdp as a convenience. For production apps include directly.
        sdp,
      };

      // Shim browser if found.
      switch (browserDetails.browser) {
        case "chrome":
          if (!chromeShim || !shimPeerConnection$1 || !options.shimChrome) {
            logging("Chrome shim is not included in this adapter release.");
            return adapter;
          }
          if (browserDetails.version === null) {
            logging("Chrome shim can not determine version, not shimming.");
            return adapter;
          }
          logging("adapter.js shimming chrome.");
          // Export to the adapter global object visible in the browser.
          adapter.browserShim = chromeShim;

          // Must be called before shimPeerConnection.
          shimAddIceCandidateNullOrEmpty(window, browserDetails);
          shimParameterlessSetLocalDescription(window);

          shimGetUserMedia$2(window, browserDetails);
          shimMediaStream(window);
          shimPeerConnection$1(window, browserDetails);
          shimOnTrack$1(window);
          shimAddTrackRemoveTrack(window, browserDetails);
          shimGetSendersWithDtmf(window);
          shimGetStats(window);
          shimSenderReceiverGetStats(window);
          fixNegotiationNeeded(window, browserDetails);

          shimRTCIceCandidate(window);
          shimRTCIceCandidateRelayProtocol(window);
          shimConnectionState(window);
          shimMaxMessageSize(window, browserDetails);
          shimSendThrowTypeError(window);
          removeExtmapAllowMixed(window, browserDetails);
          break;
        case "firefox":
          if (!firefoxShim || !shimPeerConnection || !options.shimFirefox) {
            logging("Firefox shim is not included in this adapter release.");
            return adapter;
          }
          logging("adapter.js shimming firefox.");
          // Export to the adapter global object visible in the browser.
          adapter.browserShim = firefoxShim;

          // Must be called before shimPeerConnection.
          shimAddIceCandidateNullOrEmpty(window, browserDetails);
          shimParameterlessSetLocalDescription(window);

          shimGetUserMedia$1(window, browserDetails);
          shimPeerConnection(window, browserDetails);
          shimOnTrack(window);
          shimRemoveStream(window);
          shimSenderGetStats(window);
          shimReceiverGetStats(window);
          shimRTCDataChannel(window);
          shimAddTransceiver(window);
          shimGetParameters(window);
          shimCreateOffer(window);
          shimCreateAnswer(window);

          shimRTCIceCandidate(window);
          shimConnectionState(window);
          shimMaxMessageSize(window, browserDetails);
          shimSendThrowTypeError(window);
          break;
        case "safari":
          if (!safariShim || !options.shimSafari) {
            logging("Safari shim is not included in this adapter release.");
            return adapter;
          }
          logging("adapter.js shimming safari.");
          // Export to the adapter global object visible in the browser.
          adapter.browserShim = safariShim;

          // Must be called before shimCallbackAPI.
          shimAddIceCandidateNullOrEmpty(window, browserDetails);
          shimParameterlessSetLocalDescription(window);

          shimRTCIceServerUrls(window);
          shimCreateOfferLegacy(window);
          shimCallbacksAPI(window);
          shimLocalStreamsAPI(window);
          shimRemoteStreamsAPI(window);
          shimTrackEventTransceiver(window);
          shimGetUserMedia(window);
          shimAudioContext(window);

          shimRTCIceCandidate(window);
          shimRTCIceCandidateRelayProtocol(window);
          shimMaxMessageSize(window, browserDetails);
          shimSendThrowTypeError(window);
          removeExtmapAllowMixed(window, browserDetails);
          break;
        default:
          logging("Unsupported browser!");
          break;
      }

      return adapter;
    }

    /*
     *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
     *
     *  Use of this source code is governed by a BSD-style license
     *  that can be found in the LICENSE file in the root of the source
     *  tree.
     */

    adapterFactory({
      window: typeof window === "undefined" ? undefined : window,
    });

    const AgoraRTCInternals = {
      start: createWebUIEvents,
      statsUpdateInterval: 1000,
    };

    let ws;
    // create listeners for all the updates that get sent from RTCPeerConnection.
    function createWebUIEvents(url) {
      ws = new WebSocket(url);
      let id = Math.random().toString(16);
      const origPeerConnection = window.RTCPeerConnection;
      if (!origPeerConnection) {
        throw new Error("cannot find RTCPeerConnection in window");
      }

      // Rewrite RTCPeerConnection
      window.RTCPeerConnection = function () {
        const pc = new origPeerConnection(...arguments);
        console.error("pc", id);
        pc._id = Math.random().toString(16);
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
          trace("ondatachannel", pc._id, [
            event.channel.id,
            event.channel.label,
          ]);
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
            } else if (
              arguments.length === 3 &&
              typeof arguments[2] === "object"
            ) {
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

      [
        "setLocalDescription",
        "setRemoteDescription",
        "addIceCandidate",
      ].forEach(function (method) {
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
      });

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

    return AgoraRTCInternals;
  });

  const userInput = prompt("请输入您的websocket地址：");
  if (userInput !== null) {
    AgoraRTCInternals.start(userInput);
  } else {
    // 用户点击了取消按钮或者弹窗被关闭
    alert("您取消了操作或者没有输入数据。");
  }
})();
