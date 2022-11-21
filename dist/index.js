(function (factory) {
  typeof define === 'function' && define.amd ? define(factory) :
  factory();
})((function () { 'use strict';

  function _mergeNamespaces(n, m) {
    m.forEach(function (e) {
      e && typeof e !== 'string' && !Array.isArray(e) && Object.keys(e).forEach(function (k) {
        if (k !== 'default' && !(k in n)) {
          var d = Object.getOwnPropertyDescriptor(e, k);
          Object.defineProperty(n, k, d.get ? d : {
            enumerable: true,
            get: function () { return e[k]; }
          });
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
    proto.addEventListener = function(nativeEventName, cb) {
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
      return nativeAddEventListener.apply(this, [nativeEventName,
        wrappedCallback]);
    };

    const nativeRemoveEventListener = proto.removeEventListener;
    proto.removeEventListener = function(nativeEventName, cb) {
      if (nativeEventName !== eventNameToWrap || !this._eventMap
          || !this._eventMap[eventNameToWrap]) {
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
      return nativeRemoveEventListener.apply(this, [nativeEventName,
        unwrappedCb]);
    };

    Object.defineProperty(proto, 'on' + eventNameToWrap, {
      get() {
        return this['_on' + eventNameToWrap];
      },
      set(cb) {
        if (this['_on' + eventNameToWrap]) {
          this.removeEventListener(eventNameToWrap,
              this['_on' + eventNameToWrap]);
          delete this['_on' + eventNameToWrap];
        }
        if (cb) {
          this.addEventListener(eventNameToWrap,
              this['_on' + eventNameToWrap] = cb);
        }
      },
      enumerable: true,
      configurable: true
    });
  }

  function disableLog(bool) {
    if (typeof bool !== 'boolean') {
      return new Error('Argument type: ' + typeof bool +
          '. Please use a boolean.');
    }
    logDisabled_ = bool;
    return (bool) ? 'adapter.js logging disabled' :
        'adapter.js logging enabled';
  }

  /**
   * Disable or enable deprecation warnings
   * @param {!boolean} bool set to true to disable warnings.
   */
  function disableWarnings(bool) {
    if (typeof bool !== 'boolean') {
      return new Error('Argument type: ' + typeof bool +
          '. Please use a boolean.');
    }
    deprecationWarnings_ = !bool;
    return 'adapter.js deprecation warnings ' + (bool ? 'disabled' : 'enabled');
  }

  function log() {
    if (typeof window === 'object') {
      if (logDisabled_) {
        return;
      }
      if (typeof console !== 'undefined' && typeof console.log === 'function') {
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
    console.warn(oldMethod + ' is deprecated, please use ' + newMethod +
        ' instead.');
  }

  /**
   * Browser detector.
   *
   * @return {object} result containing browser and version
   *     properties.
   */
  function detectBrowser(window) {
    // Returned result object.
    const result = {browser: null, version: null};

    // Fail early if it's not a browser
    if (typeof window === 'undefined' || !window.navigator) {
      result.browser = 'Not a browser.';
      return result;
    }

    const {navigator} = window;

    if (navigator.mozGetUserMedia) { // Firefox.
      result.browser = 'firefox';
      result.version = extractVersion(navigator.userAgent,
          /Firefox\/(\d+)\./, 1);
    } else if (navigator.webkitGetUserMedia ||
        (window.isSecureContext === false && window.webkitRTCPeerConnection)) {
      // Chrome, Chromium, Webview, Opera.
      // Version matches Chrome/WebRTC version.
      // Chrome 74 removed webkitGetUserMedia on http as well so we need the
      // more complicated fallback to webkitRTCPeerConnection.
      result.browser = 'chrome';
      result.version = extractVersion(navigator.userAgent,
          /Chrom(e|ium)\/(\d+)\./, 2);
    } else if (window.RTCPeerConnection &&
        navigator.userAgent.match(/AppleWebKit\/(\d+)\./)) { // Safari.
      result.browser = 'safari';
      result.version = extractVersion(navigator.userAgent,
          /AppleWebKit\/(\d+)\./, 1);
      result.supportsUnifiedPlan = window.RTCRtpTransceiver &&
          'currentDirection' in window.RTCRtpTransceiver.prototype;
    } else { // Default fallthrough: not supported.
      result.browser = 'Not a supported browser.';
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
    return Object.prototype.toString.call(val) === '[object Object]';
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

    return Object.keys(data).reduce(function(accumulator, key) {
      const isObj = isObject(data[key]);
      const value = isObj ? compactObject(data[key]) : data[key];
      const isEmptyObject = isObj && !Object.keys(value).length;
      if (value === undefined || isEmptyObject) {
        return accumulator;
      }
      return Object.assign(accumulator, {[key]: value});
    }, {});
  }

  /* iterates the stats graph recursively. */
  function walkStats(stats, base, resultSet) {
    if (!base || resultSet.has(base.id)) {
      return;
    }
    resultSet.set(base.id, base);
    Object.keys(base).forEach(name => {
      if (name.endsWith('Id')) {
        walkStats(stats, stats.get(base[name]), resultSet);
      } else if (name.endsWith('Ids')) {
        base[name].forEach(id => {
          walkStats(stats, stats.get(id), resultSet);
        });
      }
    });
  }

  /* filter getStats for a sender/receiver track. */
  function filterStats(result, track, outbound) {
    const streamStatsType = outbound ? 'outbound-rtp' : 'inbound-rtp';
    const filteredResult = new Map();
    if (track === null) {
      return filteredResult;
    }
    const trackStats = [];
    result.forEach(value => {
      if (value.type === 'track' &&
          value.trackIdentifier === track.id) {
        trackStats.push(value);
      }
    });
    trackStats.forEach(trackStat => {
      result.forEach(stats => {
        if (stats.type === streamStatsType && stats.trackId === trackStat.id) {
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

    const constraintsToChrome_ = function(c) {
      if (typeof c !== 'object' || c.mandatory || c.optional) {
        return c;
      }
      const cc = {};
      Object.keys(c).forEach(key => {
        if (key === 'require' || key === 'advanced' || key === 'mediaSource') {
          return;
        }
        const r = (typeof c[key] === 'object') ? c[key] : {ideal: c[key]};
        if (r.exact !== undefined && typeof r.exact === 'number') {
          r.min = r.max = r.exact;
        }
        const oldname_ = function(prefix, name) {
          if (prefix) {
            return prefix + name.charAt(0).toUpperCase() + name.slice(1);
          }
          return (name === 'deviceId') ? 'sourceId' : name;
        };
        if (r.ideal !== undefined) {
          cc.optional = cc.optional || [];
          let oc = {};
          if (typeof r.ideal === 'number') {
            oc[oldname_('min', key)] = r.ideal;
            cc.optional.push(oc);
            oc = {};
            oc[oldname_('max', key)] = r.ideal;
            cc.optional.push(oc);
          } else {
            oc[oldname_('', key)] = r.ideal;
            cc.optional.push(oc);
          }
        }
        if (r.exact !== undefined && typeof r.exact !== 'number') {
          cc.mandatory = cc.mandatory || {};
          cc.mandatory[oldname_('', key)] = r.exact;
        } else {
          ['min', 'max'].forEach(mix => {
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

    const shimConstraints_ = function(constraints, func) {
      if (browserDetails.version >= 61) {
        return func(constraints);
      }
      constraints = JSON.parse(JSON.stringify(constraints));
      if (constraints && typeof constraints.audio === 'object') {
        const remap = function(obj, a, b) {
          if (a in obj && !(b in obj)) {
            obj[b] = obj[a];
            delete obj[a];
          }
        };
        constraints = JSON.parse(JSON.stringify(constraints));
        remap(constraints.audio, 'autoGainControl', 'googAutoGainControl');
        remap(constraints.audio, 'noiseSuppression', 'googNoiseSuppression');
        constraints.audio = constraintsToChrome_(constraints.audio);
      }
      if (constraints && typeof constraints.video === 'object') {
        // Shim facingMode for mobile & surface pro.
        let face = constraints.video.facingMode;
        face = face && ((typeof face === 'object') ? face : {ideal: face});
        const getSupportedFacingModeLies = browserDetails.version < 66;

        if ((face && (face.exact === 'user' || face.exact === 'environment' ||
                      face.ideal === 'user' || face.ideal === 'environment')) &&
            !(navigator.mediaDevices.getSupportedConstraints &&
              navigator.mediaDevices.getSupportedConstraints().facingMode &&
              !getSupportedFacingModeLies)) {
          delete constraints.video.facingMode;
          let matches;
          if (face.exact === 'environment' || face.ideal === 'environment') {
            matches = ['back', 'rear'];
          } else if (face.exact === 'user' || face.ideal === 'user') {
            matches = ['front'];
          }
          if (matches) {
            // Look for matches in label, or use last cam for back (typical).
            return navigator.mediaDevices.enumerateDevices()
            .then(devices => {
              devices = devices.filter(d => d.kind === 'videoinput');
              let dev = devices.find(d => matches.some(match =>
                d.label.toLowerCase().includes(match)));
              if (!dev && devices.length && matches.includes('back')) {
                dev = devices[devices.length - 1]; // more likely the back cam
              }
              if (dev) {
                constraints.video.deviceId = face.exact ? {exact: dev.deviceId} :
                                                          {ideal: dev.deviceId};
              }
              constraints.video = constraintsToChrome_(constraints.video);
              logging('chrome: ' + JSON.stringify(constraints));
              return func(constraints);
            });
          }
        }
        constraints.video = constraintsToChrome_(constraints.video);
      }
      logging('chrome: ' + JSON.stringify(constraints));
      return func(constraints);
    };

    const shimError_ = function(e) {
      if (browserDetails.version >= 64) {
        return e;
      }
      return {
        name: {
          PermissionDeniedError: 'NotAllowedError',
          PermissionDismissedError: 'NotAllowedError',
          InvalidStateError: 'NotAllowedError',
          DevicesNotFoundError: 'NotFoundError',
          ConstraintNotSatisfiedError: 'OverconstrainedError',
          TrackStartError: 'NotReadableError',
          MediaDeviceFailedDueToShutdown: 'NotAllowedError',
          MediaDeviceKillSwitchOn: 'NotAllowedError',
          TabCaptureError: 'AbortError',
          ScreenCaptureError: 'AbortError',
          DeviceCaptureError: 'AbortError'
        }[e.name] || e.name,
        message: e.message,
        constraint: e.constraint || e.constraintName,
        toString() {
          return this.name + (this.message && ': ') + this.message;
        }
      };
    };

    const getUserMedia_ = function(constraints, onSuccess, onError) {
      shimConstraints_(constraints, c => {
        navigator.webkitGetUserMedia(c, onSuccess, e => {
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
      const origGetUserMedia = navigator.mediaDevices.getUserMedia.
          bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = function(cs) {
        return shimConstraints_(cs, c => origGetUserMedia(c).then(stream => {
          if (c.audio && !stream.getAudioTracks().length ||
              c.video && !stream.getVideoTracks().length) {
            stream.getTracks().forEach(track => {
              track.stop();
            });
            throw new DOMException('', 'NotFoundError');
          }
          return stream;
        }, e => Promise.reject(shimError_(e))));
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
    if (window.navigator.mediaDevices &&
      'getDisplayMedia' in window.navigator.mediaDevices) {
      return;
    }
    if (!(window.navigator.mediaDevices)) {
      return;
    }
    // getSourceId is a function that returns a promise resolving with
    // the sourceId of the screen/window/tab to be shared.
    if (typeof getSourceId !== 'function') {
      console.error('shimGetDisplayMedia: getSourceId argument is not ' +
          'a function');
      return;
    }
    window.navigator.mediaDevices.getDisplayMedia =
      function getDisplayMedia(constraints) {
        return getSourceId(constraints)
          .then(sourceId => {
            const widthSpecified = constraints.video && constraints.video.width;
            const heightSpecified = constraints.video &&
              constraints.video.height;
            const frameRateSpecified = constraints.video &&
              constraints.video.frameRate;
            constraints.video = {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                maxFrameRate: frameRateSpecified || 3
              }
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
    if (typeof window === 'object' && window.RTCPeerConnection && !('ontrack' in
        window.RTCPeerConnection.prototype)) {
      Object.defineProperty(window.RTCPeerConnection.prototype, 'ontrack', {
        get() {
          return this._ontrack;
        },
        set(f) {
          if (this._ontrack) {
            this.removeEventListener('track', this._ontrack);
          }
          this.addEventListener('track', this._ontrack = f);
        },
        enumerable: true,
        configurable: true
      });
      const origSetRemoteDescription =
          window.RTCPeerConnection.prototype.setRemoteDescription;
      window.RTCPeerConnection.prototype.setRemoteDescription =
        function setRemoteDescription() {
          if (!this._ontrackpoly) {
            this._ontrackpoly = (e) => {
              // onaddstream does not fire when a track is added to an existing
              // stream. But stream.onaddtrack is implemented so we use that.
              e.stream.addEventListener('addtrack', te => {
                let receiver;
                if (window.RTCPeerConnection.prototype.getReceivers) {
                  receiver = this.getReceivers()
                    .find(r => r.track && r.track.id === te.track.id);
                } else {
                  receiver = {track: te.track};
                }

                const event = new Event('track');
                event.track = te.track;
                event.receiver = receiver;
                event.transceiver = {receiver};
                event.streams = [e.stream];
                this.dispatchEvent(event);
              });
              e.stream.getTracks().forEach(track => {
                let receiver;
                if (window.RTCPeerConnection.prototype.getReceivers) {
                  receiver = this.getReceivers()
                    .find(r => r.track && r.track.id === track.id);
                } else {
                  receiver = {track};
                }
                const event = new Event('track');
                event.track = track;
                event.receiver = receiver;
                event.transceiver = {receiver};
                event.streams = [e.stream];
                this.dispatchEvent(event);
              });
            };
            this.addEventListener('addstream', this._ontrackpoly);
          }
          return origSetRemoteDescription.apply(this, arguments);
        };
    } else {
      // even if RTCRtpTransceiver is in window, it is only used and
      // emitted in unified-plan. Unfortunately this means we need
      // to unconditionally wrap the event.
      wrapPeerConnectionEvent(window, 'track', e => {
        if (!e.transceiver) {
          Object.defineProperty(e, 'transceiver',
            {value: {receiver: e.receiver}});
        }
        return e;
      });
    }
  }

  function shimGetSendersWithDtmf(window) {
    // Overrides addTrack/removeTrack, depends on shimAddTrackRemoveTrack.
    if (typeof window === 'object' && window.RTCPeerConnection &&
        !('getSenders' in window.RTCPeerConnection.prototype) &&
        'createDTMFSender' in window.RTCPeerConnection.prototype) {
      const shimSenderWithDtmf = function(pc, track) {
        return {
          track,
          get dtmf() {
            if (this._dtmf === undefined) {
              if (track.kind === 'audio') {
                this._dtmf = pc.createDTMFSender(track);
              } else {
                this._dtmf = null;
              }
            }
            return this._dtmf;
          },
          _pc: pc
        };
      };

      // augment addTrack when getSenders is not available.
      if (!window.RTCPeerConnection.prototype.getSenders) {
        window.RTCPeerConnection.prototype.getSenders = function getSenders() {
          this._senders = this._senders || [];
          return this._senders.slice(); // return a copy of the internal state.
        };
        const origAddTrack = window.RTCPeerConnection.prototype.addTrack;
        window.RTCPeerConnection.prototype.addTrack =
          function addTrack(track, stream) {
            let sender = origAddTrack.apply(this, arguments);
            if (!sender) {
              sender = shimSenderWithDtmf(this, track);
              this._senders.push(sender);
            }
            return sender;
          };

        const origRemoveTrack = window.RTCPeerConnection.prototype.removeTrack;
        window.RTCPeerConnection.prototype.removeTrack =
          function removeTrack(sender) {
            origRemoveTrack.apply(this, arguments);
            const idx = this._senders.indexOf(sender);
            if (idx !== -1) {
              this._senders.splice(idx, 1);
            }
          };
      }
      const origAddStream = window.RTCPeerConnection.prototype.addStream;
      window.RTCPeerConnection.prototype.addStream = function addStream(stream) {
        this._senders = this._senders || [];
        origAddStream.apply(this, [stream]);
        stream.getTracks().forEach(track => {
          this._senders.push(shimSenderWithDtmf(this, track));
        });
      };

      const origRemoveStream = window.RTCPeerConnection.prototype.removeStream;
      window.RTCPeerConnection.prototype.removeStream =
        function removeStream(stream) {
          this._senders = this._senders || [];
          origRemoveStream.apply(this, [stream]);

          stream.getTracks().forEach(track => {
            const sender = this._senders.find(s => s.track === track);
            if (sender) { // remove sender
              this._senders.splice(this._senders.indexOf(sender), 1);
            }
          });
        };
    } else if (typeof window === 'object' && window.RTCPeerConnection &&
               'getSenders' in window.RTCPeerConnection.prototype &&
               'createDTMFSender' in window.RTCPeerConnection.prototype &&
               window.RTCRtpSender &&
               !('dtmf' in window.RTCRtpSender.prototype)) {
      const origGetSenders = window.RTCPeerConnection.prototype.getSenders;
      window.RTCPeerConnection.prototype.getSenders = function getSenders() {
        const senders = origGetSenders.apply(this, []);
        senders.forEach(sender => sender._pc = this);
        return senders;
      };

      Object.defineProperty(window.RTCRtpSender.prototype, 'dtmf', {
        get() {
          if (this._dtmf === undefined) {
            if (this.track.kind === 'audio') {
              this._dtmf = this._pc.createDTMFSender(this.track);
            } else {
              this._dtmf = null;
            }
          }
          return this._dtmf;
        }
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
      if (arguments.length > 0 && typeof selector === 'function') {
        return origGetStats.apply(this, arguments);
      }

      // When spec-style getStats is supported, return those when called with
      // either no arguments or the selector argument is null.
      if (origGetStats.length === 0 && (arguments.length === 0 ||
          typeof selector !== 'function')) {
        return origGetStats.apply(this, []);
      }

      const fixChromeStats_ = function(response) {
        const standardReport = {};
        const reports = response.result();
        reports.forEach(report => {
          const standardStats = {
            id: report.id,
            timestamp: report.timestamp,
            type: {
              localcandidate: 'local-candidate',
              remotecandidate: 'remote-candidate'
            }[report.type] || report.type
          };
          report.names().forEach(name => {
            standardStats[name] = report.stat(name);
          });
          standardReport[standardStats.id] = standardStats;
        });

        return standardReport;
      };

      // shim getStats with maplike support
      const makeMapStats = function(stats) {
        return new Map(Object.keys(stats).map(key => [key, stats[key]]));
      };

      if (arguments.length >= 2) {
        const successCallbackWrapper_ = function(response) {
          onSucc(makeMapStats(fixChromeStats_(response)));
        };

        return origGetStats.apply(this, [successCallbackWrapper_,
          selector]);
      }

      // promise-support
      return new Promise((resolve, reject) => {
        origGetStats.apply(this, [
          function(response) {
            resolve(makeMapStats(fixChromeStats_(response)));
          }, reject]);
      }).then(onSucc, onErr);
    };
  }

  function shimSenderReceiverGetStats(window) {
    if (!(typeof window === 'object' && window.RTCPeerConnection &&
        window.RTCRtpSender && window.RTCRtpReceiver)) {
      return;
    }

    // shim sender stats.
    if (!('getStats' in window.RTCRtpSender.prototype)) {
      const origGetSenders = window.RTCPeerConnection.prototype.getSenders;
      if (origGetSenders) {
        window.RTCPeerConnection.prototype.getSenders = function getSenders() {
          const senders = origGetSenders.apply(this, []);
          senders.forEach(sender => sender._pc = this);
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
        return this._pc.getStats().then(result =>
          /* Note: this will include stats of all senders that
           *   send a track with the same id as sender.track as
           *   it is not possible to identify the RTCRtpSender.
           */
          filterStats(result, sender.track, true));
      };
    }

    // shim receiver stats.
    if (!('getStats' in window.RTCRtpReceiver.prototype)) {
      const origGetReceivers = window.RTCPeerConnection.prototype.getReceivers;
      if (origGetReceivers) {
        window.RTCPeerConnection.prototype.getReceivers =
          function getReceivers() {
            const receivers = origGetReceivers.apply(this, []);
            receivers.forEach(receiver => receiver._pc = this);
            return receivers;
          };
      }
      wrapPeerConnectionEvent(window, 'track', e => {
        e.receiver._pc = e.srcElement;
        return e;
      });
      window.RTCRtpReceiver.prototype.getStats = function getStats() {
        const receiver = this;
        return this._pc.getStats().then(result =>
          filterStats(result, receiver.track, false));
      };
    }

    if (!('getStats' in window.RTCRtpSender.prototype &&
        'getStats' in window.RTCRtpReceiver.prototype)) {
      return;
    }

    // shim RTCPeerConnection.getStats(track).
    const origGetStats = window.RTCPeerConnection.prototype.getStats;
    window.RTCPeerConnection.prototype.getStats = function getStats() {
      if (arguments.length > 0 &&
          arguments[0] instanceof window.MediaStreamTrack) {
        const track = arguments[0];
        let sender;
        let receiver;
        let err;
        this.getSenders().forEach(s => {
          if (s.track === track) {
            if (sender) {
              err = true;
            } else {
              sender = s;
            }
          }
        });
        this.getReceivers().forEach(r => {
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
          return Promise.reject(new DOMException(
            'There are more than one sender or receiver for the track.',
            'InvalidAccessError'));
        } else if (sender) {
          return sender.getStats();
        } else if (receiver) {
          return receiver.getStats();
        }
        return Promise.reject(new DOMException(
          'There is no sender or receiver for the track.',
          'InvalidAccessError'));
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
        return Object.keys(this._shimmedLocalStreams)
          .map(streamId => this._shimmedLocalStreams[streamId][0]);
      };

    const origAddTrack = window.RTCPeerConnection.prototype.addTrack;
    window.RTCPeerConnection.prototype.addTrack =
      function addTrack(track, stream) {
        if (!stream) {
          return origAddTrack.apply(this, arguments);
        }
        this._shimmedLocalStreams = this._shimmedLocalStreams || {};

        const sender = origAddTrack.apply(this, arguments);
        if (!this._shimmedLocalStreams[stream.id]) {
          this._shimmedLocalStreams[stream.id] = [stream, sender];
        } else if (this._shimmedLocalStreams[stream.id].indexOf(sender) === -1) {
          this._shimmedLocalStreams[stream.id].push(sender);
        }
        return sender;
      };

    const origAddStream = window.RTCPeerConnection.prototype.addStream;
    window.RTCPeerConnection.prototype.addStream = function addStream(stream) {
      this._shimmedLocalStreams = this._shimmedLocalStreams || {};

      stream.getTracks().forEach(track => {
        const alreadyExists = this.getSenders().find(s => s.track === track);
        if (alreadyExists) {
          throw new DOMException('Track already exists.',
              'InvalidAccessError');
        }
      });
      const existingSenders = this.getSenders();
      origAddStream.apply(this, arguments);
      const newSenders = this.getSenders()
        .filter(newSender => existingSenders.indexOf(newSender) === -1);
      this._shimmedLocalStreams[stream.id] = [stream].concat(newSenders);
    };

    const origRemoveStream = window.RTCPeerConnection.prototype.removeStream;
    window.RTCPeerConnection.prototype.removeStream =
      function removeStream(stream) {
        this._shimmedLocalStreams = this._shimmedLocalStreams || {};
        delete this._shimmedLocalStreams[stream.id];
        return origRemoveStream.apply(this, arguments);
      };

    const origRemoveTrack = window.RTCPeerConnection.prototype.removeTrack;
    window.RTCPeerConnection.prototype.removeTrack =
      function removeTrack(sender) {
        this._shimmedLocalStreams = this._shimmedLocalStreams || {};
        if (sender) {
          Object.keys(this._shimmedLocalStreams).forEach(streamId => {
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
    if (window.RTCPeerConnection.prototype.addTrack &&
        browserDetails.version >= 65) {
      return shimAddTrackRemoveTrackWithNative(window);
    }

    // also shim pc.getLocalStreams when addTrack is shimmed
    // to return the original streams.
    const origGetLocalStreams = window.RTCPeerConnection.prototype
        .getLocalStreams;
    window.RTCPeerConnection.prototype.getLocalStreams =
      function getLocalStreams() {
        const nativeStreams = origGetLocalStreams.apply(this);
        this._reverseStreams = this._reverseStreams || {};
        return nativeStreams.map(stream => this._reverseStreams[stream.id]);
      };

    const origAddStream = window.RTCPeerConnection.prototype.addStream;
    window.RTCPeerConnection.prototype.addStream = function addStream(stream) {
      this._streams = this._streams || {};
      this._reverseStreams = this._reverseStreams || {};

      stream.getTracks().forEach(track => {
        const alreadyExists = this.getSenders().find(s => s.track === track);
        if (alreadyExists) {
          throw new DOMException('Track already exists.',
              'InvalidAccessError');
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
    window.RTCPeerConnection.prototype.removeStream =
      function removeStream(stream) {
        this._streams = this._streams || {};
        this._reverseStreams = this._reverseStreams || {};

        origRemoveStream.apply(this, [(this._streams[stream.id] || stream)]);
        delete this._reverseStreams[(this._streams[stream.id] ?
            this._streams[stream.id].id : stream.id)];
        delete this._streams[stream.id];
      };

    window.RTCPeerConnection.prototype.addTrack =
      function addTrack(track, stream) {
        if (this.signalingState === 'closed') {
          throw new DOMException(
            'The RTCPeerConnection\'s signalingState is \'closed\'.',
            'InvalidStateError');
        }
        const streams = [].slice.call(arguments, 1);
        if (streams.length !== 1 ||
            !streams[0].getTracks().find(t => t === track)) {
          // this is not fully correct but all we can manage without
          // [[associated MediaStreams]] internal slot.
          throw new DOMException(
            'The adapter.js addTrack polyfill only supports a single ' +
            ' stream which is associated with the specified track.',
            'NotSupportedError');
        }

        const alreadyExists = this.getSenders().find(s => s.track === track);
        if (alreadyExists) {
          throw new DOMException('Track already exists.',
              'InvalidAccessError');
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
            this.dispatchEvent(new Event('negotiationneeded'));
          });
        } else {
          const newStream = new window.MediaStream([track]);
          this._streams[stream.id] = newStream;
          this._reverseStreams[newStream.id] = stream;
          this.addStream(newStream);
        }
        return this.getSenders().find(s => s.track === track);
      };

    // replace the internal stream id with the external one and
    // vice versa.
    function replaceInternalStreamId(pc, description) {
      let sdp = description.sdp;
      Object.keys(pc._reverseStreams || []).forEach(internalId => {
        const externalStream = pc._reverseStreams[internalId];
        const internalStream = pc._streams[externalStream.id];
        sdp = sdp.replace(new RegExp(internalStream.id, 'g'),
            externalStream.id);
      });
      return new RTCSessionDescription({
        type: description.type,
        sdp
      });
    }
    function replaceExternalStreamId(pc, description) {
      let sdp = description.sdp;
      Object.keys(pc._reverseStreams || []).forEach(internalId => {
        const externalStream = pc._reverseStreams[internalId];
        const internalStream = pc._streams[externalStream.id];
        sdp = sdp.replace(new RegExp(externalStream.id, 'g'),
            internalStream.id);
      });
      return new RTCSessionDescription({
        type: description.type,
        sdp
      });
    }
    ['createOffer', 'createAnswer'].forEach(function(method) {
      const nativeMethod = window.RTCPeerConnection.prototype[method];
      const methodObj = {[method]() {
        const args = arguments;
        const isLegacyCall = arguments.length &&
            typeof arguments[0] === 'function';
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
            }, arguments[2]
          ]);
        }
        return nativeMethod.apply(this, arguments)
        .then(description => replaceInternalStreamId(this, description));
      }};
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
        window.RTCPeerConnection.prototype, 'localDescription');
    Object.defineProperty(window.RTCPeerConnection.prototype,
        'localDescription', {
          get() {
            const description = origLocalDescription.get.apply(this);
            if (description.type === '') {
              return description;
            }
            return replaceInternalStreamId(this, description);
          }
        });

    window.RTCPeerConnection.prototype.removeTrack =
      function removeTrack(sender) {
        if (this.signalingState === 'closed') {
          throw new DOMException(
            'The RTCPeerConnection\'s signalingState is \'closed\'.',
            'InvalidStateError');
        }
        // We can not yet check for sender instanceof RTCRtpSender
        // since we shim RTPSender. So we check if sender._pc is set.
        if (!sender._pc) {
          throw new DOMException('Argument 1 of RTCPeerConnection.removeTrack ' +
              'does not implement interface RTCRtpSender.', 'TypeError');
        }
        const isLocal = sender._pc === this;
        if (!isLocal) {
          throw new DOMException('Sender was not created by this connection.',
              'InvalidAccessError');
        }

        // Search for the native stream the senders track belongs to.
        this._streams = this._streams || {};
        let stream;
        Object.keys(this._streams).forEach(streamid => {
          const hasTrack = this._streams[streamid].getTracks()
            .find(track => sender.track === track);
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
          this.dispatchEvent(new Event('negotiationneeded'));
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
      ['setLocalDescription', 'setRemoteDescription', 'addIceCandidate']
          .forEach(function(method) {
            const nativeMethod = window.RTCPeerConnection.prototype[method];
            const methodObj = {[method]() {
              arguments[0] = new ((method === 'addIceCandidate') ?
                  window.RTCIceCandidate :
                  window.RTCSessionDescription)(arguments[0]);
              return nativeMethod.apply(this, arguments);
            }};
            window.RTCPeerConnection.prototype[method] = methodObj[method];
          });
    }
  }

  // Attempt to fix ONN in plan-b mode.
  function fixNegotiationNeeded(window, browserDetails) {
    wrapPeerConnectionEvent(window, 'negotiationneeded', e => {
      const pc = e.target;
      if (browserDetails.version < 72 || (pc.getConfiguration &&
          pc.getConfiguration().sdpSemantics === 'plan-b')) {
        if (pc.signalingState !== 'stable') {
          return;
        }
      }
      return e;
    });
  }

  var chromeShim = /*#__PURE__*/Object.freeze({
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
    shimGetDisplayMedia: shimGetDisplayMedia$1
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

    navigator.getUserMedia = function(constraints, onSuccess, onError) {
      // Replace Firefox 44+'s deprecation warning with unprefixed version.
      deprecated('navigator.getUserMedia',
          'navigator.mediaDevices.getUserMedia');
      navigator.mediaDevices.getUserMedia(constraints).then(onSuccess, onError);
    };

    if (!(browserDetails.version > 55 &&
        'autoGainControl' in navigator.mediaDevices.getSupportedConstraints())) {
      const remap = function(obj, a, b) {
        if (a in obj && !(b in obj)) {
          obj[b] = obj[a];
          delete obj[a];
        }
      };

      const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.
          bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = function(c) {
        if (typeof c === 'object' && typeof c.audio === 'object') {
          c = JSON.parse(JSON.stringify(c));
          remap(c.audio, 'autoGainControl', 'mozAutoGainControl');
          remap(c.audio, 'noiseSuppression', 'mozNoiseSuppression');
        }
        return nativeGetUserMedia(c);
      };

      if (MediaStreamTrack && MediaStreamTrack.prototype.getSettings) {
        const nativeGetSettings = MediaStreamTrack.prototype.getSettings;
        MediaStreamTrack.prototype.getSettings = function() {
          const obj = nativeGetSettings.apply(this, arguments);
          remap(obj, 'mozAutoGainControl', 'autoGainControl');
          remap(obj, 'mozNoiseSuppression', 'noiseSuppression');
          return obj;
        };
      }

      if (MediaStreamTrack && MediaStreamTrack.prototype.applyConstraints) {
        const nativeApplyConstraints =
          MediaStreamTrack.prototype.applyConstraints;
        MediaStreamTrack.prototype.applyConstraints = function(c) {
          if (this.kind === 'audio' && typeof c === 'object') {
            c = JSON.parse(JSON.stringify(c));
            remap(c, 'autoGainControl', 'mozAutoGainControl');
            remap(c, 'noiseSuppression', 'mozNoiseSuppression');
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
    if (window.navigator.mediaDevices &&
      'getDisplayMedia' in window.navigator.mediaDevices) {
      return;
    }
    if (!(window.navigator.mediaDevices)) {
      return;
    }
    window.navigator.mediaDevices.getDisplayMedia =
      function getDisplayMedia(constraints) {
        if (!(constraints && constraints.video)) {
          const err = new DOMException('getDisplayMedia without video ' +
              'constraints is undefined');
          err.name = 'NotFoundError';
          // from https://heycam.github.io/webidl/#idl-DOMException-error-names
          err.code = 8;
          return Promise.reject(err);
        }
        if (constraints.video === true) {
          constraints.video = {mediaSource: preferredMediaSource};
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
    if (typeof window === 'object' && window.RTCTrackEvent &&
        ('receiver' in window.RTCTrackEvent.prototype) &&
        !('transceiver' in window.RTCTrackEvent.prototype)) {
      Object.defineProperty(window.RTCTrackEvent.prototype, 'transceiver', {
        get() {
          return {receiver: this.receiver};
        }
      });
    }
  }

  function shimPeerConnection(window, browserDetails) {
    if (typeof window !== 'object' ||
        !(window.RTCPeerConnection || window.mozRTCPeerConnection)) {
      return; // probably media.peerconnection.enabled=false in about:config
    }
    if (!window.RTCPeerConnection && window.mozRTCPeerConnection) {
      // very basic support for old versions.
      window.RTCPeerConnection = window.mozRTCPeerConnection;
    }

    if (browserDetails.version < 53) {
      // shim away need for obsolete RTCIceCandidate/RTCSessionDescription.
      ['setLocalDescription', 'setRemoteDescription', 'addIceCandidate']
          .forEach(function(method) {
            const nativeMethod = window.RTCPeerConnection.prototype[method];
            const methodObj = {[method]() {
              arguments[0] = new ((method === 'addIceCandidate') ?
                  window.RTCIceCandidate :
                  window.RTCSessionDescription)(arguments[0]);
              return nativeMethod.apply(this, arguments);
            }};
            window.RTCPeerConnection.prototype[method] = methodObj[method];
          });
    }

    const modernStatsTypes = {
      inboundrtp: 'inbound-rtp',
      outboundrtp: 'outbound-rtp',
      candidatepair: 'candidate-pair',
      localcandidate: 'local-candidate',
      remotecandidate: 'remote-candidate'
    };

    const nativeGetStats = window.RTCPeerConnection.prototype.getStats;
    window.RTCPeerConnection.prototype.getStats = function getStats() {
      const [selector, onSucc, onErr] = arguments;
      return nativeGetStats.apply(this, [selector || null])
        .then(stats => {
          if (browserDetails.version < 53 && !onSucc) {
            // Shim only promise getStats with spec-hyphens in type names
            // Leave callback version alone; misc old uses of forEach before Map
            try {
              stats.forEach(stat => {
                stat.type = modernStatsTypes[stat.type] || stat.type;
              });
            } catch (e) {
              if (e.name !== 'TypeError') {
                throw e;
              }
              // Avoid TypeError: "type" is read-only, in old versions. 34-43ish
              stats.forEach((stat, i) => {
                stats.set(i, Object.assign({}, stat, {
                  type: modernStatsTypes[stat.type] || stat.type
                }));
              });
            }
          }
          return stats;
        })
        .then(onSucc, onErr);
    };
  }

  function shimSenderGetStats(window) {
    if (!(typeof window === 'object' && window.RTCPeerConnection &&
        window.RTCRtpSender)) {
      return;
    }
    if (window.RTCRtpSender && 'getStats' in window.RTCRtpSender.prototype) {
      return;
    }
    const origGetSenders = window.RTCPeerConnection.prototype.getSenders;
    if (origGetSenders) {
      window.RTCPeerConnection.prototype.getSenders = function getSenders() {
        const senders = origGetSenders.apply(this, []);
        senders.forEach(sender => sender._pc = this);
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
      return this.track ? this._pc.getStats(this.track) :
          Promise.resolve(new Map());
    };
  }

  function shimReceiverGetStats(window) {
    if (!(typeof window === 'object' && window.RTCPeerConnection &&
        window.RTCRtpSender)) {
      return;
    }
    if (window.RTCRtpSender && 'getStats' in window.RTCRtpReceiver.prototype) {
      return;
    }
    const origGetReceivers = window.RTCPeerConnection.prototype.getReceivers;
    if (origGetReceivers) {
      window.RTCPeerConnection.prototype.getReceivers = function getReceivers() {
        const receivers = origGetReceivers.apply(this, []);
        receivers.forEach(receiver => receiver._pc = this);
        return receivers;
      };
    }
    wrapPeerConnectionEvent(window, 'track', e => {
      e.receiver._pc = e.srcElement;
      return e;
    });
    window.RTCRtpReceiver.prototype.getStats = function getStats() {
      return this._pc.getStats(this.track);
    };
  }

  function shimRemoveStream(window) {
    if (!window.RTCPeerConnection ||
        'removeStream' in window.RTCPeerConnection.prototype) {
      return;
    }
    window.RTCPeerConnection.prototype.removeStream =
      function removeStream(stream) {
        deprecated('removeStream', 'removeTrack');
        this.getSenders().forEach(sender => {
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
    if (!(typeof window === 'object' && window.RTCPeerConnection)) {
      return;
    }
    const origAddTransceiver = window.RTCPeerConnection.prototype.addTransceiver;
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
              if ('rid' in encodingParam) {
                const ridRegex = /^[a-z0-9]{0,16}$/i;
                if (!ridRegex.test(encodingParam.rid)) {
                  throw new TypeError('Invalid RID value provided.');
                }
              }
              if ('scaleResolutionDownBy' in encodingParam) {
                if (!(parseFloat(encodingParam.scaleResolutionDownBy) >= 1.0)) {
                  throw new RangeError('scale_resolution_down_by must be >= 1.0');
                }
              }
              if ('maxFramerate' in encodingParam) {
                if (!(parseFloat(encodingParam.maxFramerate) >= 0)) {
                  throw new RangeError('max_framerate must be >= 0.0');
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
            const {sender} = transceiver;
            const params = sender.getParameters();
            if (!('encodings' in params) ||
                // Avoid being fooled by patched getParameters() below.
                (params.encodings.length === 1 &&
                 Object.keys(params.encodings[0]).length === 0)) {
              params.encodings = sendEncodings;
              sender.sendEncodings = sendEncodings;
              this.setParametersPromises.push(sender.setParameters(params)
                .then(() => {
                  delete sender.sendEncodings;
                }).catch(() => {
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
    if (!(typeof window === 'object' && window.RTCRtpSender)) {
      return;
    }
    const origGetParameters = window.RTCRtpSender.prototype.getParameters;
    if (origGetParameters) {
      window.RTCRtpSender.prototype.getParameters =
        function getParameters() {
          const params = origGetParameters.apply(this, arguments);
          if (!('encodings' in params)) {
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
    if (!(typeof window === 'object' && window.RTCPeerConnection)) {
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
    if (!(typeof window === 'object' && window.RTCPeerConnection)) {
      return;
    }
    const origCreateAnswer = window.RTCPeerConnection.prototype.createAnswer;
    window.RTCPeerConnection.prototype.createAnswer = function createAnswer() {
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

  var firefoxShim = /*#__PURE__*/Object.freeze({
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
    shimGetDisplayMedia: shimGetDisplayMedia
  });

  /*
   *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
   *
   *  Use of this source code is governed by a BSD-style license
   *  that can be found in the LICENSE file in the root of the source
   *  tree.
   */

  function shimLocalStreamsAPI(window) {
    if (typeof window !== 'object' || !window.RTCPeerConnection) {
      return;
    }
    if (!('getLocalStreams' in window.RTCPeerConnection.prototype)) {
      window.RTCPeerConnection.prototype.getLocalStreams =
        function getLocalStreams() {
          if (!this._localStreams) {
            this._localStreams = [];
          }
          return this._localStreams;
        };
    }
    if (!('addStream' in window.RTCPeerConnection.prototype)) {
      const _addTrack = window.RTCPeerConnection.prototype.addTrack;
      window.RTCPeerConnection.prototype.addStream = function addStream(stream) {
        if (!this._localStreams) {
          this._localStreams = [];
        }
        if (!this._localStreams.includes(stream)) {
          this._localStreams.push(stream);
        }
        // Try to emulate Chrome's behaviour of adding in audio-video order.
        // Safari orders by track id.
        stream.getAudioTracks().forEach(track => _addTrack.call(this, track,
          stream));
        stream.getVideoTracks().forEach(track => _addTrack.call(this, track,
          stream));
      };

      window.RTCPeerConnection.prototype.addTrack =
        function addTrack(track, ...streams) {
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
    if (!('removeStream' in window.RTCPeerConnection.prototype)) {
      window.RTCPeerConnection.prototype.removeStream =
        function removeStream(stream) {
          if (!this._localStreams) {
            this._localStreams = [];
          }
          const index = this._localStreams.indexOf(stream);
          if (index === -1) {
            return;
          }
          this._localStreams.splice(index, 1);
          const tracks = stream.getTracks();
          this.getSenders().forEach(sender => {
            if (tracks.includes(sender.track)) {
              this.removeTrack(sender);
            }
          });
        };
    }
  }

  function shimRemoteStreamsAPI(window) {
    if (typeof window !== 'object' || !window.RTCPeerConnection) {
      return;
    }
    if (!('getRemoteStreams' in window.RTCPeerConnection.prototype)) {
      window.RTCPeerConnection.prototype.getRemoteStreams =
        function getRemoteStreams() {
          return this._remoteStreams ? this._remoteStreams : [];
        };
    }
    if (!('onaddstream' in window.RTCPeerConnection.prototype)) {
      Object.defineProperty(window.RTCPeerConnection.prototype, 'onaddstream', {
        get() {
          return this._onaddstream;
        },
        set(f) {
          if (this._onaddstream) {
            this.removeEventListener('addstream', this._onaddstream);
            this.removeEventListener('track', this._onaddstreampoly);
          }
          this.addEventListener('addstream', this._onaddstream = f);
          this.addEventListener('track', this._onaddstreampoly = (e) => {
            e.streams.forEach(stream => {
              if (!this._remoteStreams) {
                this._remoteStreams = [];
              }
              if (this._remoteStreams.includes(stream)) {
                return;
              }
              this._remoteStreams.push(stream);
              const event = new Event('addstream');
              event.stream = stream;
              this.dispatchEvent(event);
            });
          });
        }
      });
      const origSetRemoteDescription =
        window.RTCPeerConnection.prototype.setRemoteDescription;
      window.RTCPeerConnection.prototype.setRemoteDescription =
        function setRemoteDescription() {
          const pc = this;
          if (!this._onaddstreampoly) {
            this.addEventListener('track', this._onaddstreampoly = function(e) {
              e.streams.forEach(stream => {
                if (!pc._remoteStreams) {
                  pc._remoteStreams = [];
                }
                if (pc._remoteStreams.indexOf(stream) >= 0) {
                  return;
                }
                pc._remoteStreams.push(stream);
                const event = new Event('addstream');
                event.stream = stream;
                pc.dispatchEvent(event);
              });
            });
          }
          return origSetRemoteDescription.apply(pc, arguments);
        };
    }
  }

  function shimCallbacksAPI(window) {
    if (typeof window !== 'object' || !window.RTCPeerConnection) {
      return;
    }
    const prototype = window.RTCPeerConnection.prototype;
    const origCreateOffer = prototype.createOffer;
    const origCreateAnswer = prototype.createAnswer;
    const setLocalDescription = prototype.setLocalDescription;
    const setRemoteDescription = prototype.setRemoteDescription;
    const addIceCandidate = prototype.addIceCandidate;

    prototype.createOffer =
      function createOffer(successCallback, failureCallback) {
        const options = (arguments.length >= 2) ? arguments[2] : arguments[0];
        const promise = origCreateOffer.apply(this, [options]);
        if (!failureCallback) {
          return promise;
        }
        promise.then(successCallback, failureCallback);
        return Promise.resolve();
      };

    prototype.createAnswer =
      function createAnswer(successCallback, failureCallback) {
        const options = (arguments.length >= 2) ? arguments[2] : arguments[0];
        const promise = origCreateAnswer.apply(this, [options]);
        if (!failureCallback) {
          return promise;
        }
        promise.then(successCallback, failureCallback);
        return Promise.resolve();
      };

    let withCallback = function(description, successCallback, failureCallback) {
      const promise = setLocalDescription.apply(this, [description]);
      if (!failureCallback) {
        return promise;
      }
      promise.then(successCallback, failureCallback);
      return Promise.resolve();
    };
    prototype.setLocalDescription = withCallback;

    withCallback = function(description, successCallback, failureCallback) {
      const promise = setRemoteDescription.apply(this, [description]);
      if (!failureCallback) {
        return promise;
      }
      promise.then(successCallback, failureCallback);
      return Promise.resolve();
    };
    prototype.setRemoteDescription = withCallback;

    withCallback = function(candidate, successCallback, failureCallback) {
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

    if (!navigator.getUserMedia && navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia) {
      navigator.getUserMedia = function getUserMedia(constraints, cb, errcb) {
        navigator.mediaDevices.getUserMedia(constraints)
        .then(cb, errcb);
      }.bind(navigator);
    }
  }

  function shimConstraints(constraints) {
    if (constraints && constraints.video !== undefined) {
      return Object.assign({},
        constraints,
        {video: compactObject(constraints.video)}
      );
    }

    return constraints;
  }

  function shimRTCIceServerUrls(window) {
    if (!window.RTCPeerConnection) {
      return;
    }
    // migrate from non-spec RTCIceServer.url to RTCIceServer.urls
    const OrigPeerConnection = window.RTCPeerConnection;
    window.RTCPeerConnection =
      function RTCPeerConnection(pcConfig, pcConstraints) {
        if (pcConfig && pcConfig.iceServers) {
          const newIceServers = [];
          for (let i = 0; i < pcConfig.iceServers.length; i++) {
            let server = pcConfig.iceServers[i];
            if (!server.hasOwnProperty('urls') &&
                server.hasOwnProperty('url')) {
              deprecated('RTCIceServer.url', 'RTCIceServer.urls');
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
    if ('generateCertificate' in OrigPeerConnection) {
      Object.defineProperty(window.RTCPeerConnection, 'generateCertificate', {
        get() {
          return OrigPeerConnection.generateCertificate;
        }
      });
    }
  }

  function shimTrackEventTransceiver(window) {
    // Add event.transceiver member over deprecated event.receiver
    if (typeof window === 'object' && window.RTCTrackEvent &&
        'receiver' in window.RTCTrackEvent.prototype &&
        !('transceiver' in window.RTCTrackEvent.prototype)) {
      Object.defineProperty(window.RTCTrackEvent.prototype, 'transceiver', {
        get() {
          return {receiver: this.receiver};
        }
      });
    }
  }

  function shimCreateOfferLegacy(window) {
    const origCreateOffer = window.RTCPeerConnection.prototype.createOffer;
    window.RTCPeerConnection.prototype.createOffer =
      function createOffer(offerOptions) {
        if (offerOptions) {
          if (typeof offerOptions.offerToReceiveAudio !== 'undefined') {
            // support bit values
            offerOptions.offerToReceiveAudio =
              !!offerOptions.offerToReceiveAudio;
          }
          const audioTransceiver = this.getTransceivers().find(transceiver =>
            transceiver.receiver.track.kind === 'audio');
          if (offerOptions.offerToReceiveAudio === false && audioTransceiver) {
            if (audioTransceiver.direction === 'sendrecv') {
              if (audioTransceiver.setDirection) {
                audioTransceiver.setDirection('sendonly');
              } else {
                audioTransceiver.direction = 'sendonly';
              }
            } else if (audioTransceiver.direction === 'recvonly') {
              if (audioTransceiver.setDirection) {
                audioTransceiver.setDirection('inactive');
              } else {
                audioTransceiver.direction = 'inactive';
              }
            }
          } else if (offerOptions.offerToReceiveAudio === true &&
              !audioTransceiver) {
            this.addTransceiver('audio', {direction: 'recvonly'});
          }

          if (typeof offerOptions.offerToReceiveVideo !== 'undefined') {
            // support bit values
            offerOptions.offerToReceiveVideo =
              !!offerOptions.offerToReceiveVideo;
          }
          const videoTransceiver = this.getTransceivers().find(transceiver =>
            transceiver.receiver.track.kind === 'video');
          if (offerOptions.offerToReceiveVideo === false && videoTransceiver) {
            if (videoTransceiver.direction === 'sendrecv') {
              if (videoTransceiver.setDirection) {
                videoTransceiver.setDirection('sendonly');
              } else {
                videoTransceiver.direction = 'sendonly';
              }
            } else if (videoTransceiver.direction === 'recvonly') {
              if (videoTransceiver.setDirection) {
                videoTransceiver.setDirection('inactive');
              } else {
                videoTransceiver.direction = 'inactive';
              }
            }
          } else if (offerOptions.offerToReceiveVideo === true &&
              !videoTransceiver) {
            this.addTransceiver('video', {direction: 'recvonly'});
          }
        }
        return origCreateOffer.apply(this, arguments);
      };
  }

  function shimAudioContext(window) {
    if (typeof window !== 'object' || window.AudioContext) {
      return;
    }
    window.AudioContext = window.webkitAudioContext;
  }

  var safariShim = /*#__PURE__*/Object.freeze({
    __proto__: null,
    shimLocalStreamsAPI: shimLocalStreamsAPI,
    shimRemoteStreamsAPI: shimRemoteStreamsAPI,
    shimCallbacksAPI: shimCallbacksAPI,
    shimGetUserMedia: shimGetUserMedia,
    shimConstraints: shimConstraints,
    shimRTCIceServerUrls: shimRTCIceServerUrls,
    shimTrackEventTransceiver: shimTrackEventTransceiver,
    shimCreateOfferLegacy: shimCreateOfferLegacy,
    shimAudioContext: shimAudioContext
  });

  var sdp$1 = {exports: {}};

  /* eslint-env node */

  (function (module) {

  	// SDP helpers.
  	const SDPUtils = {};

  	// Generate an alphanumeric identifier for cname or mids.
  	// TODO: use UUIDs instead? https://gist.github.com/jed/982883
  	SDPUtils.generateIdentifier = function() {
  	  return Math.random().toString(36).substr(2, 10);
  	};

  	// The RTCP CNAME used by all peerconnections from the same JS.
  	SDPUtils.localCName = SDPUtils.generateIdentifier();

  	// Splits SDP into lines, dealing with both CRLF and LF.
  	SDPUtils.splitLines = function(blob) {
  	  return blob.trim().split('\n').map(line => line.trim());
  	};
  	// Splits SDP into sessionpart and mediasections. Ensures CRLF.
  	SDPUtils.splitSections = function(blob) {
  	  const parts = blob.split('\nm=');
  	  return parts.map((part, index) => (index > 0 ?
  	    'm=' + part : part).trim() + '\r\n');
  	};

  	// Returns the session description.
  	SDPUtils.getDescription = function(blob) {
  	  const sections = SDPUtils.splitSections(blob);
  	  return sections && sections[0];
  	};

  	// Returns the individual media sections.
  	SDPUtils.getMediaSections = function(blob) {
  	  const sections = SDPUtils.splitSections(blob);
  	  sections.shift();
  	  return sections;
  	};

  	// Returns lines that start with a certain prefix.
  	SDPUtils.matchPrefix = function(blob, prefix) {
  	  return SDPUtils.splitLines(blob).filter(line => line.indexOf(prefix) === 0);
  	};

  	// Parses an ICE candidate line. Sample input:
  	// candidate:702786350 2 udp 41819902 8.8.8.8 60769 typ relay raddr 8.8.8.8
  	// rport 55996"
  	// Input can be prefixed with a=.
  	SDPUtils.parseCandidate = function(line) {
  	  let parts;
  	  // Parse both variants.
  	  if (line.indexOf('a=candidate:') === 0) {
  	    parts = line.substring(12).split(' ');
  	  } else {
  	    parts = line.substring(10).split(' ');
  	  }

  	  const candidate = {
  	    foundation: parts[0],
  	    component: {1: 'rtp', 2: 'rtcp'}[parts[1]] || parts[1],
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
  	      case 'raddr':
  	        candidate.relatedAddress = parts[i + 1];
  	        break;
  	      case 'rport':
  	        candidate.relatedPort = parseInt(parts[i + 1], 10);
  	        break;
  	      case 'tcptype':
  	        candidate.tcpType = parts[i + 1];
  	        break;
  	      case 'ufrag':
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
  	SDPUtils.writeCandidate = function(candidate) {
  	  const sdp = [];
  	  sdp.push(candidate.foundation);

  	  const component = candidate.component;
  	  if (component === 'rtp') {
  	    sdp.push(1);
  	  } else if (component === 'rtcp') {
  	    sdp.push(2);
  	  } else {
  	    sdp.push(component);
  	  }
  	  sdp.push(candidate.protocol.toUpperCase());
  	  sdp.push(candidate.priority);
  	  sdp.push(candidate.address || candidate.ip);
  	  sdp.push(candidate.port);

  	  const type = candidate.type;
  	  sdp.push('typ');
  	  sdp.push(type);
  	  if (type !== 'host' && candidate.relatedAddress &&
  	      candidate.relatedPort) {
  	    sdp.push('raddr');
  	    sdp.push(candidate.relatedAddress);
  	    sdp.push('rport');
  	    sdp.push(candidate.relatedPort);
  	  }
  	  if (candidate.tcpType && candidate.protocol.toLowerCase() === 'tcp') {
  	    sdp.push('tcptype');
  	    sdp.push(candidate.tcpType);
  	  }
  	  if (candidate.usernameFragment || candidate.ufrag) {
  	    sdp.push('ufrag');
  	    sdp.push(candidate.usernameFragment || candidate.ufrag);
  	  }
  	  return 'candidate:' + sdp.join(' ');
  	};

  	// Parses an ice-options line, returns an array of option tags.
  	// Sample input:
  	// a=ice-options:foo bar
  	SDPUtils.parseIceOptions = function(line) {
  	  return line.substr(14).split(' ');
  	};

  	// Parses a rtpmap line, returns RTCRtpCoddecParameters. Sample input:
  	// a=rtpmap:111 opus/48000/2
  	SDPUtils.parseRtpMap = function(line) {
  	  let parts = line.substr(9).split(' ');
  	  const parsed = {
  	    payloadType: parseInt(parts.shift(), 10), // was: id
  	  };

  	  parts = parts[0].split('/');

  	  parsed.name = parts[0];
  	  parsed.clockRate = parseInt(parts[1], 10); // was: clockrate
  	  parsed.channels = parts.length === 3 ? parseInt(parts[2], 10) : 1;
  	  // legacy alias, got renamed back to channels in ORTC.
  	  parsed.numChannels = parsed.channels;
  	  return parsed;
  	};

  	// Generates a rtpmap line from RTCRtpCodecCapability or
  	// RTCRtpCodecParameters.
  	SDPUtils.writeRtpMap = function(codec) {
  	  let pt = codec.payloadType;
  	  if (codec.preferredPayloadType !== undefined) {
  	    pt = codec.preferredPayloadType;
  	  }
  	  const channels = codec.channels || codec.numChannels || 1;
  	  return 'a=rtpmap:' + pt + ' ' + codec.name + '/' + codec.clockRate +
  	      (channels !== 1 ? '/' + channels : '') + '\r\n';
  	};

  	// Parses a extmap line (headerextension from RFC 5285). Sample input:
  	// a=extmap:2 urn:ietf:params:rtp-hdrext:toffset
  	// a=extmap:2/sendonly urn:ietf:params:rtp-hdrext:toffset
  	SDPUtils.parseExtmap = function(line) {
  	  const parts = line.substr(9).split(' ');
  	  return {
  	    id: parseInt(parts[0], 10),
  	    direction: parts[0].indexOf('/') > 0 ? parts[0].split('/')[1] : 'sendrecv',
  	    uri: parts[1],
  	  };
  	};

  	// Generates an extmap line from RTCRtpHeaderExtensionParameters or
  	// RTCRtpHeaderExtension.
  	SDPUtils.writeExtmap = function(headerExtension) {
  	  return 'a=extmap:' + (headerExtension.id || headerExtension.preferredId) +
  	      (headerExtension.direction && headerExtension.direction !== 'sendrecv'
  	        ? '/' + headerExtension.direction
  	        : '') +
  	      ' ' + headerExtension.uri + '\r\n';
  	};

  	// Parses a fmtp line, returns dictionary. Sample input:
  	// a=fmtp:96 vbr=on;cng=on
  	// Also deals with vbr=on; cng=on
  	SDPUtils.parseFmtp = function(line) {
  	  const parsed = {};
  	  let kv;
  	  const parts = line.substr(line.indexOf(' ') + 1).split(';');
  	  for (let j = 0; j < parts.length; j++) {
  	    kv = parts[j].trim().split('=');
  	    parsed[kv[0].trim()] = kv[1];
  	  }
  	  return parsed;
  	};

  	// Generates a fmtp line from RTCRtpCodecCapability or RTCRtpCodecParameters.
  	SDPUtils.writeFmtp = function(codec) {
  	  let line = '';
  	  let pt = codec.payloadType;
  	  if (codec.preferredPayloadType !== undefined) {
  	    pt = codec.preferredPayloadType;
  	  }
  	  if (codec.parameters && Object.keys(codec.parameters).length) {
  	    const params = [];
  	    Object.keys(codec.parameters).forEach(param => {
  	      if (codec.parameters[param] !== undefined) {
  	        params.push(param + '=' + codec.parameters[param]);
  	      } else {
  	        params.push(param);
  	      }
  	    });
  	    line += 'a=fmtp:' + pt + ' ' + params.join(';') + '\r\n';
  	  }
  	  return line;
  	};

  	// Parses a rtcp-fb line, returns RTCPRtcpFeedback object. Sample input:
  	// a=rtcp-fb:98 nack rpsi
  	SDPUtils.parseRtcpFb = function(line) {
  	  const parts = line.substr(line.indexOf(' ') + 1).split(' ');
  	  return {
  	    type: parts.shift(),
  	    parameter: parts.join(' '),
  	  };
  	};

  	// Generate a=rtcp-fb lines from RTCRtpCodecCapability or RTCRtpCodecParameters.
  	SDPUtils.writeRtcpFb = function(codec) {
  	  let lines = '';
  	  let pt = codec.payloadType;
  	  if (codec.preferredPayloadType !== undefined) {
  	    pt = codec.preferredPayloadType;
  	  }
  	  if (codec.rtcpFeedback && codec.rtcpFeedback.length) {
  	    // FIXME: special handling for trr-int?
  	    codec.rtcpFeedback.forEach(fb => {
  	      lines += 'a=rtcp-fb:' + pt + ' ' + fb.type +
  	      (fb.parameter && fb.parameter.length ? ' ' + fb.parameter : '') +
  	          '\r\n';
  	    });
  	  }
  	  return lines;
  	};

  	// Parses a RFC 5576 ssrc media attribute. Sample input:
  	// a=ssrc:3735928559 cname:something
  	SDPUtils.parseSsrcMedia = function(line) {
  	  const sp = line.indexOf(' ');
  	  const parts = {
  	    ssrc: parseInt(line.substr(7, sp - 7), 10),
  	  };
  	  const colon = line.indexOf(':', sp);
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
  	SDPUtils.parseSsrcGroup = function(line) {
  	  const parts = line.substr(13).split(' ');
  	  return {
  	    semantics: parts.shift(),
  	    ssrcs: parts.map(ssrc => parseInt(ssrc, 10)),
  	  };
  	};

  	// Extracts the MID (RFC 5888) from a media section.
  	// Returns the MID or undefined if no mid line was found.
  	SDPUtils.getMid = function(mediaSection) {
  	  const mid = SDPUtils.matchPrefix(mediaSection, 'a=mid:')[0];
  	  if (mid) {
  	    return mid.substr(6);
  	  }
  	};

  	// Parses a fingerprint line for DTLS-SRTP.
  	SDPUtils.parseFingerprint = function(line) {
  	  const parts = line.substr(14).split(' ');
  	  return {
  	    algorithm: parts[0].toLowerCase(), // algorithm is case-sensitive in Edge.
  	    value: parts[1].toUpperCase(), // the definition is upper-case in RFC 4572.
  	  };
  	};

  	// Extracts DTLS parameters from SDP media section or sessionpart.
  	// FIXME: for consistency with other functions this should only
  	//   get the fingerprint line as input. See also getIceParameters.
  	SDPUtils.getDtlsParameters = function(mediaSection, sessionpart) {
  	  const lines = SDPUtils.matchPrefix(mediaSection + sessionpart,
  	    'a=fingerprint:');
  	  // Note: a=setup line is ignored since we use the 'auto' role in Edge.
  	  return {
  	    role: 'auto',
  	    fingerprints: lines.map(SDPUtils.parseFingerprint),
  	  };
  	};

  	// Serializes DTLS parameters to SDP.
  	SDPUtils.writeDtlsParameters = function(params, setupType) {
  	  let sdp = 'a=setup:' + setupType + '\r\n';
  	  params.fingerprints.forEach(fp => {
  	    sdp += 'a=fingerprint:' + fp.algorithm + ' ' + fp.value + '\r\n';
  	  });
  	  return sdp;
  	};

  	// Parses a=crypto lines into
  	//   https://rawgit.com/aboba/edgertc/master/msortc-rs4.html#dictionary-rtcsrtpsdesparameters-members
  	SDPUtils.parseCryptoLine = function(line) {
  	  const parts = line.substr(9).split(' ');
  	  return {
  	    tag: parseInt(parts[0], 10),
  	    cryptoSuite: parts[1],
  	    keyParams: parts[2],
  	    sessionParams: parts.slice(3),
  	  };
  	};

  	SDPUtils.writeCryptoLine = function(parameters) {
  	  return 'a=crypto:' + parameters.tag + ' ' +
  	    parameters.cryptoSuite + ' ' +
  	    (typeof parameters.keyParams === 'object'
  	      ? SDPUtils.writeCryptoKeyParams(parameters.keyParams)
  	      : parameters.keyParams) +
  	    (parameters.sessionParams ? ' ' + parameters.sessionParams.join(' ') : '') +
  	    '\r\n';
  	};

  	// Parses the crypto key parameters into
  	//   https://rawgit.com/aboba/edgertc/master/msortc-rs4.html#rtcsrtpkeyparam*
  	SDPUtils.parseCryptoKeyParams = function(keyParams) {
  	  if (keyParams.indexOf('inline:') !== 0) {
  	    return null;
  	  }
  	  const parts = keyParams.substr(7).split('|');
  	  return {
  	    keyMethod: 'inline',
  	    keySalt: parts[0],
  	    lifeTime: parts[1],
  	    mkiValue: parts[2] ? parts[2].split(':')[0] : undefined,
  	    mkiLength: parts[2] ? parts[2].split(':')[1] : undefined,
  	  };
  	};

  	SDPUtils.writeCryptoKeyParams = function(keyParams) {
  	  return keyParams.keyMethod + ':'
  	    + keyParams.keySalt +
  	    (keyParams.lifeTime ? '|' + keyParams.lifeTime : '') +
  	    (keyParams.mkiValue && keyParams.mkiLength
  	      ? '|' + keyParams.mkiValue + ':' + keyParams.mkiLength
  	      : '');
  	};

  	// Extracts all SDES parameters.
  	SDPUtils.getCryptoParameters = function(mediaSection, sessionpart) {
  	  const lines = SDPUtils.matchPrefix(mediaSection + sessionpart,
  	    'a=crypto:');
  	  return lines.map(SDPUtils.parseCryptoLine);
  	};

  	// Parses ICE information from SDP media section or sessionpart.
  	// FIXME: for consistency with other functions this should only
  	//   get the ice-ufrag and ice-pwd lines as input.
  	SDPUtils.getIceParameters = function(mediaSection, sessionpart) {
  	  const ufrag = SDPUtils.matchPrefix(mediaSection + sessionpart,
  	    'a=ice-ufrag:')[0];
  	  const pwd = SDPUtils.matchPrefix(mediaSection + sessionpart,
  	    'a=ice-pwd:')[0];
  	  if (!(ufrag && pwd)) {
  	    return null;
  	  }
  	  return {
  	    usernameFragment: ufrag.substr(12),
  	    password: pwd.substr(10),
  	  };
  	};

  	// Serializes ICE parameters to SDP.
  	SDPUtils.writeIceParameters = function(params) {
  	  let sdp = 'a=ice-ufrag:' + params.usernameFragment + '\r\n' +
  	      'a=ice-pwd:' + params.password + '\r\n';
  	  if (params.iceLite) {
  	    sdp += 'a=ice-lite\r\n';
  	  }
  	  return sdp;
  	};

  	// Parses the SDP media section and returns RTCRtpParameters.
  	SDPUtils.parseRtpParameters = function(mediaSection) {
  	  const description = {
  	    codecs: [],
  	    headerExtensions: [],
  	    fecMechanisms: [],
  	    rtcp: [],
  	  };
  	  const lines = SDPUtils.splitLines(mediaSection);
  	  const mline = lines[0].split(' ');
  	  for (let i = 3; i < mline.length; i++) { // find all codecs from mline[3..]
  	    const pt = mline[i];
  	    const rtpmapline = SDPUtils.matchPrefix(
  	      mediaSection, 'a=rtpmap:' + pt + ' ')[0];
  	    if (rtpmapline) {
  	      const codec = SDPUtils.parseRtpMap(rtpmapline);
  	      const fmtps = SDPUtils.matchPrefix(
  	        mediaSection, 'a=fmtp:' + pt + ' ');
  	      // Only the first a=fmtp:<pt> is considered.
  	      codec.parameters = fmtps.length ? SDPUtils.parseFmtp(fmtps[0]) : {};
  	      codec.rtcpFeedback = SDPUtils.matchPrefix(
  	        mediaSection, 'a=rtcp-fb:' + pt + ' ')
  	        .map(SDPUtils.parseRtcpFb);
  	      description.codecs.push(codec);
  	      // parse FEC mechanisms from rtpmap lines.
  	      switch (codec.name.toUpperCase()) {
  	        case 'RED':
  	        case 'ULPFEC':
  	          description.fecMechanisms.push(codec.name.toUpperCase());
  	          break;
  	      }
  	    }
  	  }
  	  SDPUtils.matchPrefix(mediaSection, 'a=extmap:').forEach(line => {
  	    description.headerExtensions.push(SDPUtils.parseExtmap(line));
  	  });
  	  // FIXME: parse rtcp.
  	  return description;
  	};

  	// Generates parts of the SDP media section describing the capabilities /
  	// parameters.
  	SDPUtils.writeRtpDescription = function(kind, caps) {
  	  let sdp = '';

  	  // Build the mline.
  	  sdp += 'm=' + kind + ' ';
  	  sdp += caps.codecs.length > 0 ? '9' : '0'; // reject if no codecs.
  	  sdp += ' UDP/TLS/RTP/SAVPF ';
  	  sdp += caps.codecs.map(codec => {
  	    if (codec.preferredPayloadType !== undefined) {
  	      return codec.preferredPayloadType;
  	    }
  	    return codec.payloadType;
  	  }).join(' ') + '\r\n';

  	  sdp += 'c=IN IP4 0.0.0.0\r\n';
  	  sdp += 'a=rtcp:9 IN IP4 0.0.0.0\r\n';

  	  // Add a=rtpmap lines for each codec. Also fmtp and rtcp-fb.
  	  caps.codecs.forEach(codec => {
  	    sdp += SDPUtils.writeRtpMap(codec);
  	    sdp += SDPUtils.writeFmtp(codec);
  	    sdp += SDPUtils.writeRtcpFb(codec);
  	  });
  	  let maxptime = 0;
  	  caps.codecs.forEach(codec => {
  	    if (codec.maxptime > maxptime) {
  	      maxptime = codec.maxptime;
  	    }
  	  });
  	  if (maxptime > 0) {
  	    sdp += 'a=maxptime:' + maxptime + '\r\n';
  	  }

  	  if (caps.headerExtensions) {
  	    caps.headerExtensions.forEach(extension => {
  	      sdp += SDPUtils.writeExtmap(extension);
  	    });
  	  }
  	  // FIXME: write fecMechanisms.
  	  return sdp;
  	};

  	// Parses the SDP media section and returns an array of
  	// RTCRtpEncodingParameters.
  	SDPUtils.parseRtpEncodingParameters = function(mediaSection) {
  	  const encodingParameters = [];
  	  const description = SDPUtils.parseRtpParameters(mediaSection);
  	  const hasRed = description.fecMechanisms.indexOf('RED') !== -1;
  	  const hasUlpfec = description.fecMechanisms.indexOf('ULPFEC') !== -1;

  	  // filter a=ssrc:... cname:, ignore PlanB-msid
  	  const ssrcs = SDPUtils.matchPrefix(mediaSection, 'a=ssrc:')
  	    .map(line => SDPUtils.parseSsrcMedia(line))
  	    .filter(parts => parts.attribute === 'cname');
  	  const primarySsrc = ssrcs.length > 0 && ssrcs[0].ssrc;
  	  let secondarySsrc;

  	  const flows = SDPUtils.matchPrefix(mediaSection, 'a=ssrc-group:FID')
  	    .map(line => {
  	      const parts = line.substr(17).split(' ');
  	      return parts.map(part => parseInt(part, 10));
  	    });
  	  if (flows.length > 0 && flows[0].length > 1 && flows[0][0] === primarySsrc) {
  	    secondarySsrc = flows[0][1];
  	  }

  	  description.codecs.forEach(codec => {
  	    if (codec.name.toUpperCase() === 'RTX' && codec.parameters.apt) {
  	      let encParam = {
  	        ssrc: primarySsrc,
  	        codecPayloadType: parseInt(codec.parameters.apt, 10),
  	      };
  	      if (primarySsrc && secondarySsrc) {
  	        encParam.rtx = {ssrc: secondarySsrc};
  	      }
  	      encodingParameters.push(encParam);
  	      if (hasRed) {
  	        encParam = JSON.parse(JSON.stringify(encParam));
  	        encParam.fec = {
  	          ssrc: primarySsrc,
  	          mechanism: hasUlpfec ? 'red+ulpfec' : 'red',
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
  	  let bandwidth = SDPUtils.matchPrefix(mediaSection, 'b=');
  	  if (bandwidth.length) {
  	    if (bandwidth[0].indexOf('b=TIAS:') === 0) {
  	      bandwidth = parseInt(bandwidth[0].substr(7), 10);
  	    } else if (bandwidth[0].indexOf('b=AS:') === 0) {
  	      // use formula from JSEP to convert b=AS to TIAS value.
  	      bandwidth = parseInt(bandwidth[0].substr(5), 10) * 1000 * 0.95
  	          - (50 * 40 * 8);
  	    } else {
  	      bandwidth = undefined;
  	    }
  	    encodingParameters.forEach(params => {
  	      params.maxBitrate = bandwidth;
  	    });
  	  }
  	  return encodingParameters;
  	};

  	// parses http://draft.ortc.org/#rtcrtcpparameters*
  	SDPUtils.parseRtcpParameters = function(mediaSection) {
  	  const rtcpParameters = {};

  	  // Gets the first SSRC. Note that with RTX there might be multiple
  	  // SSRCs.
  	  const remoteSsrc = SDPUtils.matchPrefix(mediaSection, 'a=ssrc:')
  	    .map(line => SDPUtils.parseSsrcMedia(line))
  	    .filter(obj => obj.attribute === 'cname')[0];
  	  if (remoteSsrc) {
  	    rtcpParameters.cname = remoteSsrc.value;
  	    rtcpParameters.ssrc = remoteSsrc.ssrc;
  	  }

  	  // Edge uses the compound attribute instead of reducedSize
  	  // compound is !reducedSize
  	  const rsize = SDPUtils.matchPrefix(mediaSection, 'a=rtcp-rsize');
  	  rtcpParameters.reducedSize = rsize.length > 0;
  	  rtcpParameters.compound = rsize.length === 0;

  	  // parses the rtcp-mux attrіbute.
  	  // Note that Edge does not support unmuxed RTCP.
  	  const mux = SDPUtils.matchPrefix(mediaSection, 'a=rtcp-mux');
  	  rtcpParameters.mux = mux.length > 0;

  	  return rtcpParameters;
  	};

  	SDPUtils.writeRtcpParameters = function(rtcpParameters) {
  	  let sdp = '';
  	  if (rtcpParameters.reducedSize) {
  	    sdp += 'a=rtcp-rsize\r\n';
  	  }
  	  if (rtcpParameters.mux) {
  	    sdp += 'a=rtcp-mux\r\n';
  	  }
  	  if (rtcpParameters.ssrc !== undefined && rtcpParameters.cname) {
  	    sdp += 'a=ssrc:' + rtcpParameters.ssrc +
  	      ' cname:' + rtcpParameters.cname + '\r\n';
  	  }
  	  return sdp;
  	};


  	// parses either a=msid: or a=ssrc:... msid lines and returns
  	// the id of the MediaStream and MediaStreamTrack.
  	SDPUtils.parseMsid = function(mediaSection) {
  	  let parts;
  	  const spec = SDPUtils.matchPrefix(mediaSection, 'a=msid:');
  	  if (spec.length === 1) {
  	    parts = spec[0].substr(7).split(' ');
  	    return {stream: parts[0], track: parts[1]};
  	  }
  	  const planB = SDPUtils.matchPrefix(mediaSection, 'a=ssrc:')
  	    .map(line => SDPUtils.parseSsrcMedia(line))
  	    .filter(msidParts => msidParts.attribute === 'msid');
  	  if (planB.length > 0) {
  	    parts = planB[0].value.split(' ');
  	    return {stream: parts[0], track: parts[1]};
  	  }
  	};

  	// SCTP
  	// parses draft-ietf-mmusic-sctp-sdp-26 first and falls back
  	// to draft-ietf-mmusic-sctp-sdp-05
  	SDPUtils.parseSctpDescription = function(mediaSection) {
  	  const mline = SDPUtils.parseMLine(mediaSection);
  	  const maxSizeLine = SDPUtils.matchPrefix(mediaSection, 'a=max-message-size:');
  	  let maxMessageSize;
  	  if (maxSizeLine.length > 0) {
  	    maxMessageSize = parseInt(maxSizeLine[0].substr(19), 10);
  	  }
  	  if (isNaN(maxMessageSize)) {
  	    maxMessageSize = 65536;
  	  }
  	  const sctpPort = SDPUtils.matchPrefix(mediaSection, 'a=sctp-port:');
  	  if (sctpPort.length > 0) {
  	    return {
  	      port: parseInt(sctpPort[0].substr(12), 10),
  	      protocol: mline.fmt,
  	      maxMessageSize,
  	    };
  	  }
  	  const sctpMapLines = SDPUtils.matchPrefix(mediaSection, 'a=sctpmap:');
  	  if (sctpMapLines.length > 0) {
  	    const parts = sctpMapLines[0]
  	      .substr(10)
  	      .split(' ');
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
  	SDPUtils.writeSctpDescription = function(media, sctp) {
  	  let output = [];
  	  if (media.protocol !== 'DTLS/SCTP') {
  	    output = [
  	      'm=' + media.kind + ' 9 ' + media.protocol + ' ' + sctp.protocol + '\r\n',
  	      'c=IN IP4 0.0.0.0\r\n',
  	      'a=sctp-port:' + sctp.port + '\r\n',
  	    ];
  	  } else {
  	    output = [
  	      'm=' + media.kind + ' 9 ' + media.protocol + ' ' + sctp.port + '\r\n',
  	      'c=IN IP4 0.0.0.0\r\n',
  	      'a=sctpmap:' + sctp.port + ' ' + sctp.protocol + ' 65535\r\n',
  	    ];
  	  }
  	  if (sctp.maxMessageSize !== undefined) {
  	    output.push('a=max-message-size:' + sctp.maxMessageSize + '\r\n');
  	  }
  	  return output.join('');
  	};

  	// Generate a session ID for SDP.
  	// https://tools.ietf.org/html/draft-ietf-rtcweb-jsep-20#section-5.2.1
  	// recommends using a cryptographically random +ve 64-bit value
  	// but right now this should be acceptable and within the right range
  	SDPUtils.generateSessionId = function() {
  	  return Math.random().toString().substr(2, 21);
  	};

  	// Write boiler plate for start of SDP
  	// sessId argument is optional - if not supplied it will
  	// be generated randomly
  	// sessVersion is optional and defaults to 2
  	// sessUser is optional and defaults to 'thisisadapterortc'
  	SDPUtils.writeSessionBoilerplate = function(sessId, sessVer, sessUser) {
  	  let sessionId;
  	  const version = sessVer !== undefined ? sessVer : 2;
  	  if (sessId) {
  	    sessionId = sessId;
  	  } else {
  	    sessionId = SDPUtils.generateSessionId();
  	  }
  	  const user = sessUser || 'thisisadapterortc';
  	  // FIXME: sess-id should be an NTP timestamp.
  	  return 'v=0\r\n' +
  	      'o=' + user + ' ' + sessionId + ' ' + version +
  	        ' IN IP4 127.0.0.1\r\n' +
  	      's=-\r\n' +
  	      't=0 0\r\n';
  	};

  	// Gets the direction from the mediaSection or the sessionpart.
  	SDPUtils.getDirection = function(mediaSection, sessionpart) {
  	  // Look for sendrecv, sendonly, recvonly, inactive, default to sendrecv.
  	  const lines = SDPUtils.splitLines(mediaSection);
  	  for (let i = 0; i < lines.length; i++) {
  	    switch (lines[i]) {
  	      case 'a=sendrecv':
  	      case 'a=sendonly':
  	      case 'a=recvonly':
  	      case 'a=inactive':
  	        return lines[i].substr(2);
  	        // FIXME: What should happen here?
  	    }
  	  }
  	  if (sessionpart) {
  	    return SDPUtils.getDirection(sessionpart);
  	  }
  	  return 'sendrecv';
  	};

  	SDPUtils.getKind = function(mediaSection) {
  	  const lines = SDPUtils.splitLines(mediaSection);
  	  const mline = lines[0].split(' ');
  	  return mline[0].substr(2);
  	};

  	SDPUtils.isRejected = function(mediaSection) {
  	  return mediaSection.split(' ', 2)[1] === '0';
  	};

  	SDPUtils.parseMLine = function(mediaSection) {
  	  const lines = SDPUtils.splitLines(mediaSection);
  	  const parts = lines[0].substr(2).split(' ');
  	  return {
  	    kind: parts[0],
  	    port: parseInt(parts[1], 10),
  	    protocol: parts[2],
  	    fmt: parts.slice(3).join(' '),
  	  };
  	};

  	SDPUtils.parseOLine = function(mediaSection) {
  	  const line = SDPUtils.matchPrefix(mediaSection, 'o=')[0];
  	  const parts = line.substr(2).split(' ');
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
  	SDPUtils.isValidSDP = function(blob) {
  	  if (typeof blob !== 'string' || blob.length === 0) {
  	    return false;
  	  }
  	  const lines = SDPUtils.splitLines(blob);
  	  for (let i = 0; i < lines.length; i++) {
  	    if (lines[i].length < 2 || lines[i].charAt(1) !== '=') {
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
  } (sdp$1));

  var SDPUtils = sdp$1.exports;

  var sdp = /*#__PURE__*/_mergeNamespaces({
    __proto__: null,
    default: SDPUtils
  }, [sdp$1.exports]);

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
    if (!window.RTCIceCandidate || (window.RTCIceCandidate && 'foundation' in
        window.RTCIceCandidate.prototype)) {
      return;
    }

    const NativeRTCIceCandidate = window.RTCIceCandidate;
    window.RTCIceCandidate = function RTCIceCandidate(args) {
      // Remove the a= which shouldn't be part of the candidate string.
      if (typeof args === 'object' && args.candidate &&
          args.candidate.indexOf('a=') === 0) {
        args = JSON.parse(JSON.stringify(args));
        args.candidate = args.candidate.substr(2);
      }

      if (args.candidate && args.candidate.length) {
        // Augment the native candidate with the parsed fields.
        const nativeCandidate = new NativeRTCIceCandidate(args);
        const parsedCandidate = SDPUtils.parseCandidate(args.candidate);
        const augmentedCandidate = Object.assign(nativeCandidate,
            parsedCandidate);

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
    wrapPeerConnectionEvent(window, 'icecandidate', e => {
      if (e.candidate) {
        Object.defineProperty(e, 'candidate', {
          value: new window.RTCIceCandidate(e.candidate),
          writable: 'false'
        });
      }
      return e;
    });
  }

  function shimRTCIceCandidateRelayProtocol(window) {
    if (!window.RTCIceCandidate || (window.RTCIceCandidate && 'relayProtocol' in
        window.RTCIceCandidate.prototype)) {
      return;
    }

    // Hook up the augmented candidate in onicecandidate and
    // addEventListener('icecandidate', ...)
    wrapPeerConnectionEvent(window, 'icecandidate', e => {
      if (e.candidate) {
        const parsedCandidate = SDPUtils.parseCandidate(e.candidate.candidate);
        if (parsedCandidate.type === 'relay') {
          // This is a libwebrtc-specific mapping of local type preference
          // to relayProtocol.
          e.candidate.relayProtocol = {
            0: 'tls',
            1: 'tcp',
            2: 'udp',
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

    if (!('sctp' in window.RTCPeerConnection.prototype)) {
      Object.defineProperty(window.RTCPeerConnection.prototype, 'sctp', {
        get() {
          return typeof this._sctp === 'undefined' ? null : this._sctp;
        }
      });
    }

    const sctpInDescription = function(description) {
      if (!description || !description.sdp) {
        return false;
      }
      const sections = SDPUtils.splitSections(description.sdp);
      sections.shift();
      return sections.some(mediaSection => {
        const mLine = SDPUtils.parseMLine(mediaSection);
        return mLine && mLine.kind === 'application'
            && mLine.protocol.indexOf('SCTP') !== -1;
      });
    };

    const getRemoteFirefoxVersion = function(description) {
      // TODO: Is there a better solution for detecting Firefox?
      const match = description.sdp.match(/mozilla...THIS_IS_SDPARTA-(\d+)/);
      if (match === null || match.length < 2) {
        return -1;
      }
      const version = parseInt(match[1], 10);
      // Test for NaN (yes, this is ugly)
      return version !== version ? -1 : version;
    };

    const getCanSendMaxMessageSize = function(remoteIsFirefox) {
      // Every implementation we know can send at least 64 KiB.
      // Note: Although Chrome is technically able to send up to 256 KiB, the
      //       data does not reach the other peer reliably.
      //       See: https://bugs.chromium.org/p/webrtc/issues/detail?id=8419
      let canSendMaxMessageSize = 65536;
      if (browserDetails.browser === 'firefox') {
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

    const getMaxMessageSize = function(description, remoteIsFirefox) {
      // Note: 65536 bytes is the default value from the SDP spec. Also,
      //       every implementation we know supports receiving 65536 bytes.
      let maxMessageSize = 65536;

      // FF 57 has a slightly incorrect default remote max message size, so
      // we need to adjust it here to avoid a failure when sending.
      // See: https://bugzilla.mozilla.org/show_bug.cgi?id=1425697
      if (browserDetails.browser === 'firefox'
           && browserDetails.version === 57) {
        maxMessageSize = 65535;
      }

      const match = SDPUtils.matchPrefix(description.sdp,
        'a=max-message-size:');
      if (match.length > 0) {
        maxMessageSize = parseInt(match[0].substr(19), 10);
      } else if (browserDetails.browser === 'firefox' &&
                  remoteIsFirefox !== -1) {
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
        if (browserDetails.browser === 'chrome' && browserDetails.version >= 76) {
          const {sdpSemantics} = this.getConfiguration();
          if (sdpSemantics === 'plan-b') {
            Object.defineProperty(this, 'sctp', {
              get() {
                return typeof this._sctp === 'undefined' ? null : this._sctp;
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
          Object.defineProperty(sctp, 'maxMessageSize', {
            get() {
              return maxMessageSize;
            }
          });
          this._sctp = sctp;
        }

        return origSetRemoteDescription.apply(this, arguments);
      };
  }

  function shimSendThrowTypeError(window) {
    if (!(window.RTCPeerConnection &&
        'createDataChannel' in window.RTCPeerConnection.prototype)) {
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
        if (dc.readyState === 'open' &&
            pc.sctp && length > pc.sctp.maxMessageSize) {
          throw new TypeError('Message too large (can send a maximum of ' +
            pc.sctp.maxMessageSize + ' bytes)');
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
    wrapPeerConnectionEvent(window, 'datachannel', e => {
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
    if (!window.RTCPeerConnection ||
        'connectionState' in window.RTCPeerConnection.prototype) {
      return;
    }
    const proto = window.RTCPeerConnection.prototype;
    Object.defineProperty(proto, 'connectionState', {
      get() {
        return {
          completed: 'connected',
          checking: 'connecting'
        }[this.iceConnectionState] || this.iceConnectionState;
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(proto, 'onconnectionstatechange', {
      get() {
        return this._onconnectionstatechange || null;
      },
      set(cb) {
        if (this._onconnectionstatechange) {
          this.removeEventListener('connectionstatechange',
              this._onconnectionstatechange);
          delete this._onconnectionstatechange;
        }
        if (cb) {
          this.addEventListener('connectionstatechange',
              this._onconnectionstatechange = cb);
        }
      },
      enumerable: true,
      configurable: true
    });

    ['setLocalDescription', 'setRemoteDescription'].forEach((method) => {
      const origMethod = proto[method];
      proto[method] = function() {
        if (!this._connectionstatechangepoly) {
          this._connectionstatechangepoly = e => {
            const pc = e.target;
            if (pc._lastConnectionState !== pc.connectionState) {
              pc._lastConnectionState = pc.connectionState;
              const newEvent = new Event('connectionstatechange', e);
              pc.dispatchEvent(newEvent);
            }
            return e;
          };
          this.addEventListener('iceconnectionstatechange',
            this._connectionstatechangepoly);
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
    if (browserDetails.browser === 'chrome' && browserDetails.version >= 71) {
      return;
    }
    if (browserDetails.browser === 'safari' && browserDetails.version >= 605) {
      return;
    }
    const nativeSRD = window.RTCPeerConnection.prototype.setRemoteDescription;
    window.RTCPeerConnection.prototype.setRemoteDescription =
    function setRemoteDescription(desc) {
      if (desc && desc.sdp && desc.sdp.indexOf('\na=extmap-allow-mixed') !== -1) {
        const sdp = desc.sdp.split('\n').filter((line) => {
          return line.trim() !== 'a=extmap-allow-mixed';
        }).join('\n');
        // Safari enforces read-only-ness of RTCSessionDescription fields.
        if (window.RTCSessionDescription &&
            desc instanceof window.RTCSessionDescription) {
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
        if (((browserDetails.browser === 'chrome' && browserDetails.version < 78)
             || (browserDetails.browser === 'firefox'
                 && browserDetails.version < 68)
             || (browserDetails.browser === 'safari'))
            && arguments[0] && arguments[0].candidate === '') {
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
    if (!nativeSetLocalDescription || nativeSetLocalDescription.length === 0) {
      return;
    }
    window.RTCPeerConnection.prototype.setLocalDescription =
      function setLocalDescription() {
        let desc = arguments[0] || {};
        if (typeof desc !== 'object' || (desc.type && desc.sdp)) {
          return nativeSetLocalDescription.apply(this, arguments);
        }
        // The remaining steps should technically happen when SLD comes off the
        // RTCPeerConnection's operations chain (not ahead of going on it), but
        // this is too difficult to shim. Instead, this shim only covers the
        // common case where the operations chain is empty. This is imperfect, but
        // should cover many cases. Rationale: Even if we can't reduce the glare
        // window to zero on imperfect implementations, there's value in tapping
        // into the perfect negotiation pattern that several browsers support.
        desc = {type: desc.type, sdp: desc.sdp};
        if (!desc.type) {
          switch (this.signalingState) {
            case 'stable':
            case 'have-local-offer':
            case 'have-remote-pranswer':
              desc.type = 'offer';
              break;
            default:
              desc.type = 'answer';
              break;
          }
        }
        if (desc.sdp || (desc.type !== 'offer' && desc.type !== 'answer')) {
          return nativeSetLocalDescription.apply(this, [desc]);
        }
        const func = desc.type === 'offer' ? this.createOffer : this.createAnswer;
        return func.apply(this)
          .then(d => nativeSetLocalDescription.apply(this, [d]));
      };
  }

  var commonShim = /*#__PURE__*/Object.freeze({
    __proto__: null,
    shimRTCIceCandidate: shimRTCIceCandidate,
    shimRTCIceCandidateRelayProtocol: shimRTCIceCandidateRelayProtocol,
    shimMaxMessageSize: shimMaxMessageSize,
    shimSendThrowTypeError: shimSendThrowTypeError,
    shimConnectionState: shimConnectionState,
    removeExtmapAllowMixed: removeExtmapAllowMixed,
    shimAddIceCandidateNullOrEmpty: shimAddIceCandidateNullOrEmpty,
    shimParameterlessSetLocalDescription: shimParameterlessSetLocalDescription
  });

  /*
   *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
   *
   *  Use of this source code is governed by a BSD-style license
   *  that can be found in the LICENSE file in the root of the source
   *  tree.
   */

  // Shimming starts here.
  function adapterFactory({window} = {}, options = {
    shimChrome: true,
    shimFirefox: true,
    shimSafari: true,
  }) {
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
      case 'chrome':
        if (!chromeShim || !shimPeerConnection$1 ||
            !options.shimChrome) {
          logging('Chrome shim is not included in this adapter release.');
          return adapter;
        }
        if (browserDetails.version === null) {
          logging('Chrome shim can not determine version, not shimming.');
          return adapter;
        }
        logging('adapter.js shimming chrome.');
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
      case 'firefox':
        if (!firefoxShim || !shimPeerConnection ||
            !options.shimFirefox) {
          logging('Firefox shim is not included in this adapter release.');
          return adapter;
        }
        logging('adapter.js shimming firefox.');
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
      case 'safari':
        if (!safariShim || !options.shimSafari) {
          logging('Safari shim is not included in this adapter release.');
          return adapter;
        }
        logging('adapter.js shimming safari.');
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
        logging('Unsupported browser!');
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

  adapterFactory({window: typeof window === 'undefined' ? undefined : window});

  function getParameter(key) {
    return _PARAMS[key];
  }

  function setParameter(key, value) {
    _PARAMS[key] = value;
  }

  const _PARAMS = {
    // 实时图像， 关闭可以减少一定性能占用
    open_graph: true,
    // 更新数据间隔， 间隔越大，损耗越小
    stats_update_interval: 1000,
    // container
    container: null,
  };

  window.RTC_INTERNALS__PARAMS = _PARAMS;

  const outContainer = document.createElement("div");
  outContainer.hidden = true;
  outContainer.className = "webrtc-internals-body-out";
  document.body.appendChild(outContainer);

  const body = document.createElement("div");
  body.id = "webrtc-internals-body";
  body.className = "webrtc-internals-body";
  body.innerHTML = `
<p id="content-root"></p>
<template id="td2-template"><td></td><td></td></template>
<template id="summary-template"><td><details><summary></summary></details></td></template>
<template id="container-template"><div></div><div><canvas></canvas></div></template>
<template id="summary-span-template"><summary><span></span></summary></template>
<template id="checkbox-template"><input type=checkbox checked></template>
<template id="trth-template"><tbody><tr><th colspan=2></th></tr></tbody></template>
<template id="td-colspan-template"><td colspan=2></td></template>
<template id="time-event-template"><tbody><tr><th>Time</th><th class="update-log-header-event">Event</th></tr></tbody></template>
<template id="dump-template">
  <div>
    <a>
      <button>Download the PeerConnection updates and stats data</button>
    </a>
    <label>
      <input type="checkbox">Compress result
    </label>
  </div>
  <p>
    <label>
      <input type="checkbox">Enable diagnostic audio recordings
    </label>
  </p>
  <p class="audio-diagnostic-dumps-info">A diagnostic audio recording is used for analyzing audio problems. It consists of several files and contains the audio played out to the speaker (output) and captured from the microphone (input). The data is saved locally. Checking this box will enable recordings of all ongoing input and output audio streams (including non-WebRTC streams) and for future audio streams. When the box is unchecked or this page is closed, all ongoing recordings will be stopped and this recording functionality disabled. Recording audio from multiple tabs is supported as well as multiple recordings from the same tab.</p>
  <p>When enabling, select a base filename to which the following suffixes will be added:</p>
  <div>&lt;base filename&gt;.&lt;render process ID&gt;.aec_dump.&lt;AEC dump recording ID&gt;</div>
  <div>&lt;base filename&gt;.input.&lt;stream recording ID&gt;.wav</div>
  <div>&lt;base filename&gt;.output.&lt;stream recording ID&gt;.wav</div>
  <p class="audio-diagnostic-dumps-info">It is recommended to choose a new base filename each time the feature is enabled to avoid ending up with partially overwritten or unusable audio files.</p>
  <p>
    <label>
      <input type="checkbox" disabled>Enable diagnostic packet and event recording
    </label>
  </p>
  <p class="audio-diagnostic-dumps-info">A diagnostic packet and event recording can be used for analyzing various issues related to thread starvation, jitter buffers or bandwidth estimation. Two types of data are logged. First, incoming and outgoing RTP headers and RTCP packets are logged. These do not include any audio or video information, nor any other types of personally identifiable information (so no IP addresses or URLs). Checking this box will enable the recording for ongoing WebRTC calls and for future WebRTC calls. When the box is unchecked or this page is closed, all ongoing recordings will be stopped and this recording functionality will be disabled for future WebRTC calls. Recording in multiple tabs or multiple recordings in the same tab will cause multiple log files to be created. When enabling, a filename for the recording can be entered. The entered filename is used as a base, to which the following suffixes will be appended.</p>
  <p>&lt;base filename&gt;_&lt;date&gt;_&lt;timestamp&gt;_&lt;render process ID&gt;_&lt;recording ID&gt;</p>
  <p class="audio-diagnostic-dumps-info">If a file with the same name already exists, it will be overwritten. No more than 5 logfiles  will be created, and each of them is limited to 60MB of storage.  On Android these limits are 3 files of at most 10MB each.  When the limit is reached, the checkbox must be unchecked and  rechecked to resume logging.</p>
</template>
<template id="stats-template">
  <div>
    Read stats From:
    <select id="statsSelectElement">
    </select>
    <p><b>Note:</b> computed stats are in []. Experimental stats are marked with an * at the end and do not show up in the getStats result.</p>
    <p id="legacy-stats-warning"><b>Note:</b> the callback-based getStats API and many of its goog-prefixed values are non-standard and may be removed from the getStats() API in the future.</p>
  </div>
</template>
`;
  outContainer.appendChild(body);

  const button = document.createElement("div");
  button.innerText = "WebRTC-Internals";
  button.className = "webrtc-internals-switch";
  document.body.appendChild(button);

  button.onclick = () => {
    outContainer.hidden = !outContainer.hidden;
  };

  setParameter("container", outContainer);

  const style = document.createElement("style");
  style.innerHTML = `
/* Copyright 2013 The Chromium Authors
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file. */

.webrtc-internals-body-out{
  position: fixed;
  background: white;
  top: 0;
  width: 100%;
  left: 0;
  height: 100%;
  z-index: 10000;
  max-width: 100vw;
  min-height: 100vh;
}

.webrtc-internals-body{
  overflow-y: auto;
  background: white;
  top: 0;
  width: 100%;
  left: 0;
  height: 100%;
  z-index: 10000;
}

.webrtc-internals-switch {
  left: 0px; 
  bottom: 0px; 
  display: block;
  position: fixed;
  cursor: pointer;
  color: #FFF;
  background-color:  #07c160;
  line-height: 1;
  font-size: 0.8em;
  padding: 0.61538462em 1.23076923em;
  z-index: 10000;
  border-radius: 0.30769231em;
  box-shadow: 0 0 0.61538462em rgb(0 0 0 / 40%);
}


.peer-connection-dump-root {
  font-size: 0.8em;
  padding-bottom: 3px;
}

.update-log-container {
  float: left;
  width: 50em;
  overflow: auto;
}

.update-log-failure {
  background-color: #be2026;
}

.update-log-legacy-api-usage {
  background-color: #fed14b;
}

.ssrc-info-block {
  color: #999;
  font-size: 0.8em;
}

.stats-graph-container {
  clear: both;
  margin: 0.5em 0 0.5em 0;
}

.stats-graph-sub-container {
  float: left;
  margin: 0.5em;
}

.stats-graph-sub-container > div {
  float: left;
}

.stats-graph-sub-container > div:first-child {
  float: none;
}

.stats-table-container {
  float: left;
  padding: 0 0 0 0;
  overflow: auto;
}

.stats-table-container >div:first-child {
  font-size: 0.8em;
  font-weight: bold;
  text-align: center;
  padding: 0 0 1em 0;
}

.stats-table-active-connection {
  font-weight: bold;
}

body {
  font-family: 'Lucida Grande', sans-serif;
}

table {
  border: none;
  margin: 0 1em 1em 0;
}

td {
  border: none;
  font-size: 0.8em;
  padding: 0 1em 0.5em 0;
  min-width: 10em;
  word-break: break-all;
}

table > tr {
  vertical-align: top;
}

th {
  border: none;
  font-size: 0.8em;
  padding: 0 0 0.5em 0;
}

.tab-head {
  background-color: rgb(220, 220, 220);
  margin: 10px 2px 0 2px;
  text-decoration: underline;
  cursor: pointer;
  display: inline-block;
  overflow: hidden;
  width: 20em;
  height: 3em;
}

.active-tab-head {
  background-color: turquoise;
  font-weight: bold;
}

.tab-body {
  height: 100%;
  overflow-y: auto;
  border: 1px solid turquoise;
  border-top-width: 3px;
  padding: 0 10px 500px 10px;
  display: none;
}

.active-tab-body {
  display: block;
}

.user-media-request-div-class {
  background-color: lightgray;
  margin: 10px 0 10px 0;
}

.user-media-request-div-class > div {
  margin: 5px 0 5px 0;
}

.audio-diagnostic-dumps-info {
  max-width: 60em;
}

details[open] details summary {
    background-color: rgb(220, 220, 220);
}

.peerconnection-deprecations {
  font-weight: bold;
}

.candidategrid tr {
    text-align: center;
    word-break: break-word;
}

.candidategrid-active {
  font-weight: bold;
}

.candidategrid-candidatepair {
    background-color: #ccc;
}

.candidategrid-candidatepair td:first-of-type {
    text-align: left;
}

.candidategrid-candidate {
    background-color: #ddd;
}

.candidategrid-candidate td:first-of-type {
    text-align: right;
}

#legacy-stats-warning {
    display: none;
}

`;
  document.head.appendChild(style);

  // Copyright (c) 2012 The Chromium Authors. All rights reserved.
  // Use of this source code is governed by a BSD-style license that can be
  // found in the LICENSE file.

  // // Copyright (c) 2013 The Chromium Authors. All rights reserved.
  // Use of this source code is governed by a BSD-style license that can be
  // found in the LICENSE file.

  /**
   * @fileoverview Assertion support.
   */

  /**
   * Verify |condition| is truthy and return |condition| if so.
   * @template T
   * @param {T} condition A condition to check for truthiness.  Note that this
   *     may be used to test whether a value is defined or not, and we don't want
   *     to force a cast to Boolean.
   * @param {string=} opt_message A message to show on failure.
   * @return {T} A non-null |condition|.
   */
  function assert(condition, opt_message) {
    if (!condition) {
      var message = "Assertion failed";
      if (opt_message) message = message + ": " + opt_message;
      var error = new Error(message);
      var global = (function () {
        return this;
      })();
      if (global.traceAssertionsForTesting) console.warn(error.stack);
      throw error;
    }
    return condition;
  }

  /**
   * Call this from places in the code that should never be reached.
   *
   * For example, handling all the values of enum with a switch() like this:
   *
   *   function getValueFromEnum(enum) {
   *     switch (enum) {
   *       case ENUM_FIRST_OF_TWO:
   *         return first
   *       case ENUM_LAST_OF_TWO:
   *         return last;
   *     }
   *     assertNotReached();
   *     return document;
   *   }
   *
   * This code should only be hit in the case of serious programmer error or
   * unexpected input.
   *
   * @param {string=} opt_message A message to show when this is hit.
   */
  function assertNotReached(opt_message) {
    assert(false, opt_message || "Unreachable code hit");
  }

  /**
   * @param {*} value The value to check.
   * @param {function(new: T, ...)} type A user-defined constructor.
   * @param {string=} opt_message A message to show when this is hit.
   * @return {T}
   * @template T
   */
  function assertInstanceof(value, type, opt_message) {
    // We don't use assert immediately here so that we avoid constructing an error
    // message if we don't have to.
    if (!(value instanceof type)) {
      assertNotReached(
        opt_message ||
          "Value " + value + " is not a[n] " + (type.name || typeof type)
      );
    }
    return value;
  }

  /**
   * Alias for document.getElementById. Found elements must be HTMLElements.
   * @param {string} id The ID of the element to find.
   * @return {HTMLElement} The found element or null if not found.
   */
  function $(id) {
    var el = document.getElementById(id);
    return el ? assertInstanceof(el, HTMLElement) : null;
  }

  // Copyright 2013 The Chromium Authors

  const MAX_NUMBER_OF_STATE_CHANGES_DISPLAYED = 10;
  const MAX_NUMBER_OF_EXPANDED_MEDIASECTIONS = 10;

  /**
   * Maintains the peer connection update log table.
   */
  class PeerConnectionUpdateTable {
    constructor() {
      /**
       * @type {string}
       * @const
       * @private
       */
      this.UPDATE_LOG_ID_SUFFIX_ = "-update-log";

      /**
       * @type {string}
       * @const
       * @private
       */
      this.UPDATE_LOG_CONTAINER_CLASS_ = "update-log-container";

      /**
       * @type {string}
       * @const
       * @private
       */
      this.UPDATE_LOG_TABLE_CLASS = "update-log-table";
    }

    /**
     * Adds the update to the update table as a new row. The type of the update
     * is set to the summary of the cell; clicking the cell will reveal or hide
     * the details as the content of a TextArea element.
     *
     * @param {!Element} peerConnectionElement The root element.
     * @param {!PeerConnectionUpdateEntry} update The update to add.
     */
    addPeerConnectionUpdate(peerConnectionElement, update) {
      // special to do @xiaoshumin, need to do better
      if (!update.value || JSON.stringify(update.value) === "{}") {
        update.value = "";
      }

      const tableElement = this.ensureUpdateContainer_(peerConnectionElement);

      const row = document.createElement("tr");
      tableElement.firstChild.appendChild(row);

      const time = new Date(parseFloat(update.time));
      const timeItem = document.createElement("td");
      timeItem.textContent = time.toLocaleString();
      row.appendChild(timeItem);

      // `type` is a display variant of update.type which does not get serialized
      // into chrome://webrtc-internals.
      let type = update.type;

      if (update.value.length === 0) {
        const typeItem = document.createElement("td");
        typeItem.textContent = type;
        row.appendChild(typeItem);
        return;
      }

      if (update.type === "icecandidate" || update.type === "addIceCandidate") {
        // adapt RTCPeerConnection, diff from .cc
        if (update.value instanceof RTCIceCandidate) {
          update.value = update.value.candidate;
        }
        // extract ICE candidate type from the field following typ.
        const candidateType = update.value.match(/(?: typ )(host|srflx|relay)/);
        if (candidateType) {
          type += " (" + candidateType[1] + ")";
        }
      } else if (
        update.type === "createOfferOnSuccess" ||
        update.type === "createAnswerOnSuccess"
      ) {
        this.setLastOfferAnswer_(tableElement, update);
      } else if (update.type === "setLocalDescription") {
        if (update.value !== this.getLastOfferAnswer_(tableElement)) {
          type += " (munged)";
        }
      } else if (update.type === "setConfiguration") {
        // Update the configuration that is displayed at the top.
        peerConnectionElement.firstChild.children[2].textContent = update.value;
      } else if (
        [
          "iceconnectionstatechange",
          "connectionstatechange",
          "signalingstatechange",
        ].includes(update.type)
      ) {
        const fieldName = {
          iceconnectionstatechange: "iceconnectionstate",
          connectionstatechange: "connectionstate",
          signalingstatechange: "signalingstate",
        }[update.type];
        const el = peerConnectionElement.getElementsByClassName(fieldName)[0];
        const numberOfEvents = el.textContent.split(" => ").length;
        if (numberOfEvents < MAX_NUMBER_OF_STATE_CHANGES_DISPLAYED) {
          el.textContent += " => " + update.value;
        } else if (numberOfEvents === MAX_NUMBER_OF_STATE_CHANGES_DISPLAYED) {
          el.textContent += " ...";
        }
      }

      const summaryItem = $("summary-template").content.cloneNode(true);
      const summary = summaryItem.querySelector("summary");
      summary.textContent = type;
      row.appendChild(summaryItem);

      const valueContainer = document.createElement("pre");
      const details = row.cells[1].childNodes[0];
      details.appendChild(valueContainer);

      // Highlight ICE/DTLS failures and failure callbacks.
      if (
        (update.type === "iceconnectionstatechange" &&
          update.value === "failed") ||
        (update.type === "connectionstatechange" && update.value === "failed") ||
        update.type.indexOf("OnFailure") !== -1 ||
        update.type === "addIceCandidateFailed"
      ) {
        valueContainer.parentElement.classList.add("update-log-failure");
      }

      // RTCSessionDescription is serialized as 'type: <type>, sdp:'
      if (
        typeof update.value === "string" &&
        update.value.indexOf(", sdp:") !== -1
      ) {
        const [type, sdp] = update.value.substr(6).split(", sdp:");

        // Create a copy-to-clipboard button.
        const copyBtn = document.createElement("button");
        copyBtn.textContent = "Copy description to clipboard";
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(JSON.stringify({ type, sdp }));
        };
        valueContainer.appendChild(copyBtn);

        // Fold the SDP sections.
        const sections = sdp
          .split("\nm=")
          .map((part, index) => (index > 0 ? "m=" + part : part).trim() + "\r\n");
        summary.textContent +=
          ' (type: "' + type + '", ' + sections.length + " sections)";
        sections.forEach((section) => {
          const lines = section.trim().split("\n");
          // Extract the mid attribute.
          const mid = lines
            .filter((line) => line.startsWith("a=mid:"))
            .map((line) => line.substr(6))[0];
          const sectionDetails = document.createElement("details");
          // Fold by default for large SDP.
          sectionDetails.open =
            sections.length <= MAX_NUMBER_OF_EXPANDED_MEDIASECTIONS;
          sectionDetails.textContent = lines.slice(1).join("\n");

          const sectionSummary = document.createElement("summary");
          sectionSummary.textContent =
            lines[0].trim() +
            " (" +
            (lines.length - 1) +
            " more lines)" +
            (mid ? " mid=" + mid : "");
          sectionDetails.appendChild(sectionSummary);

          valueContainer.appendChild(sectionDetails);
        });
      } else {
        valueContainer.textContent = update.value;
      }
    }

    /**
     * Makes sure the update log table of the peer connection is created.
     *
     * @param {!Element} peerConnectionElement The root element.
     * @return {!Element} The log table element.
     * @private
     */
    ensureUpdateContainer_(peerConnectionElement) {
      const tableId = peerConnectionElement.id + this.UPDATE_LOG_ID_SUFFIX_;
      let tableElement = $(tableId);
      if (!tableElement) {
        const tableContainer = document.createElement("div");
        tableContainer.className = this.UPDATE_LOG_CONTAINER_CLASS_;
        peerConnectionElement.appendChild(tableContainer);

        tableElement = document.createElement("table");
        tableElement.className = this.UPDATE_LOG_TABLE_CLASS;
        tableElement.id = tableId;
        tableElement.border = 1;
        tableContainer.appendChild(tableElement);
        tableElement.appendChild(
          $("time-event-template").content.cloneNode(true)
        );
      }
      return tableElement;
    }

    /**
     * Store the last createOfferOnSuccess/createAnswerOnSuccess to compare to
     * setLocalDescription and visualize SDP munging.
     *
     * @param {!Element} tableElement The peerconnection update element.
     * @param {!PeerConnectionUpdateEntry} update The update to add.
     * @private
     */
    setLastOfferAnswer_(tableElement, update) {
      tableElement["data-lastofferanswer"] = update.value;
    }

    /**
     * Retrieves the last createOfferOnSuccess/createAnswerOnSuccess to compare
     * to setLocalDescription and visualize SDP munging.
     *
     * @param {!Element} tableElement The peerconnection update element.
     * @private
     */
    getLastOfferAnswer_(tableElement) {
      return tableElement["data-lastofferanswer"];
    }
  }

  // Copyright 2013 The Chromium Authors

  /** A list of getUserMedia requests. */
  const userMediaRequests = [];
  /** A map from peer connection id to the PeerConnectionRecord. */
  const peerConnectionDataStore = {};

  // Also duplicating on window since tests access these from C++.
  window.userMediaRequests = userMediaRequests;
  window.peerConnectionDataStore = peerConnectionDataStore;

  /**
   * Provides the UI for dump creation.
   */
  class DumpCreator {
    /**
     * @param {Element} containerElement The parent element of the dump creation
     *     UI.
     */
    constructor(containerElement) {
      /**
       * The root element of the dump creation UI.
       * @type {Element}
       * @private
       */
      this.root_ = document.createElement("details");

      this.root_.className = "peer-connection-dump-root";
      containerElement.appendChild(this.root_);
      const summary = document.createElement("summary");
      this.root_.appendChild(summary);
      summary.textContent = "Create Dump";
      const content = document.createElement("div");
      this.root_.appendChild(content);

      content.appendChild($("dump-template").content.cloneNode(true));
      content
        .getElementsByTagName("a")[0]
        .addEventListener("click", this.onDownloadData_.bind(this));
      content
        .getElementsByTagName("input")[1]
        .addEventListener(
          "click",
          this.onAudioDebugRecordingsChanged_.bind(this)
        );
      content
        .getElementsByTagName("input")[2]
        .addEventListener("click", this.onEventLogRecordingsChanged_.bind(this));
    }

    // Mark the diagnostic audio recording checkbox checked.
    setAudioDebugRecordingsCheckbox() {
      this.root_.getElementsByTagName("input")[1].checked = true;
    }

    // Mark the diagnostic audio recording checkbox unchecked.
    clearAudioDebugRecordingsCheckbox() {
      this.root_.getElementsByTagName("input")[1].checked = false;
    }

    // Mark the event log recording checkbox checked.
    setEventLogRecordingsCheckbox() {
      this.root_.getElementsByTagName("input")[2].checked = true;
    }

    // Mark the event log recording checkbox unchecked.
    clearEventLogRecordingsCheckbox() {
      this.root_.getElementsByTagName("input")[2].checked = false;
    }

    // Mark the event log recording checkbox as mutable/immutable.
    setEventLogRecordingsCheckboxMutability(mutable) {
      // TODO(eladalon): Remove reliance on number and order of elements.
      // https://crbug.com/817391
      this.root_.getElementsByTagName("input")[2].disabled = !mutable;
      if (!mutable) {
        const label = this.root_.getElementsByTagName("label")[2];
        label.style = "color:red;";
        label.textContent =
          " WebRTC event logging's state was set by a command line flag.";
      }
    }

    /**
     * Downloads the PeerConnection updates and stats data as a file.
     *
     * @private
     */
    async onDownloadData_(event) {
      const useCompression = this.root_.getElementsByTagName("input")[0].checked;
      const dumpObject = {
        getUserMedia: userMediaRequests,
        PeerConnections: peerConnectionDataStore,
        UserAgent: navigator.userAgent,
      };
      const textBlob = new Blob([JSON.stringify(dumpObject, null, 1)], {
        type: "octet/stream",
      });
      let url;
      if (useCompression) {
        const compressionStream = new CompressionStream("gzip");
        const binaryStream = textBlob.stream().pipeThrough(compressionStream);
        const binaryBlob = await new Response(binaryStream).blob();
        url = URL.createObjectURL(binaryBlob);
        // Since this is async we can't use the default event and need to click
        // again (while avoiding an infinite loop).
        const anchor = document.createElement("a");
        anchor.download = "webrtc_internals_dump.gz";
        anchor.href = url;
        anchor.click();
        return;
      }
      url = URL.createObjectURL(textBlob);
      const anchor = this.root_.getElementsByTagName("a")[0];
      anchor.download = "webrtc_internals_dump.txt";
      anchor.href = url;
      // The default action of the anchor will download the url.
    }

    /**
     * Handles the event of toggling the audio debug recordings state.
     *
     * @private
     */
    onAudioDebugRecordingsChanged_() {
      const enabled = this.root_.getElementsByTagName("input")[1].checked;
      if (enabled) {
        chrome.send("enableAudioDebugRecordings");
      } else {
        chrome.send("disableAudioDebugRecordings");
      }
    }

    /**
     * Handles the event of toggling the event log recordings state.
     *
     * @private
     */
    onEventLogRecordingsChanged_() {
      const enabled = this.root_.getElementsByTagName("input")[2].checked;
      if (enabled) {
        chrome.send("enableEventLogRecordings");
      } else {
        chrome.send("disableEventLogRecordings");
      }
    }
  }

  // Copyright 2013 The Chromium Authors
  // Use of this source code is governed by a BSD-style license that can be
  // found in the LICENSE file.

  // Creates a simple object containing the tab head and body elements.
  class TabDom {
    constructor(h, b) {
      this.head = h;
      this.body = b;
    }
  }

  /**
   * A TabView provides the ability to create tabs and switch between tabs. It's
   * responsible for creating the DOM and managing the visibility of each tab.
   * The first added tab is active by default and the others hidden.
   */
  class TabView {
    /**
     * @param {Element} root The root DOM element containing the tabs.
     */
    constructor(root) {
      this.root_ = root;
      this.ACTIVE_TAB_HEAD_CLASS_ = "active-tab-head";
      this.ACTIVE_TAB_BODY_CLASS_ = "active-tab-body";
      this.TAB_HEAD_CLASS_ = "tab-head";
      this.TAB_BODY_CLASS_ = "tab-body";

      /**
       * A mapping for an id to the tab elements.
       * @type {!Object<!TabDom>}
       * @private
       */
      this.tabElements_ = {};

      this.headBar_ = null;
      this.activeTabId_ = null;
      this.initializeHeadBar_();
    }

    /**
     * Adds a tab with the specified id and title.
     * @param {string} id
     * @param {string} title
     * @return {!Element} The tab body element.
     */
    addTab(id, title) {
      if (this.tabElements_[id]) {
        throw "Tab already exists: " + id;
      }

      const head = document.createElement("span");
      head.className = this.TAB_HEAD_CLASS_;
      head.textContent = title;
      head.title = title;
      this.headBar_.appendChild(head);
      head.addEventListener("click", this.switchTab_.bind(this, id));

      const body = document.createElement("div");
      body.className = this.TAB_BODY_CLASS_;
      body.id = id;
      this.root_.appendChild(body);

      this.tabElements_[id] = new TabDom(head, body);

      if (!this.activeTabId_) {
        this.switchTab_(id);
      }
      return this.tabElements_[id].body;
    }

    /** Removes the tab. @param {string} id */
    removeTab(id) {
      if (!this.tabElements_[id]) {
        return;
      }
      this.tabElements_[id].head.parentNode.removeChild(
        this.tabElements_[id].head
      );
      this.tabElements_[id].body.parentNode.removeChild(
        this.tabElements_[id].body
      );

      delete this.tabElements_[id];
      if (this.activeTabId_ === id) {
        this.switchTab_(Object.keys(this.tabElements_)[0]);
      }
    }

    /**
     * Switches the specified tab into view.
     *
     * @param {string} activeId The id the of the tab that should be switched to
     *     active state.
     * @private
     */
    switchTab_(activeId) {
      if (this.activeTabId_ && this.tabElements_[this.activeTabId_]) {
        this.tabElements_[this.activeTabId_].body.classList.remove(
          this.ACTIVE_TAB_BODY_CLASS_
        );
        this.tabElements_[this.activeTabId_].head.classList.remove(
          this.ACTIVE_TAB_HEAD_CLASS_
        );
      }
      this.activeTabId_ = activeId;
      if (this.tabElements_[activeId]) {
        this.tabElements_[activeId].body.classList.add(
          this.ACTIVE_TAB_BODY_CLASS_
        );
        this.tabElements_[activeId].head.classList.add(
          this.ACTIVE_TAB_HEAD_CLASS_
        );
      }
    }

    /** Initializes the bar containing the tab heads. */
    initializeHeadBar_() {
      this.headBar_ = document.createElement("div");
      this.root_.appendChild(this.headBar_);
      this.headBar_.style.textAlign = "center";
    }
  }

  // Copyright 2013 The Chromium Authors
  // Use of this source code is governed by a BSD-style license that can be
  // found in the LICENSE file.

  /**
   * Get the ssrc if |report| is an ssrc report.
   *
   * @param {!Object} report The object contains id, type, and stats, where stats
   *     is the object containing timestamp and values, which is an array of
   *     strings, whose even index entry is the name of the stat, and the odd
   *     index entry is the value.
   * @return {?string} The ssrc.
   */
  function GetSsrcFromReport(report) {
    if (report.type !== "ssrc") {
      console.warn("Trying to get ssrc from non-ssrc report.");
      return null;
    }

    // If the 'ssrc' name-value pair exists, return the value; otherwise, return
    // the report id.
    // The 'ssrc' name-value pair only exists in an upcoming Libjingle change. Old
    // versions use id to refer to the ssrc.
    //
    // TODO(jiayl): remove the fallback to id once the Libjingle change is rolled
    // to Chrome.
    if (report.stats && report.stats.values) {
      for (let i = 0; i < report.stats.values.length - 1; i += 2) {
        if (report.stats.values[i] === "ssrc") {
          return report.stats.values[i + 1];
        }
      }
    }
    return report.id;
  }

  /**
   * SsrcInfoManager stores the ssrc stream info extracted from SDP.
   */
  class SsrcInfoManager {
    constructor() {
      /**
       * Map from ssrc id to an object containing all the stream properties.
       * @type {!Object<!Object<string>>}
       * @private
       */
      this.streamInfoContainer_ = {};

      /**
       * The string separating attributes in an SDP.
       * @type {string}
       * @const
       * @private
       */
      this.ATTRIBUTE_SEPARATOR_ = /[\r,\n]/;

      /**
       * The regex separating fields within an ssrc description.
       * @type {RegExp}
       * @const
       * @private
       */
      this.FIELD_SEPARATOR_REGEX_ = / .*:/;

      /**
       * The prefix string of an ssrc description.
       * @type {string}
       * @const
       * @private
       */
      this.SSRC_ATTRIBUTE_PREFIX_ = "a=ssrc:";

      /**
       * The className of the ssrc info parent element.
       * @type {string}
       * @const
       */
      this.SSRC_INFO_BLOCK_CLASS = "ssrc-info-block";
    }

    /**
     * Extracts the stream information from |sdp| and saves it.
     * For example:
     *     a=ssrc:1234 msid:abcd
     *     a=ssrc:1234 label:hello
     *
     * @param {string} sdp The SDP string.
     */
    addSsrcStreamInfo(sdp) {
      const attributes = sdp.split(this.ATTRIBUTE_SEPARATOR_);
      for (let i = 0; i < attributes.length; ++i) {
        // Check if this is a ssrc attribute.
        if (attributes[i].indexOf(this.SSRC_ATTRIBUTE_PREFIX_) !== 0) {
          continue;
        }

        let nextFieldIndex = attributes[i].search(this.FIELD_SEPARATOR_REGEX_);

        if (nextFieldIndex === -1) {
          continue;
        }

        const ssrc = attributes[i].substring(
          this.SSRC_ATTRIBUTE_PREFIX_.length,
          nextFieldIndex
        );
        if (!this.streamInfoContainer_[ssrc]) {
          this.streamInfoContainer_[ssrc] = {};
        }

        // Make |rest| starting at the next field.
        let rest = attributes[i].substring(nextFieldIndex + 1);
        let name;
        let value;
        while (rest.length > 0) {
          nextFieldIndex = rest.search(this.FIELD_SEPARATOR_REGEX_);
          if (nextFieldIndex === -1) {
            nextFieldIndex = rest.length;
          }

          // The field name is the string before the colon.
          name = rest.substring(0, rest.indexOf(":"));
          // The field value is from after the colon to the next field.
          value = rest.substring(rest.indexOf(":") + 1, nextFieldIndex);
          this.streamInfoContainer_[ssrc][name] = value;

          // Move |rest| to the start of the next field.
          rest = rest.substring(nextFieldIndex + 1);
        }
      }
    }

    /**
     * @param {string} sdp The ssrc id.
     * @return {!Object<string>} The object containing the ssrc information.
     */
    getStreamInfo(ssrc) {
      return this.streamInfoContainer_[ssrc];
    }

    /**
     * Populate the ssrc information into |parentElement|, each field as a
     * DIV element.
     *
     * @param {!Element} parentElement The parent element for the ssrc info.
     * @param {string} ssrc The ssrc id.
     */
    populateSsrcInfo(parentElement, ssrc) {
      if (!this.streamInfoContainer_[ssrc]) {
        return;
      }

      parentElement.className = this.SSRC_INFO_BLOCK_CLASS;

      let fieldElement;
      for (const property in this.streamInfoContainer_[ssrc]) {
        fieldElement = document.createElement("div");
        parentElement.appendChild(fieldElement);
        fieldElement.textContent =
          property + ":" + this.streamInfoContainer_[ssrc][property];
      }
    }
  }

  // Copyright 2013 The Chromium Authors

  /**
   * Maintains the stats table.
   * @param {SsrcInfoManager} ssrcInfoManager The source of the ssrc info.
   */
  class StatsTable {
    /**
     * @param {SsrcInfoManager} ssrcInfoManager The source of the ssrc info.
     */
    constructor(ssrcInfoManager) {
      /**
       * @type {SsrcInfoManager}
       * @private
       */
      this.ssrcInfoManager_ = ssrcInfoManager;
    }

    /**
     * Adds |report| to the stats table of |peerConnectionElement|.
     *
     * @param {!Element} peerConnectionElement The root element.
     * @param {!Object} report The object containing stats, which is the object
     *     containing timestamp and values, which is an array of strings, whose
     *     even index entry is the name of the stat, and the odd index entry is
     *     the value.
     */
    addStatsReport(peerConnectionElement, report) {
      if (report.type === "codec") {
        return;
      }
      const statsTable = this.ensureStatsTable_(peerConnectionElement, report);

      if (
        ["outbound-rtp", "inbound-rtp"].includes(report.type) &&
        report.stats.values
      ) {
        let summary = report.id + " (" + report.type;
        // Show mid, rid and codec for inbound-rtp and outbound-rtp.
        // Note: values is an array [key1, val1, key2, val2, ...] so searching
        // for a certain key needs to ensure it does not collide with a value.
        const midIndex = report.stats.values.findIndex((value, index) => {
          return value === "mid" && index % 2 === 0;
        });
        if (midIndex !== -1) {
          const midInfo = report.stats.values[midIndex + 1];
          summary += ", mid=" + midInfo;
        }
        const ridIndex = report.stats.values.findIndex((value, index) => {
          return value === "rid" && index % 2 === 0;
        });
        if (ridIndex !== -1) {
          const ridInfo = report.stats.values[ridIndex + 1];
          summary += ", rid=" + ridInfo;
        }

        const codecIndex = report.stats.values.findIndex((value, index) => {
          return value === "[codec]" && index % 2 === 0;
        });
        if (codecIndex !== -1) {
          const codecInfo = report.stats.values[codecIndex + 1].split(" ")[0];
          summary += ", " + codecInfo;
        }
        // Update the summary.
        statsTable.parentElement.firstElementChild.innerText = summary + ")";
      }

      if (report.stats) {
        this.addStatsToTable_(
          statsTable,
          report.stats.timestamp,
          report.stats.values
        );
      }
    }

    clearStatsLists(peerConnectionElement) {
      const containerId = peerConnectionElement.id + "-table-container";
      const container = $(containerId);
      if (container) {
        peerConnectionElement.removeChild(container);
        this.ensureStatsTableContainer_(peerConnectionElement);
      }
    }

    /**
     * Ensure the DIV container for the stats tables is created as a child of
     * |peerConnectionElement|.
     *
     * @param {!Element} peerConnectionElement The root element.
     * @return {!Element} The stats table container.
     * @private
     */
    ensureStatsTableContainer_(peerConnectionElement) {
      const containerId = peerConnectionElement.id + "-table-container";
      let container = $(containerId);
      if (!container) {
        container = document.createElement("div");
        container.id = containerId;
        container.className = "stats-table-container";
        const head = document.createElement("div");
        head.textContent = "Stats Tables";
        container.appendChild(head);
        peerConnectionElement.appendChild(container);
      }
      return container;
    }

    /**
     * Ensure the stats table for track specified by |report| of PeerConnection
     * |peerConnectionElement| is created.
     *
     * @param {!Element} peerConnectionElement The root element.
     * @param {!Object} report The object containing stats, which is the object
     *     containing timestamp and values, which is an array of strings, whose
     *     even index entry is the name of the stat, and the odd index entry is
     *     the value.
     * @return {!Element} The stats table element.
     * @private
     */
    ensureStatsTable_(peerConnectionElement, report) {
      const tableId = peerConnectionElement.id + "-table-" + report.id;
      let table = $(tableId);
      if (!table) {
        const container = this.ensureStatsTableContainer_(peerConnectionElement);
        const details = document.createElement("details");
        container.appendChild(details);

        const summary = document.createElement("summary");
        summary.textContent = report.id + " (" + report.type + ")";
        details.appendChild(summary);

        table = document.createElement("table");
        details.appendChild(table);
        table.id = tableId;
        table.border = 1;

        table.appendChild($("trth-template").content.cloneNode(true));
        table.rows[0].cells[0].textContent = "Statistics " + report.id;
        if (report.type === "ssrc") {
          table.insertRow(1);
          table.rows[1].appendChild(
            $("td-colspan-template").content.cloneNode(true)
          );
          this.ssrcInfoManager_.populateSsrcInfo(
            table.rows[1].cells[0],
            GetSsrcFromReport(report)
          );
        }
      }
      return table;
    }

    /**
     * Update |statsTable| with |time| and |statsData|.
     *
     * @param {!Element} statsTable Which table to update.
     * @param {number} time The number of milliseconds since epoch.
     * @param {Array<string>} statsData An array of stats name and value pairs.
     * @private
     */
    addStatsToTable_(statsTable, time, statsData) {
      const date = new Date(time);
      this.updateStatsTableRow_(statsTable, "timestamp", date.toLocaleString());
      for (let i = 0; i < statsData.length - 1; i = i + 2) {
        this.updateStatsTableRow_(statsTable, statsData[i], statsData[i + 1]);
      }
    }

    /**
     * Update the value column of the stats row of |rowName| to |value|.
     * A new row is created is this is the first report of this stats.
     *
     * @param {!Element} statsTable Which table to update.
     * @param {string} rowName The name of the row to update.
     * @param {string} value The new value to set.
     * @private
     */
    updateStatsTableRow_(statsTable, rowName, value) {
      const trId = statsTable.id + "-" + rowName;
      let trElement = $(trId);
      const activeConnectionClass = "stats-table-active-connection";
      if (!trElement) {
        trElement = document.createElement("tr");
        trElement.id = trId;
        statsTable.firstChild.appendChild(trElement);
        const item = $("td2-template").content.cloneNode(true);
        item.querySelector("td").textContent = rowName;
        trElement.appendChild(item);
      }
      trElement.cells[1].textContent = value;

      // Highlights the table for the active connection.
      if (rowName === "googActiveConnection") {
        if (value === true) {
          statsTable.parentElement.classList.add(activeConnectionClass);
        } else {
          statsTable.parentElement.classList.remove(activeConnectionClass);
        }
      }
    }
  }

  /** A simple class to store the updates and stats data for a peer connection. */
  /** @constructor */
  class PeerConnectionRecord {
    constructor() {
      /** @private */
      this.record_ = {
        pid: -1,
        constraints: {},
        rtcConfiguration: [],
        stats: {},
        updateLog: [],
        url: "",
      };
    }

    /** @override */
    toJSON() {
      return this.record_;
    }

    /**
     * Adds the initialization info of the peer connection.
     * @param {number} pid The pid of the process hosting the peer connection.
     * @param {string} url The URL of the web page owning the peer connection.
     * @param {Array} rtcConfiguration
     * @param {!Object} constraints Media constraints.
     */
    initialize(pid, url, rtcConfiguration, constraints) {
      this.record_.pid = pid;
      this.record_.url = url;
      this.record_.rtcConfiguration = rtcConfiguration;
      this.record_.constraints = constraints;
    }

    resetStats() {
      this.record_.stats = {};
    }

    /**
     * @param {string} dataSeriesId The TimelineDataSeries identifier.
     * @return {!TimelineDataSeries}
     */
    getDataSeries(dataSeriesId) {
      return this.record_.stats[dataSeriesId];
    }

    /**
     * @param {string} dataSeriesId The TimelineDataSeries identifier.
     * @param {!TimelineDataSeries} dataSeries The TimelineDataSeries to set to.
     */
    setDataSeries(dataSeriesId, dataSeries) {
      this.record_.stats[dataSeriesId] = dataSeries;
    }

    /**
     * @param {!Object} update The object contains keys "time", "type", and
     *   "value".
     */
    addUpdate(update) {
      const time = new Date(parseFloat(update.time));
      this.record_.updateLog.push({
        time: time.toLocaleString(),
        type: update.type,
        value: update.value,
      });
    }
  }

  // Copyright 2019 The Chromium Authors
  // Use of this source code is governed by a BSD-style license that can be
  // found in the LICENSE file.

  const CalculatorModifier = Object.freeze({
    kNone: Object.freeze({ postfix: "", multiplier: 1 }),
    kMillisecondsFromSeconds: Object.freeze({
      postfix: "_in_ms",
      multiplier: 1000,
    }),
    kBytesToBits: Object.freeze({ bitrate: true, multiplier: 8 }),
  });

  class Metric {
    constructor(name, value) {
      this.name = name;
      this.value = value;
    }

    toString() {
      return '{"' + this.name + '":"' + this.value + '"}';
    }
  }

  // Represents a companion dictionary to an RTCStats object of an RTCStatsReport.
  // The CalculatedStats object contains additional metrics associated with the
  // original RTCStats object. Typically, the RTCStats object contains
  // accumulative counters, but in chrome://webrc-internals/ we also want graphs
  // for the average rate over the last second, so we have CalculatedStats
  // containing calculated Metrics.
  class CalculatedStats {
    constructor(id) {
      this.id = id;
      // A map Original Name -> Array of Metrics, where Original Name refers to
      // the name of the metric in the original RTCStats object, and the Metrics
      // are calculated metrics. For example, if the original RTCStats report
      // contains framesReceived, and from that we've calculated
      // [framesReceived/s] and [framesReceived-framesDecoded], then there will be
      // a mapping from "framesReceived" to an array of two Metric objects,
      // "[framesReceived/s]" and "[framesReceived-framesDecoded]".
      this.calculatedMetricsByOriginalName = new Map();
    }

    addCalculatedMetric(originalName, metric) {
      let calculatedMetrics =
        this.calculatedMetricsByOriginalName.get(originalName);
      if (!calculatedMetrics) {
        calculatedMetrics = [];
        this.calculatedMetricsByOriginalName.set(originalName, calculatedMetrics);
      }
      calculatedMetrics.push(metric);
    }

    // Gets the calculated metrics associated with |originalName| in the order
    // that they were added, or an empty list if there are no associated metrics.
    getCalculatedMetrics(originalName) {
      const calculatedMetrics =
        this.calculatedMetricsByOriginalName.get(originalName);
      if (!calculatedMetrics) {
        return [];
      }
      return calculatedMetrics;
    }

    toString() {
      let str = '{id:"' + this.id + '"';
      for (const originalName of this.calculatedMetricsByOriginalName.keys()) {
        const calculatedMetrics =
          this.calculatedMetricsByOriginalName.get(originalName);
        str += "," + originalName + ":[";
        for (let i = 0; i < calculatedMetrics.length; i++) {
          str += calculatedMetrics[i].toString();
          if (i + 1 < calculatedMetrics.length) {
            str += ",";
          }
          str += "]";
        }
      }
      str += "}";
      return str;
    }
  }

  // Contains the metrics of an RTCStatsReport, as well as calculated metrics
  // associated with metrics from the original report. Convertible to and from the
  // "internal reports" format used by webrtc_internals.js to pass stats from C++
  // to JavaScript.
  class StatsReport {
    constructor() {
      // Represents an RTCStatsReport. It is a Map RTCStats.id -> RTCStats.
      // https://w3c.github.io/webrtc-pc/#dom-rtcstatsreport
      this.statsById = new Map();
      // RTCStats.id -> CalculatedStats
      this.calculatedStatsById = new Map();
    }

    // |internalReports| is an array, each element represents an RTCStats object,
    // but the format is a little different from the spec. This is the format:
    // {
    //   id: "string",
    //   type: "string",
    //   stats: {
    //     timestamp: <milliseconds>,
    //     values: ["member1", value1, "member2", value2...]
    //   }
    // }
    static fromInternalsReportList(internalReports) {
      const result = new StatsReport();
      internalReports.forEach((internalReport) => {
        if (!internalReport.stats || !internalReport.stats.values) {
          return; // continue;
        }
        const stats = {
          id: internalReport.id,
          type: internalReport.type,
          timestamp: internalReport.stats.timestamp / 1000.0, // ms -> s
        };
        const values = internalReport.stats.values;
        for (let i = 0; i < values.length; i += 2) {
          // Metric "name: value".
          stats[values[i]] = values[i + 1];
        }
        result.statsById.set(stats.id, stats);
      });
      return result;
    }

    toInternalsReportList() {
      const result = [];
      for (const stats of this.statsById.values()) {
        const internalReport = {
          id: stats.id,
          type: stats.type,
          stats: {
            timestamp: stats.timestamp * 1000.0, // s -> ms
            values: [],
          },
        };
        Object.keys(stats).forEach((metricName) => {
          if (
            metricName === "id" ||
            metricName === "type" ||
            metricName === "timestamp"
          ) {
            return; // continue;
          }
          internalReport.stats.values.push(metricName);
          internalReport.stats.values.push(stats[metricName]);
          const calculatedMetrics = this.getCalculatedMetrics(
            stats.id,
            metricName
          );
          calculatedMetrics.forEach((calculatedMetric) => {
            internalReport.stats.values.push(calculatedMetric.name);
            // Treat calculated metrics that are undefined as 0 to ensure graphs
            // can be created anyway.
            internalReport.stats.values.push(
              calculatedMetric.value ? calculatedMetric.value : 0
            );
          });
        });
        result.push(internalReport);
      }
      return result;
    }

    toString() {
      let str = "";
      for (const stats of this.statsById.values()) {
        if (str !== "") {
          str += ",";
        }
        str += JSON.stringify(stats);
      }
      let str2 = "";
      for (const stats of this.calculatedStatsById.values()) {
        if (str2 !== "") {
          str2 += ",";
        }
        str2 += stats.toString();
      }
      return "[original:" + str + "],calculated:[" + str2 + "]";
    }

    get(id) {
      return this.statsById.get(id);
    }

    getByType(type) {
      const result = [];
      for (const stats of this.statsById.values()) {
        if (stats.type === type) {
          result.push(stats);
        }
      }
      return result;
    }

    addCalculatedMetric(id, insertAtOriginalMetricName, name, value) {
      let calculatedStats = this.calculatedStatsById.get(id);
      if (!calculatedStats) {
        calculatedStats = new CalculatedStats(id);
        this.calculatedStatsById.set(id, calculatedStats);
      }
      calculatedStats.addCalculatedMetric(
        insertAtOriginalMetricName,
        new Metric(name, value)
      );
    }

    getCalculatedMetrics(id, originalMetricName) {
      const calculatedStats = this.calculatedStatsById.get(id);
      return calculatedStats
        ? calculatedStats.getCalculatedMetrics(originalMetricName)
        : [];
    }
  }

  // Shows a `DOMHighResTimeStamp` as a human readable date time.
  // The metric must be a time value in milliseconds with Unix epoch as time
  // origin.
  class DateCalculator {
    constructor(metric) {
      this.metric = metric;
    }
    getCalculatedMetricName() {
      return "[" + this.metric + "]";
    }
    calculate(id, previousReport, currentReport) {
      const timestamp = currentReport.get(id)[this.metric];
      const date = new Date(timestamp);
      return date.toLocaleString();
    }
  }

  // Calculates the rate "delta accumulative / delta samples" and returns it. If
  // a rate cannot be calculated, such as the metric is missing in the current
  // or previous report, undefined is returned.
  class RateCalculator {
    constructor(
      accumulativeMetric,
      samplesMetric,
      modifier = CalculatorModifier.kNone
    ) {
      this.accumulativeMetric = accumulativeMetric;
      this.samplesMetric = samplesMetric;
      this.modifier = modifier;
    }

    getCalculatedMetricName() {
      const accumulativeMetric = this.modifier.bitrate
        ? this.accumulativeMetric + "_in_bits"
        : this.accumulativeMetric;
      if (this.samplesMetric === "timestamp") {
        return "[" + accumulativeMetric + "/s]";
      }
      return (
        "[" +
        accumulativeMetric +
        "/" +
        this.samplesMetric +
        this.modifier.postfix +
        "]"
      );
    }

    calculate(id, previousReport, currentReport) {
      return (
        RateCalculator.calculateRate(
          id,
          previousReport,
          currentReport,
          this.accumulativeMetric,
          this.samplesMetric
        ) * this.modifier.multiplier
      );
    }

    static calculateRate(
      id,
      previousReport,
      currentReport,
      accumulativeMetric,
      samplesMetric
    ) {
      if (!previousReport || !currentReport) {
        return undefined;
      }
      const previousStats = previousReport.get(id);
      const currentStats = currentReport.get(id);
      if (!previousStats || !currentStats) {
        return undefined;
      }
      const deltaTime = currentStats.timestamp - previousStats.timestamp;
      if (deltaTime <= 0) {
        return undefined;
      }
      // Try to convert whatever the values are to numbers. This gets around the
      // fact that some types that are not supported by base::Value (e.g. uint32,
      // int64, uint64 and double) are passed as strings.
      const previousValue = Number(previousStats[accumulativeMetric]);
      const currentValue = Number(currentStats[accumulativeMetric]);
      if (typeof previousValue !== "number" || typeof currentValue !== "number") {
        return undefined;
      }
      const previousSamples = Number(previousStats[samplesMetric]);
      const currentSamples = Number(currentStats[samplesMetric]);
      if (
        typeof previousSamples !== "number" ||
        typeof currentSamples !== "number"
      ) {
        return undefined;
      }
      const deltaValue = currentValue - previousValue;
      const deltaSamples = currentSamples - previousSamples;
      return deltaValue / deltaSamples;
    }
  }

  // Looks up codec and payload type from a codecId reference, constructing an
  // informative string about which codec is used.
  class CodecCalculator {
    getCalculatedMetricName() {
      return "[codec]";
    }

    calculate(id, previousReport, currentReport) {
      const targetStats = currentReport.get(id);
      const codecStats = currentReport.get(targetStats.codecId);
      if (!codecStats) {
        return undefined;
      }
      // If mimeType is 'video/VP8' then codec is 'VP8'.
      const codec = codecStats.mimeType.substr(
        codecStats.mimeType.indexOf("/") + 1
      );

      let fmtpLine = "";
      if (codecStats.sdpFmtpLine) {
        fmtpLine = ", " + codecStats.sdpFmtpLine;
      }
      return codec + " (" + codecStats.payloadType + fmtpLine + ")";
    }
  }

  // Calculates "RMS" audio level, which is the average audio level between the
  // previous and current report, in the interval [0,1]. Calculated per:
  // https://w3c.github.io/webrtc-stats/#dom-rtcinboundrtpstreamstats-totalaudioenergy
  class AudioLevelRmsCalculator {
    getCalculatedMetricName() {
      return "[Audio_Level_in_RMS]";
    }

    calculate(id, previousReport, currentReport) {
      const averageAudioLevelSquared = RateCalculator.calculateRate(
        id,
        previousReport,
        currentReport,
        "totalAudioEnergy",
        "totalSamplesDuration"
      );
      return Math.sqrt(averageAudioLevelSquared);
    }
  }

  // Calculates "metricA - SUM(otherMetrics)", only looking at the current report.
  class DifferenceCalculator {
    constructor(metricA, ...otherMetrics) {
      this.metricA = metricA;
      this.otherMetrics = otherMetrics;
    }

    getCalculatedMetricName() {
      return "[" + this.metricA + "-" + this.otherMetrics.join("-") + "]";
    }

    calculate(id, previousReport, currentReport) {
      const currentStats = currentReport.get(id);
      return (
        parseInt(currentStats[this.metricA], 10) -
        this.otherMetrics
          .map((metric) => parseInt(currentStats[metric], 10))
          .reduce((a, b) => a + b, 0)
      );
    }
  }

  // Calculates the standard deviation from a totalSquaredSum, totalSum, and
  // totalCount. If the standard deviation cannot be calculated, such as the
  // metric is missing in the current or previous report, undefined is returned.
  class StandardDeviationCalculator {
    constructor(totalSquaredSumMetric, totalSumMetric, totalCount, label) {
      this.totalSquaredSumMetric = totalSquaredSumMetric;
      this.totalSumMetric = totalSumMetric;
      this.totalCount = totalCount;
      this.label = label;
    }

    getCalculatedMetricName() {
      return "[" + this.label + "StDev_in_ms]";
    }

    calculate(id, previousReport, currentReport) {
      return StandardDeviationCalculator.calculateStandardDeviation(
        id,
        previousReport,
        currentReport,
        this.totalSquaredSumMetric,
        this.totalSumMetric,
        this.totalCount
      );
    }

    static calculateStandardDeviation(
      id,
      previousReport,
      currentReport,
      totalSquaredSumMetric,
      totalSumMetric,
      totalCount
    ) {
      if (!previousReport || !currentReport) {
        return undefined;
      }
      const previousStats = previousReport.get(id);
      const currentStats = currentReport.get(id);
      if (!previousStats || !currentStats) {
        return undefined;
      }
      const deltaCount =
        Number(currentStats[totalCount]) - Number(previousStats[totalCount]);
      if (deltaCount <= 0) {
        return undefined;
      }
      // Try to convert whatever the values are to numbers. This gets around the
      // fact that some types that are not supported by base::Value (e.g. uint32,
      // int64, uint64 and double) are passed as strings.
      const previousSquaredSumValue = Number(
        previousStats[totalSquaredSumMetric]
      );
      const currentSquaredSumValue = Number(currentStats[totalSquaredSumMetric]);
      if (
        typeof previousSquaredSumValue !== "number" ||
        typeof currentSquaredSumValue !== "number"
      ) {
        return undefined;
      }
      const previousSumValue = Number(previousStats[totalSumMetric]);
      const currentSumValue = Number(currentStats[totalSumMetric]);
      if (
        typeof previousSumValue !== "number" ||
        typeof currentSumValue !== "number"
      ) {
        return undefined;
      }

      const deltaSquaredSum = currentSquaredSumValue - previousSquaredSumValue;
      const deltaSum = currentSumValue - previousSumValue;
      const variance =
        (deltaSquaredSum - Math.pow(deltaSum, 2) / deltaCount) / deltaCount;
      if (variance < 0) {
        return undefined;
      }
      return 1000 * Math.sqrt(variance);
    }
  }

  // Keeps track of previous and current stats report and calculates all
  // calculated metrics.
  class StatsRatesCalculator {
    constructor() {
      this.previousReport = null;
      this.currentReport = null;
      this.statsCalculators = [
        {
          type: "data-channel",
          metricCalculators: {
            messagesSent: new RateCalculator("messagesSent", "timestamp"),
            messagesReceived: new RateCalculator("messagesReceived", "timestamp"),
            bytesSent: new RateCalculator(
              "bytesSent",
              "timestamp",
              CalculatorModifier.kBytesToBits
            ),
            bytesReceived: new RateCalculator(
              "bytesReceived",
              "timestamp",
              CalculatorModifier.kBytesToBits
            ),
          },
        },
        {
          type: "media-source",
          metricCalculators: {
            totalAudioEnergy: new AudioLevelRmsCalculator(),
          },
        },
        {
          type: "track",
          metricCalculators: {
            framesSent: new RateCalculator("framesSent", "timestamp"),
            framesReceived: [
              new RateCalculator("framesReceived", "timestamp"),
              new DifferenceCalculator(
                "framesReceived",
                "framesDecoded",
                "framesDropped"
              ),
            ],
            totalAudioEnergy: new AudioLevelRmsCalculator(),
            jitterBufferDelay: new RateCalculator(
              "jitterBufferDelay",
              "jitterBufferEmittedCount",
              CalculatorModifier.kMillisecondsFromSeconds
            ),
          },
        },
        {
          type: "outbound-rtp",
          metricCalculators: {
            bytesSent: new RateCalculator(
              "bytesSent",
              "timestamp",
              CalculatorModifier.kBytesToBits
            ),
            headerBytesSent: new RateCalculator(
              "headerBytesSent",
              "timestamp",
              CalculatorModifier.kBytesToBits
            ),
            packetsSent: new RateCalculator("packetsSent", "timestamp"),
            totalPacketSendDelay: new RateCalculator(
              "totalPacketSendDelay",
              "packetsSent",
              CalculatorModifier.kMillisecondsFromSeconds
            ),
            framesEncoded: new RateCalculator("framesEncoded", "timestamp"),
            framesSent: new RateCalculator("framesSent", "timestamp"),
            totalEncodedBytesTarget: new RateCalculator(
              "totalEncodedBytesTarget",
              "timestamp",
              CalculatorModifier.kBytesToBits
            ),
            totalEncodeTime: new RateCalculator(
              "totalEncodeTime",
              "framesEncoded",
              CalculatorModifier.kMillisecondsFromSeconds
            ),
            qpSum: new RateCalculator("qpSum", "framesEncoded"),
            codecId: new CodecCalculator(),
            retransmittedPacketsSent: new RateCalculator(
              "retransmittedPacketsSent",
              "timestamp"
            ),
            retransmittedBytesSent: new RateCalculator(
              "retransmittedBytesSent",
              "timestamp",
              CalculatorModifier.kBytesToBits
            ),
          },
        },
        {
          type: "inbound-rtp",
          metricCalculators: {
            bytesReceived: new RateCalculator(
              "bytesReceived",
              "timestamp",
              CalculatorModifier.kBytesToBits
            ),
            headerBytesReceived: new RateCalculator(
              "headerBytesReceived",
              "timestamp",
              CalculatorModifier.kBytesToBits
            ),
            packetsReceived: new RateCalculator("packetsReceived", "timestamp"),
            framesReceived: [
              new RateCalculator("framesReceived", "timestamp"),
              new DifferenceCalculator(
                "framesReceived",
                "framesDecoded",
                "framesDropped"
              ),
            ],
            framesDecoded: new RateCalculator("framesDecoded", "timestamp"),
            keyFramesDecoded: new RateCalculator("keyFramesDecoded", "timestamp"),
            totalDecodeTime: new RateCalculator(
              "totalDecodeTime",
              "framesDecoded",
              CalculatorModifier.kMillisecondsFromSeconds
            ),
            totalInterFrameDelay: new RateCalculator(
              "totalInterFrameDelay",
              "framesDecoded",
              CalculatorModifier.kMillisecondsFromSeconds
            ),
            totalSquaredInterFrameDelay: new StandardDeviationCalculator(
              "totalSquaredInterFrameDelay",
              "totalInterFrameDelay",
              "framesDecoded",
              "interFrameDelay"
            ),
            totalSamplesReceived: new RateCalculator(
              "totalSamplesReceived",
              "timestamp"
            ),
            concealedSamples: [
              new RateCalculator("concealedSamples", "timestamp"),
              new RateCalculator("concealedSamples", "totalSamplesReceived"),
            ],
            silentConcealedSamples: new RateCalculator(
              "silentConcealedSamples",
              "timestamp"
            ),
            insertedSamplesForDeceleration: new RateCalculator(
              "insertedSamplesForDeceleration",
              "timestamp"
            ),
            removedSamplesForAcceleration: new RateCalculator(
              "removedSamplesForAcceleration",
              "timestamp"
            ),
            qpSum: new RateCalculator("qpSum", "framesDecoded"),
            codecId: new CodecCalculator(),
            totalAudioEnergy: new AudioLevelRmsCalculator(),
            jitterBufferDelay: new RateCalculator(
              "jitterBufferDelay",
              "jitterBufferEmittedCount",
              CalculatorModifier.kMillisecondsFromSeconds
            ),
            lastPacketReceivedTimestamp: new DateCalculator(
              "lastPacketReceivedTimestamp"
            ),
            estimatedPlayoutTimestamp: new DateCalculator(
              "estimatedPlayoutTimestamp"
            ),
            totalProcessingDelay: new RateCalculator(
              "totalProcessingDelay",
              "framesDecoded",
              CalculatorModifier.kMillisecondsFromSeconds
            ),
            "totalAssemblyTime*": new RateCalculator(
              "totalAssemblyTime*",
              "framesAssembledFromMultiplePackets*",
              CalculatorModifier.kMillisecondsFromSeconds
            ),
          },
        },
        {
          type: "remote-outbound-rtp",
          metricCalculators: {
            remoteTimestamp: new DateCalculator("remoteTimestamp"),
          },
        },
        {
          type: "transport",
          metricCalculators: {
            bytesSent: new RateCalculator(
              "bytesSent",
              "timestamp",
              CalculatorModifier.kBytesToBits
            ),
            bytesReceived: new RateCalculator(
              "bytesReceived",
              "timestamp",
              CalculatorModifier.kBytesToBits
            ),
            packetsSent: new RateCalculator("packetsSent", "timestamp"),
            packetsReceived: new RateCalculator("packetsReceived", "timestamp"),
          },
        },
        {
          type: "candidate-pair",
          metricCalculators: {
            bytesSent: new RateCalculator(
              "bytesSent",
              "timestamp",
              CalculatorModifier.kBytesToBits
            ),
            bytesReceived: new RateCalculator(
              "bytesReceived",
              "timestamp",
              CalculatorModifier.kBytesToBits
            ),
            packetsSent: new RateCalculator("packetsSent", "timestamp"),
            packetsReceived: new RateCalculator("packetsReceived", "timestamp"),
            totalRoundTripTime: new RateCalculator(
              "totalRoundTripTime",
              "responsesReceived"
            ),
          },
        },
      ];
    }

    addStatsReport(report) {
      this.previousReport = this.currentReport;
      this.currentReport = report;
      this.updateCalculatedMetrics_();
    }

    // Updates all "calculated metrics", which are metrics derived from standard
    // values, such as converting total counters (e.g. bytesSent) to rates (e.g.
    // bytesSent/s).
    updateCalculatedMetrics_() {
      this.statsCalculators.forEach((statsCalculator) => {
        this.currentReport.getByType(statsCalculator.type).forEach((stats) => {
          Object.keys(statsCalculator.metricCalculators).forEach(
            (originalMetric) => {
              let metricCalculators =
                statsCalculator.metricCalculators[originalMetric];
              if (!Array.isArray(metricCalculators)) {
                metricCalculators = [metricCalculators];
              }
              metricCalculators.forEach((metricCalculator) => {
                this.currentReport.addCalculatedMetric(
                  stats.id,
                  originalMetric,
                  metricCalculator.getCalculatedMetricName(),
                  metricCalculator.calculate(
                    stats.id,
                    this.previousReport,
                    this.currentReport
                  )
                );
              });
            }
          );
        });
      });
    }
  }

  // Copyright 2021 The Chromium Authors
  /**
   * A helper function for appending a child element to |parent|.
   * Copied from webrtc_internals.js
   *
   * @param {!Element} parent The parent element.
   * @param {string} tag The child element tag.
   * @param {string} text The textContent of the new DIV.
   * @return {!Element} the new DIV element.
   */
  function appendChildWithText$1(parent, tag, text) {
    const child = document.createElement(tag);
    child.textContent = text;
    parent.appendChild(child);
    return child;
  }

  function createIceCandidateGrid(peerConnectionElement) {
    const container = document.createElement("details");
    appendChildWithText$1(container, "summary", "ICE candidate grid");

    const table = document.createElement("table");
    table.id = "grid-" + peerConnectionElement.id;
    table.className = "candidategrid";
    container.appendChild(table);

    const tableHeader = document.createElement("tr");
    table.append(tableHeader);

    // For candidate pairs.
    appendChildWithText$1(tableHeader, "th", "Candidate (pair) id");
    // [1] is used for both candidate pairs and individual candidates.
    appendChildWithText$1(tableHeader, "th", "State / Candidate type");
    // For individual candidates.
    appendChildWithText$1(tableHeader, "th", "Network type / address");
    appendChildWithText$1(tableHeader, "th", "Port");
    appendChildWithText$1(tableHeader, "th", "Protocol / candidate type");
    appendChildWithText$1(tableHeader, "th", "(Pair) Priority");

    // For candidate pairs.
    appendChildWithText$1(tableHeader, "th", "Bytes sent / received");
    appendChildWithText$1(
      tableHeader,
      "th",
      "STUN requests sent / responses received"
    );
    appendChildWithText$1(
      tableHeader,
      "th",
      "STUN requests received / responses sent"
    );
    appendChildWithText$1(tableHeader, "th", "RTT");
    appendChildWithText$1(tableHeader, "th", "Last update");

    peerConnectionElement.appendChild(container);
  }

  /**
   * Creates or returns a table row in the ICE candidate grid.
   * @param {string} peerConnectionElement id
   * @param {string} stat object id
   * @param {type} type of the row
   */
  function findOrCreateGridRow(peerConnectionElementId, statId, type) {
    const elementId =
      "grid-" + peerConnectionElementId + "-" + statId + "-" + type;
    let row = document.getElementById(elementId);
    if (!row) {
      row = document.createElement("tr");
      row.id = elementId;
      for (let i = 0; i < 11; i++) {
        row.appendChild(document.createElement("td"));
      }
      $("grid-" + peerConnectionElementId).appendChild(row);
    }
    return row;
  }

  /**
   * Updates a table row in the ICE candidate grid.
   * @param {string} peerConnectionElement id
   * @param {boolean} whether the pair is the selected pair of a transport
   *   (displayed bold)
   * @param {object} candidate pair stats report
   * @param {Map} full map of stats
   */
  function appendRow(peerConnectionElement, active, candidatePair, stats) {
    const pairRow = findOrCreateGridRow(
      peerConnectionElement.id,
      candidatePair.id,
      "candidatepair"
    );
    pairRow.classList.add("candidategrid-candidatepair");
    if (active) {
      pairRow.classList.add("candidategrid-active");
    }
    // Set transport-specific fields.
    pairRow.children[0].innerText = candidatePair.id;
    pairRow.children[1].innerText = candidatePair.state;
    // Show (pair) priority as hex.
    pairRow.children[5].innerText =
      "0x" + parseInt(candidatePair.priority, 10).toString(16);
    pairRow.children[6].innerText =
      candidatePair.bytesSent + " / " + candidatePair.bytesReceived;
    pairRow.children[7].innerText =
      candidatePair.requestsSent + " / " + candidatePair.responsesReceived;
    pairRow.children[8].innerText =
      candidatePair.requestsReceived + " / " + candidatePair.responsesSent;
    pairRow.children[9].innerText =
      candidatePair.currentRoundTripTime !== undefined
        ? candidatePair.currentRoundTripTime + "s"
        : "";
    pairRow.children[10].innerText = new Date().toLocaleTimeString();

    // Local candidate.
    const localRow = findOrCreateGridRow(
      peerConnectionElement.id,
      candidatePair.id,
      "local"
    );
    localRow.className = "candidategrid-candidate";
    const localCandidate = stats.get(candidatePair.localCandidateId);
    ["id", "type", "address", "port", "candidateType", "priority"].forEach(
      (stat, index) => {
        // Relay protocol is only set for local relay candidates.
        if (stat == "candidateType" && localCandidate.relayProtocol) {
          localRow.children[index].innerText =
            localCandidate[stat] + "(" + localCandidate.relayProtocol + ")";
        } else if (stat === "priority") {
          localRow.children[index].innerText =
            "0x" + parseInt(localCandidate[stat], 10).toString(16);
        } else {
          localRow.children[index].innerText = localCandidate[stat];
        }
      }
    );
    // Network type is only for the local candidate
    // so put it into the pair row above the address.
    pairRow.children[2].innerText = localCandidate.networkType;
    // protocol must always be the same for the pair
    // so put it into the pair row above the candidate type.
    pairRow.children[4].innerText = localCandidate.protocol;

    // Remote candidate.
    const remoteRow = findOrCreateGridRow(
      peerConnectionElement.id,
      candidatePair.id,
      "remote"
    );
    remoteRow.className = "candidategrid-candidate";
    const remoteCandidate = stats.get(candidatePair.remoteCandidateId);
    ["id", "type", "address", "port", "candidateType", "priority"].forEach(
      (stat, index) => {
        if (stat === "priority") {
          remoteRow.children[index].innerText =
            "0x" + parseInt(remoteCandidate[stat], 10).toString(16);
        } else {
          remoteRow.children[index].innerText = remoteCandidate[stat];
        }
      }
    );
    return pairRow;
  }

  /**
   * Updates the (spec) ICE candidate grid.
   * @param {Element} peerConnectionElement
   * @param {Map} stats reconstructed stats object.
   */
  function updateIceCandidateGrid(peerConnectionElement, stats) {
    const container = $("grid-" + peerConnectionElement.id);
    // Remove the active/bold marker from all rows.
    container.childNodes.forEach((row) => {
      row.classList.remove("candidategrid-active");
    });
    let activePairIds = [];
    // Find the active transport(s), then find its candidate pair
    // and display it first. Note that previously selected pairs continue to be
    // shown since rows are not removed.
    stats.forEach((transportReport) => {
      if (transportReport.type !== "transport") {
        return;
      }
      if (!transportReport.selectedCandidatePairId) {
        return;
      }
      activePairIds.push(transportReport.selectedCandidatePairId);
      appendRow(
        peerConnectionElement,
        true,
        stats.get(transportReport.selectedCandidatePairId),
        stats
      );
    });

    // Then iterate over the other candidate pairs.
    stats.forEach((report) => {
      if (report.type !== "candidate-pair" || activePairIds.includes(report.id)) {
        return;
      }
      appendRow(peerConnectionElement, false, report, stats);
    });
  }

  // Copyright 2013 The Chromium Authors
  // Use of this source code is governed by a BSD-style license that can be
  // found in the LICENSE file.

  // The maximum number of data points buffered for each stats. Old data points
  // will be shifted out when the buffer is full.
  const MAX_STATS_DATA_POINT_BUFFER_SIZE = 1000;

  /**
   * A TimelineDataSeries collects an ordered series of (time, value) pairs,
   * and converts them to graph points.  It also keeps track of its color and
   * current visibility state.
   * It keeps MAX_STATS_DATA_POINT_BUFFER_SIZE data points at most. Old data
   * points will be dropped when it reaches this size.
   */
  class TimelineDataSeries {
    constructor(statsType) {
      // List of DataPoints in chronological order.
      this.dataPoints_ = [];

      // Default color.  Should always be overridden prior to display.
      this.color_ = "red";
      // Whether or not the data series should be drawn.
      this.isVisible_ = true;

      this.cacheStartTime_ = null;
      this.cacheStepSize_ = 0;
      this.cacheValues_ = [];
      this.statsType_ = statsType;
    }

    /**
     * @override
     */
    toJSON() {
      if (this.dataPoints_.length < 1) {
        return {};
      }

      const values = [];
      for (let i = 0; i < this.dataPoints_.length; ++i) {
        values.push(this.dataPoints_[i].value);
      }
      return {
        startTime: this.dataPoints_[0].time,
        endTime: this.dataPoints_[this.dataPoints_.length - 1].time,
        statsType: this.statsType_,
        values: JSON.stringify(values),
      };
    }

    /**
     * Adds a DataPoint to |this| with the specified time and value.
     * DataPoints are assumed to be received in chronological order.
     */
    addPoint(timeTicks, value) {
      const time = new Date(timeTicks);
      this.dataPoints_.push(new DataPoint(time, value));

      if (this.dataPoints_.length > MAX_STATS_DATA_POINT_BUFFER_SIZE) {
        this.dataPoints_.shift();
      }
    }

    isVisible() {
      return this.isVisible_;
    }

    show(isVisible) {
      this.isVisible_ = isVisible;
    }

    getColor() {
      return this.color_;
    }

    setColor(color) {
      this.color_ = color;
    }

    getCount() {
      return this.dataPoints_.length;
    }
    /**
     * Returns a list containing the values of the data series at |count|
     * points, starting at |startTime|, and |stepSize| milliseconds apart.
     * Caches values, so showing/hiding individual data series is fast.
     */
    getValues(startTime, stepSize, count) {
      // Use cached values, if we can.
      if (
        this.cacheStartTime_ === startTime &&
        this.cacheStepSize_ === stepSize &&
        this.cacheValues_.length === count
      ) {
        return this.cacheValues_;
      }

      // Do all the work.
      this.cacheValues_ = this.getValuesInternal_(startTime, stepSize, count);
      this.cacheStartTime_ = startTime;
      this.cacheStepSize_ = stepSize;

      return this.cacheValues_;
    }

    /**
     * Returns the cached |values| in the specified time period.
     */
    getValuesInternal_(startTime, stepSize, count) {
      const values = [];
      let nextPoint = 0;
      let currentValue = 0;
      let time = startTime;
      for (let i = 0; i < count; ++i) {
        while (
          nextPoint < this.dataPoints_.length &&
          this.dataPoints_[nextPoint].time < time
        ) {
          currentValue = this.dataPoints_[nextPoint].value;
          ++nextPoint;
        }
        values[i] = currentValue;
        time += stepSize;
      }
      return values;
    }
  }

  /**
   * A single point in a data series.  Each point has a time, in the form of
   * milliseconds since the Unix epoch, and a numeric value.
   */
  class DataPoint {
    constructor(time, value) {
      this.time = time;
      this.value = value;
    }
  }

  // Copyright 2013 The Chromium Authors

  // Maximum number of labels placed vertically along the sides of the graph.
  const MAX_VERTICAL_LABELS = 6;

  // Vertical spacing between labels and between the graph and labels.
  const LABEL_VERTICAL_SPACING = 4;
  // Horizontal spacing between vertically placed labels and the edges of the
  // graph.
  const LABEL_HORIZONTAL_SPACING = 3;

  // Length of ticks, in pixels, next to y-axis labels.  The x-axis only has
  // one set of labels, so it can use lines instead.
  const Y_AXIS_TICK_LENGTH = 10;

  const GRID_COLOR = "#CCC";
  const TEXT_COLOR = "#000";
  const BACKGROUND_COLOR = "#FFF";

  const MAX_DECIMAL_PRECISION = 3;

  /**
   * A TimelineGraphView displays a timeline graph on a canvas element.
   */
  class TimelineGraphView {
    constructor(divId, canvasId) {
      this.scrollbar_ = { position_: 0, range_: 0 };

      this.graphDiv_ = $(divId);
      this.canvas_ = $(canvasId);

      // Set the range and scale of the graph.  Times are in milliseconds since
      // the Unix epoch.

      // All measurements we have must be after this time.
      this.startTime_ = 0;
      // The current rightmost position of the graph is always at most this.
      this.endTime_ = 1;

      this.graph_ = null;

      // Horizontal scale factor, in terms of milliseconds per pixel.
      this.scale_ = 1000;

      // Initialize the scrollbar.
      this.updateScrollbarRange_(true);
    }

    setScale(scale) {
      this.scale_ = scale;
    }

    // Returns the total length of the graph, in pixels.
    getLength_() {
      const timeRange = this.endTime_ - this.startTime_;
      // Math.floor is used to ignore the last partial area, of length less
      // than this.scale_.
      return Math.floor(timeRange / this.scale_);
    }

    /**
     * Returns true if the graph is scrolled all the way to the right.
     */
    graphScrolledToRightEdge_() {
      return this.scrollbar_.position_ === this.scrollbar_.range_;
    }

    /**
     * Update the range of the scrollbar.  If |resetPosition| is true, also
     * sets the slider to point at the rightmost position and triggers a
     * repaint.
     */
    updateScrollbarRange_(resetPosition) {
      let scrollbarRange = this.getLength_() - this.canvas_.width;
      if (scrollbarRange < 0) {
        scrollbarRange = 0;
      }

      // If we've decreased the range to less than the current scroll position,
      // we need to move the scroll position.
      if (this.scrollbar_.position_ > scrollbarRange) {
        resetPosition = true;
      }

      this.scrollbar_.range_ = scrollbarRange;
      if (resetPosition) {
        this.scrollbar_.position_ = scrollbarRange;
        this.repaint();
      }
    }

    /**
     * Sets the date range displayed on the graph, switches to the default
     * scale factor, and moves the scrollbar all the way to the right.
     */
    setDateRange(startDate, endDate) {
      this.startTime_ = startDate.getTime();
      this.endTime_ = endDate.getTime();

      // Safety check.
      if (this.endTime_ <= this.startTime_) {
        this.startTime_ = this.endTime_ - 1;
      }

      this.updateScrollbarRange_(true);
    }

    /**
     * Updates the end time at the right of the graph to be the current time.
     * Specifically, updates the scrollbar's range, and if the scrollbar is
     * all the way to the right, keeps it all the way to the right.  Otherwise,
     * leaves the view as-is and doesn't redraw anything.
     */
    updateEndDate(opt_date) {
      this.endTime_ = opt_date || new Date().getTime();
      this.updateScrollbarRange_(this.graphScrolledToRightEdge_());
    }

    getStartDate() {
      return new Date(this.startTime_);
    }

    /**
     * Replaces the current TimelineDataSeries with |dataSeries|.
     */
    setDataSeries(dataSeries) {
      // Simply recreates the Graph.
      this.graph_ = new Graph();
      for (let i = 0; i < dataSeries.length; ++i) {
        this.graph_.addDataSeries(dataSeries[i]);
      }
      this.repaint();
    }

    /**
     * Adds |dataSeries| to the current graph.
     */
    addDataSeries(dataSeries) {
      if (!this.graph_) {
        this.graph_ = new Graph();
      }
      this.graph_.addDataSeries(dataSeries);
      this.repaint();
    }

    /**
     * Draws the graph on |canvas_| when visible.
     */
    repaint() {
      if (this.canvas_.offsetParent === null) {
        return; // do not repaint graphs that are not visible.
      }

      this.repaintTimerRunning_ = false;

      const width = this.canvas_.width;
      let height = this.canvas_.height;
      const context = this.canvas_.getContext("2d");

      // Clear the canvas.
      context.fillStyle = BACKGROUND_COLOR;
      context.fillRect(0, 0, width, height);

      // Try to get font height in pixels.  Needed for layout.
      const fontHeightString = context.font.match(/([0-9]+)px/)[1];
      const fontHeight = parseInt(fontHeightString);

      // Safety check, to avoid drawing anything too ugly.
      if (
        fontHeightString.length === 0 ||
        fontHeight <= 0 ||
        fontHeight * 4 > height ||
        width < 50
      ) {
        return;
      }

      // Save current transformation matrix so we can restore it later.
      context.save();

      // The center of an HTML canvas pixel is technically at (0.5, 0.5).  This
      // makes near straight lines look bad, due to anti-aliasing.  This
      // translation reduces the problem a little.
      context.translate(0.5, 0.5);

      // Figure out what time values to display.
      let position = this.scrollbar_.position_;
      // If the entire time range is being displayed, align the right edge of
      // the graph to the end of the time range.
      if (this.scrollbar_.range_ === 0) {
        position = this.getLength_() - this.canvas_.width;
      }
      const visibleStartTime = this.startTime_ + position * this.scale_;

      // Make space at the bottom of the graph for the time labels, and then
      // draw the labels.
      const textHeight = height;
      height -= fontHeight + LABEL_VERTICAL_SPACING;
      this.drawTimeLabels(context, width, height, textHeight, visibleStartTime);

      // Draw outline of the main graph area.
      context.strokeStyle = GRID_COLOR;
      context.strokeRect(0, 0, width - 1, height - 1);

      if (this.graph_) {
        // Layout graph and have them draw their tick marks.
        this.graph_.layout(
          width,
          height,
          fontHeight,
          visibleStartTime,
          this.scale_
        );
        this.graph_.drawTicks(context);

        // Draw the lines of all graphs, and then draw their labels.
        this.graph_.drawLines(context);
        this.graph_.drawLabels(context);
      }

      // Restore original transformation matrix.
      context.restore();
    }

    /**
     * Draw time labels below the graph.  Takes in start time as an argument
     * since it may not be |startTime_|, when we're displaying the entire
     * time range.
     */
    drawTimeLabels(context, width, height, textHeight, startTime) {
      // Draw the labels 1 minute apart.
      const timeStep = 1000 * 60;

      // Find the time for the first label.  This time is a perfect multiple of
      // timeStep because of how UTC times work.
      let time = Math.ceil(startTime / timeStep) * timeStep;

      context.textBaseline = "bottom";
      context.textAlign = "center";
      context.fillStyle = TEXT_COLOR;
      context.strokeStyle = GRID_COLOR;

      // Draw labels and vertical grid lines.
      while (true) {
        const x = Math.round((time - startTime) / this.scale_);
        if (x >= width) {
          break;
        }
        const text = new Date(time).toLocaleTimeString();
        context.fillText(text, x, textHeight);
        context.beginPath();
        context.lineTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
        time += timeStep;
      }
    }

    getDataSeriesCount() {
      if (this.graph_) {
        return this.graph_.dataSeries_.length;
      }
      return 0;
    }

    hasDataSeries(dataSeries) {
      if (this.graph_) {
        return this.graph_.hasDataSeries(dataSeries);
      }
      return false;
    }
  }

  /**
   * A Graph is responsible for drawing all the TimelineDataSeries that have
   * the same data type.  Graphs are responsible for scaling the values, laying
   * out labels, and drawing both labels and lines for its data series.
   */
  class Graph {
    constructor() {
      this.dataSeries_ = [];

      // Cached properties of the graph, set in layout.
      this.width_ = 0;
      this.height_ = 0;
      this.fontHeight_ = 0;
      this.startTime_ = 0;
      this.scale_ = 0;

      // The lowest/highest values adjusted by the vertical label step size
      // in the displayed range of the graph. Used for scaling and setting
      // labels.  Set in layoutLabels.
      this.min_ = 0;
      this.max_ = 0;

      // Cached text of equally spaced labels.  Set in layoutLabels.
      this.labels_ = [];
    }

    addDataSeries(dataSeries) {
      this.dataSeries_.push(dataSeries);
    }

    hasDataSeries(dataSeries) {
      for (let i = 0; i < this.dataSeries_.length; ++i) {
        if (this.dataSeries_[i] === dataSeries) {
          return true;
        }
      }
      return false;
    }

    /**
     * Returns a list of all the values that should be displayed for a given
     * data series, using the current graph layout.
     */
    getValues(dataSeries) {
      if (!dataSeries.isVisible()) {
        return null;
      }
      return dataSeries.getValues(this.startTime_, this.scale_, this.width_);
    }

    /**
     * Updates the graph's layout.  In particular, both the max value and
     * label positions are updated.  Must be called before calling any of the
     * drawing functions.
     */
    layout(width, height, fontHeight, startTime, scale) {
      this.width_ = width;
      this.height_ = height;
      this.fontHeight_ = fontHeight;
      this.startTime_ = startTime;
      this.scale_ = scale;

      // Find largest value.
      let max = 0;
      let min = 0;
      for (let i = 0; i < this.dataSeries_.length; ++i) {
        const values = this.getValues(this.dataSeries_[i]);
        if (!values) {
          continue;
        }
        for (let j = 0; j < values.length; ++j) {
          if (values[j] > max) {
            max = values[j];
          } else if (values[j] < min) {
            min = values[j];
          }
        }
      }

      this.layoutLabels_(min, max);
    }

    /**
     * Lays out labels and sets |max_|/|min_|, taking the time units into
     * consideration.  |maxValue| is the actual maximum value, and
     * |max_| will be set to the value of the largest label, which
     * will be at least |maxValue|. Similar for |min_|.
     */
    layoutLabels_(minValue, maxValue) {
      if (maxValue - minValue < 1024) {
        this.layoutLabelsBasic_(minValue, maxValue, MAX_DECIMAL_PRECISION);
        return;
      }

      // Find appropriate units to use.
      const units = ["", "k", "M", "G", "T", "P"];
      // Units to use for labels.  0 is '1', 1 is K, etc.
      // We start with 1, and work our way up.
      let unit = 1;
      minValue /= 1024;
      maxValue /= 1024;
      while (units[unit + 1] && maxValue - minValue >= 1024) {
        minValue /= 1024;
        maxValue /= 1024;
        ++unit;
      }

      // Calculate labels.
      this.layoutLabelsBasic_(minValue, maxValue, MAX_DECIMAL_PRECISION);

      // Append units to labels.
      for (let i = 0; i < this.labels_.length; ++i) {
        this.labels_[i] += " " + units[unit];
      }

      // Convert |min_|/|max_| back to unit '1'.
      this.min_ *= Math.pow(1024, unit);
      this.max_ *= Math.pow(1024, unit);
    }

    /**
     * Same as layoutLabels_, but ignores units.  |maxDecimalDigits| is the
     * maximum number of decimal digits allowed.  The minimum allowed
     * difference between two adjacent labels is 10^-|maxDecimalDigits|.
     */
    layoutLabelsBasic_(minValue, maxValue, maxDecimalDigits) {
      this.labels_ = [];
      const range = maxValue - minValue;
      // No labels if the range is 0.
      if (range === 0) {
        this.min_ = this.max_ = maxValue;
        return;
      }

      // The maximum number of equally spaced labels allowed.  |fontHeight_|
      // is doubled because the top two labels are both drawn in the same
      // gap.
      const minLabelSpacing = 2 * this.fontHeight_ + LABEL_VERTICAL_SPACING;

      // The + 1 is for the top label.
      let maxLabels = 1 + this.height_ / minLabelSpacing;
      if (maxLabels < 2) {
        maxLabels = 2;
      } else if (maxLabels > MAX_VERTICAL_LABELS) {
        maxLabels = MAX_VERTICAL_LABELS;
      }

      // Initial try for step size between consecutive labels.
      let stepSize = Math.pow(10, -maxDecimalDigits);
      // Number of digits to the right of the decimal of |stepSize|.
      // Used for formatting label strings.
      let stepSizeDecimalDigits = maxDecimalDigits;

      // Pick a reasonable step size.
      while (true) {
        // If we use a step size of |stepSize| between labels, we'll need:
        //
        // Math.ceil(range / stepSize) + 1
        //
        // labels.  The + 1 is because we need labels at both at 0 and at
        // the top of the graph.

        // Check if we can use steps of size |stepSize|.
        if (Math.ceil(range / stepSize) + 1 <= maxLabels) {
          break;
        }
        // Check |stepSize| * 2.
        if (Math.ceil(range / (stepSize * 2)) + 1 <= maxLabels) {
          stepSize *= 2;
          break;
        }
        // Check |stepSize| * 5.
        if (Math.ceil(range / (stepSize * 5)) + 1 <= maxLabels) {
          stepSize *= 5;
          break;
        }
        stepSize *= 10;
        if (stepSizeDecimalDigits > 0) {
          --stepSizeDecimalDigits;
        }
      }

      // Set the min/max so it's an exact multiple of the chosen step size.
      this.max_ = Math.ceil(maxValue / stepSize) * stepSize;
      this.min_ = Math.floor(minValue / stepSize) * stepSize;

      // Create labels.
      for (let label = this.max_; label >= this.min_; label -= stepSize) {
        this.labels_.push(label.toFixed(stepSizeDecimalDigits));
      }
    }

    /**
     * Draws tick marks for each of the labels in |labels_|.
     */
    drawTicks(context) {
      const x1 = this.width_ - 1;
      const x2 = this.width_ - 1 - Y_AXIS_TICK_LENGTH;

      context.fillStyle = GRID_COLOR;
      context.beginPath();
      for (let i = 1; i < this.labels_.length - 1; ++i) {
        // The rounding is needed to avoid ugly 2-pixel wide anti-aliased
        // lines.
        const y = Math.round((this.height_ * i) / (this.labels_.length - 1));
        context.moveTo(x1, y);
        context.lineTo(x2, y);
      }
      context.stroke();
    }

    /**
     * Draws a graph line for each of the data series.
     */
    drawLines(context) {
      // Factor by which to scale all values to convert them to a number from
      // 0 to height - 1.
      let scale = 0;
      const bottom = this.height_ - 1;
      if (this.max_) {
        scale = bottom / (this.max_ - this.min_);
      }

      // Draw in reverse order, so earlier data series are drawn on top of
      // subsequent ones.
      for (let i = this.dataSeries_.length - 1; i >= 0; --i) {
        const values = this.getValues(this.dataSeries_[i]);
        if (!values) {
          continue;
        }
        context.strokeStyle = this.dataSeries_[i].getColor();
        context.beginPath();
        for (let x = 0; x < values.length; ++x) {
          // The rounding is needed to avoid ugly 2-pixel wide anti-aliased
          // horizontal lines.
          context.lineTo(x, bottom - Math.round((values[x] - this.min_) * scale));
        }
        context.stroke();
      }
    }

    /**
     * Draw labels in |labels_|.
     */
    drawLabels(context) {
      if (this.labels_.length === 0) {
        return;
      }
      const x = this.width_ - LABEL_HORIZONTAL_SPACING;

      // Set up the context.
      context.fillStyle = TEXT_COLOR;
      context.textAlign = "right";

      // Draw top label, which is the only one that appears below its tick
      // mark.
      context.textBaseline = "top";
      context.fillText(this.labels_[0], x, 0);

      // Draw all the other labels.
      context.textBaseline = "bottom";
      const step = (this.height_ - 1) / (this.labels_.length - 1);
      for (let i = 1; i < this.labels_.length; ++i) {
        context.fillText(this.labels_[i], x, step * i);
      }
    }
  }

  // Copyright 2013 The Chromium Authors

  const STATS_GRAPH_CONTAINER_HEADING_CLASS = "stats-graph-container-heading";

  const RECEIVED_PROPAGATION_DELTA_LABEL =
    "googReceivedPacketGroupPropagationDeltaDebug";
  const RECEIVED_PACKET_GROUP_ARRIVAL_TIME_LABEL =
    "googReceivedPacketGroupArrivalTimeDebug";

  // Specifies which stats should be drawn on the 'bweCompound' graph and how.
  const bweCompoundGraphConfig = {
    googAvailableSendBandwidth: { color: "red" },
    googTargetEncBitrateCorrected: { color: "purple" },
    googActualEncBitrate: { color: "orange" },
    googRetransmitBitrate: { color: "blue" },
    googTransmitBitrate: { color: "green" },
  };

  // Converts the last entry of |srcDataSeries| from the total amount to the
  // amount per second.
  const totalToPerSecond = function (srcDataSeries) {
    const length = srcDataSeries.dataPoints_.length;
    if (length >= 2) {
      const lastDataPoint = srcDataSeries.dataPoints_[length - 1];
      const secondLastDataPoint = srcDataSeries.dataPoints_[length - 2];
      return Math.floor(
        ((lastDataPoint.value - secondLastDataPoint.value) * 1000) /
          (lastDataPoint.time - secondLastDataPoint.time)
      );
    }

    return 0;
  };

  // Converts the value of total bytes to bits per second.
  const totalBytesToBitsPerSecond = function (srcDataSeries) {
    return totalToPerSecond(srcDataSeries) * 8;
  };

  // Specifies which stats should be converted before drawn and how.
  // |convertedName| is the name of the converted value, |convertFunction|
  // is the function used to calculate the new converted value based on the
  // original dataSeries.
  const dataConversionConfig = {
    packetsSent: {
      convertedName: "packetsSentPerSecond",
      convertFunction: totalToPerSecond,
    },
    bytesSent: {
      convertedName: "bitsSentPerSecond",
      convertFunction: totalBytesToBitsPerSecond,
    },
    packetsReceived: {
      convertedName: "packetsReceivedPerSecond",
      convertFunction: totalToPerSecond,
    },
    bytesReceived: {
      convertedName: "bitsReceivedPerSecond",
      convertFunction: totalBytesToBitsPerSecond,
    },
    // This is due to a bug of wrong units reported for googTargetEncBitrate.
    // TODO (jiayl): remove this when the unit bug is fixed.
    googTargetEncBitrate: {
      convertedName: "googTargetEncBitrateCorrected",
      convertFunction(srcDataSeries) {
        const length = srcDataSeries.dataPoints_.length;
        const lastDataPoint = srcDataSeries.dataPoints_[length - 1];
        if (lastDataPoint.value < 5000) {
          return lastDataPoint.value * 1000;
        }
        return lastDataPoint.value;
      },
    },
  };

  // The object contains the stats names that should not be added to the graph,
  // even if they are numbers.
  const statsNameBlockList = {
    ssrc: true,
    googTrackId: true,
    googComponent: true,
    googLocalAddress: true,
    googRemoteAddress: true,
    googFingerprint: true,
  };

  function isStandardReportBlocklisted(report) {
    // Codec stats reflect what has been negotiated. There are LOTS of them and
    // they don't change over time on their own.
    if (report.type === "codec") {
      return true;
    }
    // Unused data channels can stay in "connecting" indefinitely and their
    // counters stay zero.
    if (
      report.type === "data-channel" &&
      readReportStat(report, "state") === "connecting"
    ) {
      return true;
    }
    // The same is true for transports and "new".
    if (
      report.type === "transport" &&
      readReportStat(report, "dtlsState") === "new"
    ) {
      return true;
    }
    // Local and remote candidates don't change over time and there are several of
    // them.
    if (report.type === "local-candidate" || report.type === "remote-candidate") {
      return true;
    }
    return false;
  }

  function readReportStat(report, stat) {
    const values = report.stats.values;
    for (let i = 0; i < values.length; i += 2) {
      if (values[i] === stat) {
        return values[i + 1];
      }
    }
    return undefined;
  }

  function isStandardStatBlocklisted(report, statName) {
    // The datachannelid is an identifier, but because it is a number it shows up
    // as a graph if we don't blocklist it.
    if (report.type === "data-channel" && statName === "datachannelid") {
      return true;
    }
    // The priority does not change over time on its own; plotting uninteresting.
    if (report.type === "candidate-pair" && statName === "priority") {
      return true;
    }
    // The mid/rid associated with a sender/receiver does not change over time;
    // plotting uninteresting.
    if (
      ["inbound-rtp", "outbound-rtp"].includes(report.type) &&
      ["mid", "rid"].includes(statName)
    ) {
      return true;
    }
    return false;
  }

  const graphViews = {};
  // Export on |window| since tests access this directly from C++.
  window.graphViews = graphViews;
  const graphElementsByPeerConnectionId = new Map();

  // Returns number parsed from |value|, or NaN if the stats name is blocklisted.
  function getNumberFromValue(name, value) {
    if (statsNameBlockList[name]) {
      return NaN;
    }
    if (isNaN(value)) {
      return NaN;
    }
    return parseFloat(value);
  }

  // Adds the stats report |report| to the timeline graph for the given
  // |peerConnectionElement|.
  function drawSingleReport(
    peerConnectionElement,
    report,
    isLegacyReport
  ) {
    const reportType = report.type;
    const reportId = report.id;
    const stats = report.stats;
    if (!stats || !stats.values) {
      return;
    }

    const childrenBefore = peerConnectionElement.hasChildNodes()
      ? Array.from(peerConnectionElement.childNodes)
      : [];

    for (let i = 0; i < stats.values.length - 1; i = i + 2) {
      const rawLabel = stats.values[i];
      // Propagation deltas are handled separately.
      if (rawLabel === RECEIVED_PROPAGATION_DELTA_LABEL) {
        drawReceivedPropagationDelta(
          peerConnectionElement,
          report,
          stats.values[i + 1]
        );
        continue;
      }
      const rawDataSeriesId = reportId + "-" + rawLabel;
      const rawValue = getNumberFromValue(rawLabel, stats.values[i + 1]);
      if (isNaN(rawValue)) {
        // We do not draw non-numerical values, but still want to record it in the
        // data series.
        addDataSeriesPoints(
          peerConnectionElement,
          reportType,
          rawDataSeriesId,
          rawLabel,
          [stats.timestamp],
          [stats.values[i + 1]]
        );
        continue;
      }
      let finalDataSeriesId = rawDataSeriesId;
      let finalLabel = rawLabel;
      let finalValue = rawValue;
      // We need to convert the value if dataConversionConfig[rawLabel] exists.
      if (isLegacyReport && dataConversionConfig[rawLabel]) {
        // Updates the original dataSeries before the conversion.
        addDataSeriesPoints(
          peerConnectionElement,
          reportType,
          rawDataSeriesId,
          rawLabel,
          [stats.timestamp],
          [rawValue]
        );

        // Convert to another value to draw on graph, using the original
        // dataSeries as input.
        finalValue = dataConversionConfig[rawLabel].convertFunction(
          peerConnectionDataStore[peerConnectionElement.id].getDataSeries(
            rawDataSeriesId
          )
        );
        finalLabel = dataConversionConfig[rawLabel].convertedName;
        finalDataSeriesId = reportId + "-" + finalLabel;
      }

      // Updates the final dataSeries to draw.
      addDataSeriesPoints(
        peerConnectionElement,
        reportType,
        finalDataSeriesId,
        finalLabel,
        [stats.timestamp],
        [finalValue]
      );

      if (
        !isLegacyReport &&
        (isStandardReportBlocklisted(report) ||
          isStandardStatBlocklisted(report, rawLabel))
      ) {
        // We do not want to draw certain standard reports but still want to
        // record them in the data series.
        continue;
      }

      // Updates the graph.
      const graphType = bweCompoundGraphConfig[finalLabel]
        ? "bweCompound"
        : finalLabel;
      const graphViewId =
        peerConnectionElement.id + "-" + reportId + "-" + graphType;

      if (!graphViews[graphViewId]) {
        graphViews[graphViewId] = createStatsGraphView(
          peerConnectionElement,
          report,
          graphType
        );
        const searchParameters = new URLSearchParams(window.location.search);
        if (searchParameters.has("statsInterval")) {
          const statsInterval = Math.max(
            parseInt(searchParameters.get("statsInterval"), 10),
            100
          );
          if (isFinite(statsInterval)) {
            graphViews[graphViewId].setScale(statsInterval);
          }
        }
        const date = new Date(stats.timestamp);
        graphViews[graphViewId].setDateRange(date, date);
      }
      // Adds the new dataSeries to the graphView. We have to do it here to cover
      // both the simple and compound graph cases.
      const dataSeries =
        peerConnectionDataStore[peerConnectionElement.id].getDataSeries(
          finalDataSeriesId
        );
      if (!graphViews[graphViewId].hasDataSeries(dataSeries)) {
        graphViews[graphViewId].addDataSeries(dataSeries);
      }
      graphViews[graphViewId].updateEndDate();
    }

    const childrenAfter = peerConnectionElement.hasChildNodes()
      ? Array.from(peerConnectionElement.childNodes)
      : [];
    for (let i = 0; i < childrenAfter.length; ++i) {
      if (!childrenBefore.includes(childrenAfter[i])) {
        let graphElements = graphElementsByPeerConnectionId.get(
          peerConnectionElement.id
        );
        if (!graphElements) {
          graphElements = [];
          graphElementsByPeerConnectionId.set(
            peerConnectionElement.id,
            graphElements
          );
        }
        graphElements.push(childrenAfter[i]);
      }
    }
  }

  function removeStatsReportGraphs(peerConnectionElement) {
    const graphElements = graphElementsByPeerConnectionId.get(
      peerConnectionElement.id
    );
    if (graphElements) {
      for (let i = 0; i < graphElements.length; ++i) {
        peerConnectionElement.removeChild(graphElements[i]);
      }
      graphElementsByPeerConnectionId.delete(peerConnectionElement.id);
    }
    Object.keys(graphViews).forEach((key) => {
      if (key.startsWith(peerConnectionElement.id)) {
        delete graphViews[key];
      }
    });
  }

  // Makes sure the TimelineDataSeries with id |dataSeriesId| is created,
  // and adds the new data points to it. |times| is the list of timestamps for
  // each data point, and |values| is the list of the data point values.
  function addDataSeriesPoints(
    peerConnectionElement,
    reportType,
    dataSeriesId,
    label,
    times,
    values
  ) {
    let dataSeries =
      peerConnectionDataStore[peerConnectionElement.id].getDataSeries(
        dataSeriesId
      );
    if (!dataSeries) {
      dataSeries = new TimelineDataSeries(reportType);
      peerConnectionDataStore[peerConnectionElement.id].setDataSeries(
        dataSeriesId,
        dataSeries
      );
      if (bweCompoundGraphConfig[label]) {
        dataSeries.setColor(bweCompoundGraphConfig[label].color);
      }
    }
    for (let i = 0; i < times.length; ++i) {
      dataSeries.addPoint(times[i], values[i]);
    }
  }

  // Draws the received propagation deltas using the packet group arrival time as
  // the x-axis. For example, |report.stats.values| should be like
  // ['googReceivedPacketGroupArrivalTimeDebug', '[123456, 234455, 344566]',
  //  'googReceivedPacketGroupPropagationDeltaDebug', '[23, 45, 56]', ...].
  function drawReceivedPropagationDelta(peerConnectionElement, report, deltas) {
    const reportId = report.id;
    const stats = report.stats;
    let times = null;
    // Find the packet group arrival times.
    for (let i = 0; i < stats.values.length - 1; i = i + 2) {
      if (stats.values[i] === RECEIVED_PACKET_GROUP_ARRIVAL_TIME_LABEL) {
        times = stats.values[i + 1];
        break;
      }
    }
    // Unexpected.
    if (times == null) {
      return;
    }

    // Convert |deltas| and |times| from strings to arrays of numbers.
    try {
      deltas = JSON.parse(deltas);
      times = JSON.parse(times);
    } catch (e) {
      console.log(e);
      return;
    }

    // Update the data series.
    const dataSeriesId = reportId + "-" + RECEIVED_PROPAGATION_DELTA_LABEL;
    addDataSeriesPoints(
      peerConnectionElement,
      "test type",
      dataSeriesId,
      RECEIVED_PROPAGATION_DELTA_LABEL,
      times,
      deltas
    );
    // Update the graph.
    const graphViewId =
      peerConnectionElement.id +
      "-" +
      reportId +
      "-" +
      RECEIVED_PROPAGATION_DELTA_LABEL;
    const date = new Date(times[times.length - 1]);
    if (!graphViews[graphViewId]) {
      graphViews[graphViewId] = createStatsGraphView(
        peerConnectionElement,
        report,
        RECEIVED_PROPAGATION_DELTA_LABEL
      );
      graphViews[graphViewId].setScale(10);
      graphViews[graphViewId].setDateRange(date, date);
      const dataSeries =
        peerConnectionDataStore[peerConnectionElement.id].getDataSeries(
          dataSeriesId
        );
      graphViews[graphViewId].addDataSeries(dataSeries);
    }
    graphViews[graphViewId].updateEndDate(date);
  }

  // Get report types for SSRC reports. Returns 'audio' or 'video' where this type
  // can be deduced from existing stats labels. Otherwise empty string for
  // non-SSRC reports or where type (audio/video) can't be deduced.
  function getSsrcReportType(report) {
    if (report.type !== "ssrc") {
      return "";
    }
    if (report.stats && report.stats.values) {
      // Known stats keys for audio send/receive streams.
      if (
        report.stats.values.indexOf("audioOutputLevel") !== -1 ||
        report.stats.values.indexOf("audioInputLevel") !== -1
      ) {
        return "audio";
      }
      // Known stats keys for video send/receive streams.
      // TODO(pbos): Change to use some non-goog-prefixed stats when available for
      // video.
      if (
        report.stats.values.indexOf("googFrameRateReceived") !== -1 ||
        report.stats.values.indexOf("googFrameRateSent") !== -1
      ) {
        return "video";
      }
    }
    return "";
  }

  // Ensures a div container to hold all stats graphs for one track is created as
  // a child of |peerConnectionElement|.
  function ensureStatsGraphTopContainer(peerConnectionElement, report) {
    const containerId =
      peerConnectionElement.id +
      "-" +
      report.type +
      "-" +
      report.id +
      "-graph-container";
    let container = $(containerId);
    if (!container) {
      container = document.createElement("details");
      container.id = containerId;
      container.className = "stats-graph-container";

      peerConnectionElement.appendChild(container);
      container.appendChild($("summary-span-template").content.cloneNode(true));
      container.firstChild.firstChild.className =
        STATS_GRAPH_CONTAINER_HEADING_CLASS;
      container.firstChild.firstChild.textContent =
        "Stats graphs for " + report.id + " (" + report.type + ")";
      const statsType = getSsrcReportType(report);
      if (statsType !== "") {
        container.firstChild.firstChild.textContent += " (" + statsType + ")";
      }

      if (report.type === "ssrc") {
        const ssrcInfoElement = document.createElement("div");
        container.firstChild.appendChild(ssrcInfoElement);
        ssrcInfoManager.populateSsrcInfo(
          ssrcInfoElement,
          GetSsrcFromReport(report)
        );
      }
    }
    return container;
  }

  // Creates the container elements holding a timeline graph
  // and the TimelineGraphView object.
  function createStatsGraphView(peerConnectionElement, report, statsName) {
    const topContainer = ensureStatsGraphTopContainer(
      peerConnectionElement,
      report
    );

    const graphViewId =
      peerConnectionElement.id + "-" + report.id + "-" + statsName;
    const divId = graphViewId + "-div";
    const canvasId = graphViewId + "-canvas";
    const container = document.createElement("div");
    container.className = "stats-graph-sub-container";

    topContainer.appendChild(container);
    const canvasDiv = $("container-template").content.cloneNode(true);
    canvasDiv.querySelectorAll("div")[0].textContent = statsName;
    canvasDiv.querySelectorAll("div")[1].id = divId;
    canvasDiv.querySelector("canvas").id = canvasId;
    container.appendChild(canvasDiv);
    if (statsName === "bweCompound") {
      container.insertBefore(
        createBweCompoundLegend(peerConnectionElement, report.id),
        $(divId)
      );
    }
    return new TimelineGraphView(divId, canvasId);
  }

  // Creates the legend section for the bweCompound graph.
  // Returns the legend element.
  function createBweCompoundLegend(peerConnectionElement, reportId) {
    const legend = document.createElement("div");
    for (const prop in bweCompoundGraphConfig) {
      const div = document.createElement("div");
      legend.appendChild(div);
      div.appendChild($("checkbox-template").content.cloneNode(true));
      div.appendChild(document.createTextNode(prop));
      div.style.color = bweCompoundGraphConfig[prop].color;
      div.dataSeriesId = reportId + "-" + prop;
      div.graphViewId =
        peerConnectionElement.id + "-" + reportId + "-bweCompound";
      div.firstChild.addEventListener("click", (event) => {
        const target = peerConnectionDataStore[
          peerConnectionElement.id
        ].getDataSeries(event.target.parentNode.dataSeriesId);
        target.show(event.target.checked);
        graphViews[event.target.parentNode.graphViewId].repaint();
      });
    }
    return legend;
  }

  // Copyright (c) 2013 The Chromium Authors. All rights reserved.

  const USER_MEDIA_TAB_ID = "user-media-tab-id";

  const OPTION_GETSTATS_STANDARD = "Standardized (promise-based) getStats() API";
  const OPTION_GETSTATS_LEGACY =
    "Legacy Non-Standard (callback-based) getStats() API";
  let currentGetStatsMethod = OPTION_GETSTATS_STANDARD;

  let tabView = null;
  let ssrcInfoManager$1 = null;
  let peerConnectionUpdateTable;
  let statsTable = null;

  // Exporting these on window since they are directly accessed by tests.
  window.setCurrentGetStatsMethod = (method) => {
    currentGetStatsMethod = method;
  };
  window.OPTION_GETSTATS_LEGACY = OPTION_GETSTATS_LEGACY;

  /** Maps from id (see getPeerConnectionId) to StatsRatesCalculator. */
  const statsRatesCalculatorById = new Map();

  // // Copyright (c) 2013 The Chromium Authors. All rights reserved.
  // Use of this source code is governed by a BSD-style license that can be
  // found in the LICENSE file.

  function initialize() {
    const root = $("content-root");
    if (root === null) {
      return;
    }
    new DumpCreator(root);
    root.appendChild(createStatsSelectionOptionElements());
    tabView = new TabView(root);
    ssrcInfoManager$1 = new SsrcInfoManager();
    peerConnectionUpdateTable = new PeerConnectionUpdateTable();
    statsTable = new StatsTable(ssrcInfoManager$1);

    createWebUIEvents();
  }

  function createStatsSelectionOptionElements() {
    const statsElement = $("stats-template").content.cloneNode(true);
    const selectElement = statsElement.getElementById("statsSelectElement");
    const legacyStatsElement = statsElement.getElementById(
      "legacy-stats-warning"
    );
    selectElement.onchange = () => {
      currentGetStatsMethod = selectElement.value;
      legacyStatsElement.style.display =
        currentGetStatsMethod === OPTION_GETSTATS_LEGACY ? "block" : "none";
      Object.keys(peerConnectionDataStore).forEach((id) => {
        const peerConnectionElement = $(id);
        statsTable.clearStatsLists(peerConnectionElement);
        removeStatsReportGraphs(peerConnectionElement);
        peerConnectionDataStore[id].resetStats();
      });
    };

    // 暂时不支持OPTION_GETSTATS_LEGACY to do @xiaoshumin
    [OPTION_GETSTATS_STANDARD].forEach((option) => {
      const optionElement = document.createElement("option");
      optionElement.setAttribute("value", option);
      optionElement.appendChild(document.createTextNode(option));
      selectElement.appendChild(optionElement);
    });

    selectElement.value = currentGetStatsMethod;
    return statsElement;
  }

  /**
   * A helper function for getting a peer connection element id.
   *
   * @param {!Object<number>} data The object containing the pid and lid of the
   *     peer connection.
   * @return {string} The peer connection element id.
   */
  function getPeerConnectionId(data) {
    return data.pid + "-" + data.lid;
  }

  /**
   * Extracts ssrc info from a setLocal/setRemoteDescription update.
   *
   * @param {!PeerConnectionUpdateEntry} data The peer connection update data.
   */
  function extractSsrcInfo(data) {
    if (
      data.type == "setLocalDescription" ||
      data.type == "setRemoteDescription"
    ) {
      ssrcInfoManager$1.addSsrcStreamInfo(data.value);
    }
  }

  /**
   * A helper function for appending a child element to |parent|.
   *
   * @param {!Element} parent The parent element.
   * @param {string} tag The child element tag.
   * @param {string} text The textContent of the new DIV.
   * @return {!Element} the new DIV element.
   */
  function appendChildWithText(parent, tag, text) {
    var child = document.createElement(tag);
    child.textContent = text;
    parent.appendChild(child);
    return child;
  }

  /**
   * Helper for adding a peer connection update.
   *
   * @param {Element} peerConnectionElement
   * @param {!PeerConnectionUpdateEntry} update The peer connection update data.
   */
  function addPeerConnectionUpdate(peerConnectionElement, update) {
    peerConnectionUpdateTable.addPeerConnectionUpdate(
      peerConnectionElement,
      update
    );
    extractSsrcInfo(update);
    peerConnectionDataStore[peerConnectionElement.id].addUpdate(update);
  }

  /**
   * Adds a peer connection.
   *
   * @param {!Object} data The object containing the pid, lid, url,
   *     rtcConfiguration, and constraints of a peer connection.
   */
  function addPeerConnection(data) {
    const id = getPeerConnectionId(data);

    if (!peerConnectionDataStore[id]) {
      peerConnectionDataStore[id] = new PeerConnectionRecord();
    }
    peerConnectionDataStore[id].initialize(
      data.pid,
      data.url,
      data.rtcConfiguration,
      data.constraints
    );

    let peerConnectionElement = $(id);
    if (!peerConnectionElement) {
      const details = `[ rid: ${data.rid}, lid: ${data.lid}, pid: ${data.pid} ]`;
      peerConnectionElement = tabView.addTab(id, data.url + " " + details);
    }

    const p = document.createElement("p");
    p.style.wordBreak = "break-all";
    appendChildWithText(p, "span", data.url);
    appendChildWithText(p, "span", ", ");
    appendChildWithText(p, "span", JSON.stringify(data.rtcConfiguration));
    if (data.constraints !== "") {
      appendChildWithText(p, "span", ", ");
      appendChildWithText(p, "span", data.constraints);
    }
    peerConnectionElement.appendChild(p);

    // Show deprecation notices as a list.
    // Note: data.rtcConfiguration is not in JSON format and may
    // not be defined in tests.
    const deprecationNotices = document.createElement("ul");
    if (data.rtcConfiguration) {
      deprecationNotices.className = "peerconnection-deprecations";
    }
    if (data.constraints) {
      if (data.constraints.indexOf("enableDtlsSrtp:") !== -1) {
        if (data.constraints.indexOf("enableDtlsSrtp: {exact: false}") !== -1) {
          appendChildWithText(
            deprecationNotices,
            "li",
            'The constraint "DtlsSrtpKeyAgreement" will be removed. You have ' +
              'specified a "false" value for this constraint, which is ' +
              'interpreted as an attempt to use the deprecated "SDES" key ' +
              "negotiation method. This functionality will be removed; use a " +
              "service that supports DTLS key negotiation instead."
          );
        } else {
          appendChildWithText(
            deprecationNotices,
            "li",
            'The constraint "DtlsSrtpKeyAgreement" will be removed. You have ' +
              'specified a "true" value for this constraint, which has no ' +
              "effect, but you can remove this constraint for tidiness."
          );
        }
      }
    }
    peerConnectionElement.appendChild(deprecationNotices);

    const iceConnectionStates = document.createElement("div");
    iceConnectionStates.textContent = "ICE connection state: new";
    iceConnectionStates.className = "iceconnectionstate";
    peerConnectionElement.appendChild(iceConnectionStates);

    const connectionStates = document.createElement("div");
    connectionStates.textContent = "Connection state: new";
    connectionStates.className = "connectionstate";
    peerConnectionElement.appendChild(connectionStates);

    const signalingStates = document.createElement("div");
    signalingStates.textContent = "Signaling state: new";
    signalingStates.className = "signalingstate";
    peerConnectionElement.appendChild(signalingStates);

    const candidatePair = document.createElement("div");
    candidatePair.textContent = "ICE Candidate pair: ";
    candidatePair.className = "candidatepair";
    candidatePair.appendChild(document.createElement("span"));
    peerConnectionElement.appendChild(candidatePair);

    createIceCandidateGrid(peerConnectionElement);

    return peerConnectionElement;
  }

  /**
   * Handles the report of stats.
   *
   * @param {!Object} data The object containing pid, lid, and reports, where
   *     reports is an array of stats reports. Each report contains id, type,
   *     and stats, where stats is the object containing timestamp and values,
   *     which is an array of strings, whose even index entry is the name of the
   *     stat, and the odd index entry is the value.
   */
  function addStats(data) {
    const peerConnectionElement = $(getPeerConnectionId(data));
    if (!peerConnectionElement) return;

    for (var i = 0; i < data.reports.length; ++i) {
      if (currentGetStatsMethod === OPTION_GETSTATS_STANDARD) {
        addStandardStats(data);
      } else {
        addLegacyStats(data);
      }
    }
  }

  /**
   * Handles the report of stats originating from the standard getStats() API.
   *
   * @param {!Object} data The object containing rid, lid, and reports, where
   *     reports is an array of stats reports. Each report contains id, type,
   *     and stats, where stats is the object containing timestamp and values,
   *     which is an array of strings, whose even index entry is the name of the
   *     stat, and the odd index entry is the value.
   */
  function addStandardStats(data) {
    if (currentGetStatsMethod != OPTION_GETSTATS_STANDARD) {
      return; // Obsolete!
    }
    const peerConnectionElement = $(getPeerConnectionId(data));
    if (!peerConnectionElement) {
      return;
    }
    const pcId = getPeerConnectionId(data);
    let statsRatesCalculator = statsRatesCalculatorById.get(pcId);
    if (!statsRatesCalculator) {
      statsRatesCalculator = new StatsRatesCalculator();
      statsRatesCalculatorById.set(pcId, statsRatesCalculator);
    }
    const r = StatsReport.fromInternalsReportList(data.reports);
    statsRatesCalculator.addStatsReport(r);
    data.reports = statsRatesCalculator.currentReport.toInternalsReportList();
    for (let i = 0; i < data.reports.length; ++i) {
      const report = data.reports[i];
      statsTable.addStatsReport(peerConnectionElement, report);
      if (getParameter("open_graph")) {
        drawSingleReport(peerConnectionElement, report, false);
      }
    }
    // Determine currently connected candidate pair.
    const stats = r.statsById;

    let activeCandidatePair = null;
    let remoteCandidate = null;
    let localCandidate = null;

    // Get the first active candidate pair. This ignores the rare case of
    // non-bundled connections.
    stats.forEach((report) => {
      if (report.type === "transport" && !activeCandidatePair) {
        activeCandidatePair = stats.get(report.selectedCandidatePairId);
      }
    });

    const candidateElement =
      peerConnectionElement.getElementsByClassName("candidatepair")[0]
        .firstElementChild;
    if (activeCandidatePair) {
      if (activeCandidatePair.remoteCandidateId) {
        remoteCandidate = stats.get(activeCandidatePair.remoteCandidateId);
      }
      if (activeCandidatePair.localCandidateId) {
        localCandidate = stats.get(activeCandidatePair.localCandidateId);
      }
      if (
        localCandidate &&
        localCandidate.address &&
        localCandidate.address.indexOf(":") !== -1
      ) {
        // Show IPv6 in []
        candidateElement.innerText =
          "[" +
          localCandidate.address +
          "]:" +
          localCandidate.port +
          " <=> [" +
          remoteCandidate.address +
          "]:" +
          remoteCandidate.port;
      } else {
        candidateElement.innerText =
          localCandidate.address +
          ":" +
          localCandidate.port +
          " <=> " +
          remoteCandidate.address +
          ":" +
          remoteCandidate.port;
      }

      // Mark active local-candidate, remote candidate and candidate pair
      // bold in the table.
      const statsContainer = document.getElementById(
        peerConnectionElement.id + "-table-container"
      );
      const activeConnectionClass = "stats-table-active-connection";
      statsContainer.childNodes.forEach((node) => {
        if (node.nodeName !== "DETAILS") {
          return;
        }
        const innerText = node.firstElementChild.innerText;
        if (
          innerText.startsWith(activeCandidatePair.id) ||
          innerText.startsWith(localCandidate.id) ||
          innerText.startsWith(remoteCandidate.id)
        ) {
          node.firstElementChild.classList.add(activeConnectionClass);
        } else {
          node.firstElementChild.classList.remove(activeConnectionClass);
        }
      });
      // Mark active candidate-pair graph bold.
      const statsGraphContainers = peerConnectionElement.getElementsByClassName(
        "stats-graph-container"
      );
      for (let i = 0; i < statsGraphContainers.length; i++) {
        const node = statsGraphContainers[i];
        if (node.nodeName !== "DETAILS") {
          continue;
        }
        if (!node.id.startsWith(pcId + "-candidate-pair")) {
          continue;
        }
        if (
          node.id ===
          pcId + "-candidate-pair-" + activeCandidatePair.id + "-graph-container"
        ) {
          node.firstElementChild.classList.add(activeConnectionClass);
        } else {
          node.firstElementChild.classList.remove(activeConnectionClass);
        }
      }
    } else {
      candidateElement.innerText = "(not connected)";
    }

    updateIceCandidateGrid(peerConnectionElement, r.statsById);
  }

  /**
   * Handles the report of stats originating from the legacy getStats() API.
   *
   * @param {!Object} data The object containing rid, lid, and reports, where
   *     reports is an array of stats reports. Each report contains id, type,
   *     and stats, where stats is the object containing timestamp and values,
   *     which is an array of strings, whose even index entry is the name of the
   *     stat, and the odd index entry is the value.
   */
  function addLegacyStats(data) {
    if (currentGetStatsMethod != OPTION_GETSTATS_LEGACY) {
      return; // Obsolete!
    }
    const peerConnectionElement = $(getPeerConnectionId(data));
    if (!peerConnectionElement) {
      return;
    }

    for (let i = 0; i < data.reports.length; ++i) {
      const report = data.reports[i];
      statsTable.addStatsReport(peerConnectionElement, report);
      drawSingleReport(peerConnectionElement, report, true);
    }
  }

  /**
   * Adds a getUserMedia request.
   *
   * @param {!Object} data The object containing rid {number}, pid {number},
   *     origin {string}, audio {string}, video {string}.
   */
  function addGetUserMedia(data) {
    userMediaRequests.push(data);

    if (!$(USER_MEDIA_TAB_ID)) {
      tabView.addTab(USER_MEDIA_TAB_ID, "GetUserMedia Requests");
    }

    var requestDiv = document.createElement("div");
    requestDiv.className = "user-media-request-div-class";
    requestDiv.rid = data.rid;
    $(USER_MEDIA_TAB_ID).appendChild(requestDiv);

    appendChildWithText(requestDiv, "div", "Caller origin: " + data.origin);
    appendChildWithText(requestDiv, "div", "Caller process id: " + data.pid);
    appendChildWithText(
      requestDiv,
      "span",
      "Audio Constraints"
    ).style.fontWeight = "bold";
    appendChildWithText(requestDiv, "div", data.audio);

    appendChildWithText(
      requestDiv,
      "span",
      "Video Constraints"
    ).style.fontWeight = "bold";
    appendChildWithText(requestDiv, "div", data.video);
  }

  const pid = Math.random().toString(36).substr(2, 10);
  function trace(method, id, args) {
    const url = location.href;
    // emulate webrtc-internals format
    let data = { lid: id, pid, type: method, time: Date.now() };
    data.value = args;
    switch (method) {
      case "create":
        data.url = url;
        data.rtcConfiguration = args[0];
        data.constraints = JSON.stringify(args[1]);
        addPeerConnection(data);
        break;
      case "navigator.mediaDevices.getUserMedia":
      case "navigator.getUserMedia":
        data = {
          rid: 0,
          pid: pid,
          origin: url,
          audio: JSON.stringify(args.audio),
          video: JSON.stringify(args.video),
          getUserMediaId: id,
        };
        addGetUserMedia(data);
        break;
      case "navigator.mediaDevices.getUserMediaOnSuccess":
      case "navigator.mediaDevices.getUserMediaOnFailure":
      case "navigator.getUserMediaOnSuccess":
      case "navigator.getUserMediaFailure":
        // TODO: find a way to display them.
        break;
      case "getStats":
        // webrtc-internals uses a weird format for the stats...
        data.reports = [];
        Object.keys(args).forEach(function (reportName) {
          var report = args[reportName];
          var values = [];
          Object.keys(report).forEach(function (statName) {
            if (statName === "timestamp") {
              return;
            }
            values.push(statName);
            values.push(report[statName]);
          });

          data.reports.push({
            type: report.type,
            id: report.id,
            stats: {
              timestamp: report.timestamp,
              values: values,
            },
          });
        });
        if (navigator.userAgent.indexOf("Edge") === -1) {
          addStats(data);
        }
        break;
      case "createOfferOnSuccess":
      case "setLocalDescription":
      case "setRemoteDescription":
        data.value = "type: " + args.type + ", sdp:\n" + args.sdp;
      // fall through
      default:
        addPeerConnectionUpdate($(getPeerConnectionId(data)), data);
    }
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

  // create listeners for all the updates that get sent from RTCPeerConnection.
  function createWebUIEvents() {
    let id = 0;
    const origPeerConnection = window.RTCPeerConnection;
    if (!origPeerConnection) {
      throw new Error("cannot find RTCPeerConnection in window");
    }

    // Rewrite RTCPeerConnection
    window.RTCPeerConnection = function () {
      const pc = new origPeerConnection(arguments[0], arguments[1]);
      pc._id = id++;
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
          window.setTimeout(poll, getParameter("stats_update_interval"));
        } else {
          trace("connectionstatechange", pc._id, pc.connectionState);
        }
        pc.getStats().then(function (stats) {
          trace("getStats", pc._id, map2obj(stats));
        });
      }, getParameter("stats_update_interval"));
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

  function dumpStream(stream) {
    return {
      id: stream.id,
      tracks: stream.getTracks().map(function (track) {
        return {
          id: track.id, // unique identifier (GUID) for the track
          kind: track.kind, // `audio` or `video`
          label: track.label, // identified the track source
          enabled: track.enabled, // application can control it
          muted: track.muted, // application cannot control it (read-only)
          readyState: track.readyState, // `live` or `ended`
        };
      }),
    };
  }
  var origGetUserMedia;
  var gum;
  if (navigator.getUserMedia) {
    origGetUserMedia = navigator.getUserMedia.bind(navigator);
    gum = function () {
      var id = Math.random().toString(36).substr(2, 10);
      trace("getUserMedia", id, arguments[0]);
      var cb = arguments[1];
      var eb = arguments[2];
      origGetUserMedia(
        arguments[0],
        function (stream) {
          // we log the stream id, track ids and tracks readystate since that is ended GUM fails
          // to acquire the cam (in chrome)
          trace("getUserMediaOnSuccess", id, dumpStream(stream));
          if (cb) {
            cb(stream);
          }
        },
        function (err) {
          trace("getUserMediaOnFailure", id, err.name);
          if (eb) {
            eb(err);
          }
        }
      );
    };
    navigator.getUserMedia = gum.bind(navigator);
  }
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices
    );
    gum = function () {
      var id = Math.random().toString(36).substr(2, 10);
      trace("navigator.mediaDevices.getUserMedia", id, arguments[0]);
      return origGetUserMedia.apply(navigator.mediaDevices, arguments).then(
        function (stream) {
          trace(
            "navigator.mediaDevices.getUserMediaOnSuccess",
            id,
            dumpStream(stream)
          );
          return stream;
        },
        function (err) {
          trace("navigator.mediaDevices.getUserMediaOnFailure", id, err.name);
          return Promise.reject(err);
        }
      );
    };
    navigator.mediaDevices.getUserMedia = gum.bind(navigator.mediaDevices);
  }

  /*
   * @Author: ltsg xiaoshumin@agora.io
   * @Date: 2022-11-16 18:32:35
   * @LastEditors: ltsg xiaoshumin@agora.io
   * @LastEditTime: 2022-11-16 23:41:08
   * @FilePath: /webrtc-internals-safari/src/index.js
   * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
   */

  // // document.addEventListener('DOMContentLoaded', initialize);
  initialize();

}));
