/** A simple class to store the updates and stats data for a peer connection. */
/** @constructor */
export class PeerConnectionRecord {
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
