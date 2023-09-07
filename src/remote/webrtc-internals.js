// Copyright (c) 2013 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { $ } from "./utils";
import { PeerConnectionUpdateTable } from "./peer_connection_update_table";
import {
  DumpCreator,
  peerConnectionDataStore,
  userMediaRequests,
} from "./dump_creator";
import { TabView } from "./tab_view";
import { SsrcInfoManager } from "./ssrc_info_manager";
import { StatsTable } from "./stats_table";
import { PeerConnectionRecord } from "./peer_connection_record";
import { StatsRatesCalculator, StatsReport } from "./stats_rates_calculator.js";
import {
  createIceCandidateGrid,
  updateIceCandidateGrid,
} from "./candidate_grid.js";
import {
  drawSingleReport,
  removeStatsReportGraphs,
} from "./stats_graph_helper.js";
import { getParameter } from "./config/config";
import { initWebsocket } from "./inject";

const USER_MEDIA_TAB_ID = "user-media-tab-id";

const OPTION_GETSTATS_STANDARD = "Standardized (promise-based) getStats() API";
const OPTION_GETSTATS_LEGACY =
  "Legacy Non-Standard (callback-based) getStats() API";
let currentGetStatsMethod = OPTION_GETSTATS_STANDARD;

let tabView = null;
let ssrcInfoManager = null;
let peerConnectionUpdateTable;
let statsTable = null;
let dumpCreator;

// Exporting these on window since they are directly accessed by tests.
window.setCurrentGetStatsMethod = (method) => {
  currentGetStatsMethod = method;
};
window.OPTION_GETSTATS_LEGACY = OPTION_GETSTATS_LEGACY;

/** Maps from id (see getPeerConnectionId) to StatsRatesCalculator. */
const statsRatesCalculatorById = new Map();

// The maximum number of data points bufferred for each stats. Old data points
// will be shifted out when the buffer is full.
var MAX_STATS_DATA_POINT_BUFFER_SIZE = 1000;

// // Copyright (c) 2013 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * A TimelineDataSeries collects an ordered series of (time, value) pairs,
 * and converts them to graph points.  It also keeps track of its color and
 * current visibility state.
 * It keeps MAX_STATS_DATA_POINT_BUFFER_SIZE data points at most. Old data
 * points will be dropped when it reaches this size.
 */
var TimelineDataSeries = (function () {
  "use strict";

  /**
   * @constructor
   */
  function TimelineDataSeries() {
    // List of DataPoints in chronological order.
    this.dataPoints_ = [];

    // Default color.  Should always be overridden prior to display.
    this.color_ = "red";
    // Whether or not the data series should be drawn.
    this.isVisible_ = true;

    this.cacheStartTime_ = null;
    this.cacheStepSize_ = 0;
    this.cacheValues_ = [];
  }

  TimelineDataSeries.prototype = {
    /**
     * @override
     */
    toJSON: function () {
      if (this.dataPoints_.length < 1) return {};

      var values = [];
      for (var i = 0; i < this.dataPoints_.length; ++i) {
        values.push(this.dataPoints_[i].value);
      }
      return {
        startTime: this.dataPoints_[0].time,
        endTime: this.dataPoints_[this.dataPoints_.length - 1].time,
        values: JSON.stringify(values),
      };
    },

    /**
     * Adds a DataPoint to |this| with the specified time and value.
     * DataPoints are assumed to be received in chronological order.
     */
    addPoint: function (timeTicks, value) {
      var time = new Date(timeTicks);
      this.dataPoints_.push(new DataPoint(time, value));

      if (this.dataPoints_.length > MAX_STATS_DATA_POINT_BUFFER_SIZE)
        this.dataPoints_.shift();
    },

    isVisible: function () {
      return this.isVisible_;
    },

    show: function (isVisible) {
      this.isVisible_ = isVisible;
    },

    getColor: function () {
      return this.color_;
    },

    setColor: function (color) {
      this.color_ = color;
    },

    getCount: function () {
      return this.dataPoints_.length;
    },
    /**
     * Returns a list containing the values of the data series at |count|
     * points, starting at |startTime|, and |stepSize| milliseconds apart.
     * Caches values, so showing/hiding individual data series is fast.
     */
    getValues: function (startTime, stepSize, count) {
      // Use cached values, if we can.
      if (
        this.cacheStartTime_ == startTime &&
        this.cacheStepSize_ == stepSize &&
        this.cacheValues_.length == count
      ) {
        return this.cacheValues_;
      }

      // Do all the work.
      this.cacheValues_ = this.getValuesInternal_(startTime, stepSize, count);
      this.cacheStartTime_ = startTime;
      this.cacheStepSize_ = stepSize;

      return this.cacheValues_;
    },

    /**
     * Returns the cached |values| in the specified time period.
     */
    getValuesInternal_: function (startTime, stepSize, count) {
      var values = [];
      var nextPoint = 0;
      var currentValue = 0;
      var time = startTime;
      for (var i = 0; i < count; ++i) {
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
    },
  };

  /**
   * A single point in a data series.  Each point has a time, in the form of
   * milliseconds since the Unix epoch, and a numeric value.
   * @constructor
   */
  function DataPoint(time, value) {
    this.time = time;
    this.value = value;
  }

  return TimelineDataSeries;
})();

// // Copyright (c) 2013 The Chromium Authors. All rights reserved.
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
  if (report.type != "ssrc") {
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
    for (var i = 0; i < report.stats.values.length - 1; i += 2) {
      if (report.stats.values[i] == "ssrc") {
        return report.stats.values[i + 1];
      }
    }
  }
  return report.id;
}

// // Copyright (c) 2013 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

//
// This file contains helper methods to draw the stats timeline graphs.
// Each graph represents a series of stats report for a PeerConnection,
// e.g. 1234-0-ssrc-abcd123-bytesSent is the graph for the series of bytesSent
// for ssrc-abcd123 of PeerConnection 0 in process 1234.
// The graphs are drawn as CANVAS, grouped per report type per PeerConnection.
// Each group has an expand/collapse button and is collapsed initially.
//

// // Copyright (c) 2013 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * A TimelineGraphView displays a timeline graph on a canvas element.
 */
var TimelineGraphView = (function () {
  "use strict";

  // Maximum number of labels placed vertically along the sides of the graph.
  var MAX_VERTICAL_LABELS = 6;

  // Vertical spacing between labels and between the graph and labels.
  var LABEL_VERTICAL_SPACING = 4;
  // Horizontal spacing between vertically placed labels and the edges of the
  // graph.
  var LABEL_HORIZONTAL_SPACING = 3;
  // Horizintal spacing between two horitonally placed labels along the bottom
  // of the graph.
  var LABEL_LABEL_HORIZONTAL_SPACING = 25;

  // Length of ticks, in pixels, next to y-axis labels.  The x-axis only has
  // one set of labels, so it can use lines instead.
  var Y_AXIS_TICK_LENGTH = 10;

  var GRID_COLOR = "#CCC";
  var TEXT_COLOR = "#000";
  var BACKGROUND_COLOR = "#FFF";

  var MAX_DECIMAL_PRECISION = 2;
  /**
   * @constructor
   */
  function TimelineGraphView(divId, canvasId) {
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

  TimelineGraphView.prototype = {
    setScale: function (scale) {
      this.scale_ = scale;
    },

    // Returns the total length of the graph, in pixels.
    getLength_: function () {
      var timeRange = this.endTime_ - this.startTime_;
      // Math.floor is used to ignore the last partial area, of length less
      // than this.scale_.
      return Math.floor(timeRange / this.scale_);
    },

    /**
     * Returns true if the graph is scrolled all the way to the right.
     */
    graphScrolledToRightEdge_: function () {
      return this.scrollbar_.position_ == this.scrollbar_.range_;
    },

    /**
     * Update the range of the scrollbar.  If |resetPosition| is true, also
     * sets the slider to point at the rightmost position and triggers a
     * repaint.
     */
    updateScrollbarRange_: function (resetPosition) {
      var scrollbarRange = this.getLength_() - this.canvas_.width;
      if (scrollbarRange < 0) scrollbarRange = 0;

      // If we've decreased the range to less than the current scroll position,
      // we need to move the scroll position.
      if (this.scrollbar_.position_ > scrollbarRange) resetPosition = true;

      this.scrollbar_.range_ = scrollbarRange;
      if (resetPosition) {
        this.scrollbar_.position_ = scrollbarRange;
        this.repaint();
      }
    },

    /**
     * Sets the date range displayed on the graph, switches to the default
     * scale factor, and moves the scrollbar all the way to the right.
     */
    setDateRange: function (startDate, endDate) {
      this.startTime_ = startDate.getTime();
      this.endTime_ = endDate.getTime();

      // Safety check.
      if (this.endTime_ <= this.startTime_) this.startTime_ = this.endTime_ - 1;

      this.updateScrollbarRange_(true);
    },

    /**
     * Updates the end time at the right of the graph to be the current time.
     * Specifically, updates the scrollbar's range, and if the scrollbar is
     * all the way to the right, keeps it all the way to the right.  Otherwise,
     * leaves the view as-is and doesn't redraw anything.
     */
    updateEndDate: function (opt_date) {
      this.endTime_ = opt_date || new Date().getTime();
      this.updateScrollbarRange_(this.graphScrolledToRightEdge_());
    },

    getStartDate: function () {
      return new Date(this.startTime_);
    },

    /**
     * Replaces the current TimelineDataSeries with |dataSeries|.
     */
    setDataSeries: function (dataSeries) {
      // Simply recreates the Graph.
      this.graph_ = new Graph();
      for (var i = 0; i < dataSeries.length; ++i)
        this.graph_.addDataSeries(dataSeries[i]);
      this.repaint();
    },

    /**
     * Adds |dataSeries| to the current graph.
     */
    addDataSeries: function (dataSeries) {
      if (!this.graph_) this.graph_ = new Graph();
      this.graph_.addDataSeries(dataSeries);
      this.repaint();
    },

    /**
     * Draws the graph on |canvas_|.
     */
    repaint: function () {
      if (this.canvas_.offsetParent === null) {
        return; // dont repaint graphs that are not visible.
      }
      this.repaintTimerRunning_ = false;

      var width = this.canvas_.width;
      var height = this.canvas_.height;
      var context = this.canvas_.getContext("2d");

      // Clear the canvas.
      context.fillStyle = BACKGROUND_COLOR;
      context.fillRect(0, 0, width, height);

      // Try to get font height in pixels.  Needed for layout.
      var fontHeightString = context.font.match(/([0-9]+)px/)[1];
      var fontHeight = parseInt(fontHeightString);

      // Safety check, to avoid drawing anything too ugly.
      if (
        fontHeightString.length == 0 ||
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
      var position = this.scrollbar_.position_;
      // If the entire time range is being displayed, align the right edge of
      // the graph to the end of the time range.
      if (this.scrollbar_.range_ == 0)
        position = this.getLength_() - this.canvas_.width;
      var visibleStartTime = this.startTime_ + position * this.scale_;

      // Make space at the bottom of the graph for the time labels, and then
      // draw the labels.
      var textHeight = height;
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
    },

    /**
     * Draw time labels below the graph.  Takes in start time as an argument
     * since it may not be |startTime_|, when we're displaying the entire
     * time range.
     */
    drawTimeLabels: function (context, width, height, textHeight, startTime) {
      // Draw the labels 1 minute apart.
      var timeStep = 1000 * 60;

      // Find the time for the first label.  This time is a perfect multiple of
      // timeStep because of how UTC times work.
      var time = Math.ceil(startTime / timeStep) * timeStep;

      context.textBaseline = "bottom";
      context.textAlign = "center";
      context.fillStyle = TEXT_COLOR;
      context.strokeStyle = GRID_COLOR;

      // Draw labels and vertical grid lines.
      while (true) {
        var x = Math.round((time - startTime) / this.scale_);
        if (x >= width) break;
        var text = new Date(time).toLocaleTimeString();
        context.fillText(text, x, textHeight);
        context.beginPath();
        context.lineTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
        time += timeStep;
      }
    },

    getDataSeriesCount: function () {
      if (this.graph_) return this.graph_.dataSeries_.length;
      return 0;
    },

    hasDataSeries: function (dataSeries) {
      if (this.graph_) return this.graph_.hasDataSeries(dataSeries);
      return false;
    },
  };

  /**
   * A Graph is responsible for drawing all the TimelineDataSeries that have
   * the same data type.  Graphs are responsible for scaling the values, laying
   * out labels, and drawing both labels and lines for its data series.
   */
  var Graph = (function () {
    /**
     * @constructor
     */
    function Graph() {
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

    /**
     * A Label is the label at a particular position along the y-axis.
     * @constructor
     */
    function Label(height, text) {
      this.height = height;
      this.text = text;
    }

    Graph.prototype = {
      addDataSeries: function (dataSeries) {
        this.dataSeries_.push(dataSeries);
      },

      hasDataSeries: function (dataSeries) {
        for (var i = 0; i < this.dataSeries_.length; ++i) {
          if (this.dataSeries_[i] == dataSeries) return true;
        }
        return false;
      },

      /**
       * Returns a list of all the values that should be displayed for a given
       * data series, using the current graph layout.
       */
      getValues: function (dataSeries) {
        if (!dataSeries.isVisible()) return null;
        return dataSeries.getValues(this.startTime_, this.scale_, this.width_);
      },

      /**
       * Updates the graph's layout.  In particular, both the max value and
       * label positions are updated.  Must be called before calling any of the
       * drawing functions.
       */
      layout: function (width, height, fontHeight, startTime, scale) {
        this.width_ = width;
        this.height_ = height;
        this.fontHeight_ = fontHeight;
        this.startTime_ = startTime;
        this.scale_ = scale;

        // Find largest value.
        var max = 0,
          min = 0;
        for (var i = 0; i < this.dataSeries_.length; ++i) {
          var values = this.getValues(this.dataSeries_[i]);
          if (!values) continue;
          for (var j = 0; j < values.length; ++j) {
            if (values[j] > max) max = values[j];
            else if (values[j] < min) min = values[j];
          }
        }

        this.layoutLabels_(min, max);
      },

      /**
       * Lays out labels and sets |max_|/|min_|, taking the time units into
       * consideration.  |maxValue| is the actual maximum value, and
       * |max_| will be set to the value of the largest label, which
       * will be at least |maxValue|. Similar for |min_|.
       */
      layoutLabels_: function (minValue, maxValue) {
        if (maxValue - minValue < 1024) {
          this.layoutLabelsBasic_(minValue, maxValue, MAX_DECIMAL_PRECISION);
          return;
        }

        // Find appropriate units to use.
        var units = ["", "k", "M", "G", "T", "P"];
        // Units to use for labels.  0 is '1', 1 is K, etc.
        // We start with 1, and work our way up.
        var unit = 1;
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
        for (var i = 0; i < this.labels_.length; ++i)
          this.labels_[i] += " " + units[unit];

        // Convert |min_|/|max_| back to unit '1'.
        this.min_ *= Math.pow(1024, unit);
        this.max_ *= Math.pow(1024, unit);
      },

      /**
       * Same as layoutLabels_, but ignores units.  |maxDecimalDigits| is the
       * maximum number of decimal digits allowed.  The minimum allowed
       * difference between two adjacent labels is 10^-|maxDecimalDigits|.
       */
      layoutLabelsBasic_: function (minValue, maxValue, maxDecimalDigits) {
        this.labels_ = [];
        var range = maxValue - minValue;
        // No labels if the range is 0.
        if (range == 0) {
          this.min_ = this.max_ = maxValue;
          return;
        }

        // The maximum number of equally spaced labels allowed.  |fontHeight_|
        // is doubled because the top two labels are both drawn in the same
        // gap.
        var minLabelSpacing = 2 * this.fontHeight_ + LABEL_VERTICAL_SPACING;

        // The + 1 is for the top label.
        var maxLabels = 1 + this.height_ / minLabelSpacing;
        if (maxLabels < 2) {
          maxLabels = 2;
        } else if (maxLabels > MAX_VERTICAL_LABELS) {
          maxLabels = MAX_VERTICAL_LABELS;
        }

        // Initial try for step size between conecutive labels.
        var stepSize = Math.pow(10, -maxDecimalDigits);
        // Number of digits to the right of the decimal of |stepSize|.
        // Used for formating label strings.
        var stepSizeDecimalDigits = maxDecimalDigits;

        // Pick a reasonable step size.
        while (true) {
          // If we use a step size of |stepSize| between labels, we'll need:
          //
          // Math.ceil(range / stepSize) + 1
          //
          // labels.  The + 1 is because we need labels at both at 0 and at
          // the top of the graph.

          // Check if we can use steps of size |stepSize|.
          if (Math.ceil(range / stepSize) + 1 <= maxLabels) break;
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
          if (stepSizeDecimalDigits > 0) --stepSizeDecimalDigits;
        }

        // Set the min/max so it's an exact multiple of the chosen step size.
        this.max_ = Math.ceil(maxValue / stepSize) * stepSize;
        this.min_ = Math.floor(minValue / stepSize) * stepSize;

        // Create labels.
        for (var label = this.max_; label >= this.min_; label -= stepSize)
          this.labels_.push(label.toFixed(stepSizeDecimalDigits));
      },

      /**
       * Draws tick marks for each of the labels in |labels_|.
       */
      drawTicks: function (context) {
        var x1;
        var x2;
        x1 = this.width_ - 1;
        x2 = this.width_ - 1 - Y_AXIS_TICK_LENGTH;

        context.fillStyle = GRID_COLOR;
        context.beginPath();
        for (var i = 1; i < this.labels_.length - 1; ++i) {
          // The rounding is needed to avoid ugly 2-pixel wide anti-aliased
          // lines.
          var y = Math.round((this.height_ * i) / (this.labels_.length - 1));
          context.moveTo(x1, y);
          context.lineTo(x2, y);
        }
        context.stroke();
      },

      /**
       * Draws a graph line for each of the data series.
       */
      drawLines: function (context) {
        // Factor by which to scale all values to convert them to a number from
        // 0 to height - 1.
        var scale = 0;
        var bottom = this.height_ - 1;
        if (this.max_) scale = bottom / (this.max_ - this.min_);

        // Draw in reverse order, so earlier data series are drawn on top of
        // subsequent ones.
        for (var i = this.dataSeries_.length - 1; i >= 0; --i) {
          var values = this.getValues(this.dataSeries_[i]);
          if (!values) continue;
          context.strokeStyle = this.dataSeries_[i].getColor();
          context.beginPath();
          for (var x = 0; x < values.length; ++x) {
            // The rounding is needed to avoid ugly 2-pixel wide anti-aliased
            // horizontal lines.
            context.lineTo(
              x,
              bottom - Math.round((values[x] - this.min_) * scale)
            );
          }
          context.stroke();
        }
      },

      /**
       * Draw labels in |labels_|.
       */
      drawLabels: function (context) {
        if (this.labels_.length == 0) return;
        var x = this.width_ - LABEL_HORIZONTAL_SPACING;

        // Set up the context.
        context.fillStyle = TEXT_COLOR;
        context.textAlign = "right";

        // Draw top label, which is the only one that appears below its tick
        // mark.
        context.textBaseline = "top";
        context.fillText(this.labels_[0], x, 0);

        // Draw all the other labels.
        context.textBaseline = "bottom";
        var step = (this.height_ - 1) / (this.labels_.length - 1);
        for (var i = 1; i < this.labels_.length; ++i)
          context.fillText(this.labels_[i], x, step * i);
      },
    };

    return Graph;
  })();

  return TimelineGraphView;
})();

var STATS_GRAPH_CONTAINER_HEADING_CLASS = "stats-graph-container-heading";

var RECEIVED_PROPAGATION_DELTA_LABEL =
  "googReceivedPacketGroupPropagationDeltaDebug";
var RECEIVED_PACKET_GROUP_ARRIVAL_TIME_LABEL =
  "googReceivedPacketGroupArrivalTimeDebug";

// Specifies which stats should be drawn on the 'bweCompound' graph and how.
var bweCompoundGraphConfig = {
  googAvailableSendBandwidth: { color: "red" },
  googTargetEncBitrateCorrected: { color: "purple" },
  googActualEncBitrate: { color: "orange" },
  googRetransmitBitrate: { color: "blue" },
  googTransmitBitrate: { color: "green" },
};

// Converts the last entry of |srcDataSeries| from the total amount to the
// amount per second.
var totalToPerSecond = function (srcDataSeries) {
  var length = srcDataSeries.dataPoints_.length;
  if (length >= 2) {
    var lastDataPoint = srcDataSeries.dataPoints_[length - 1];
    var secondLastDataPoint = srcDataSeries.dataPoints_[length - 2];
    return (
      ((lastDataPoint.value - secondLastDataPoint.value) * 1000) /
      (lastDataPoint.time - secondLastDataPoint.time)
    );
  }

  return 0;
};

// Converts the value of total bytes to bits per second.
var totalBytesToBitsPerSecond = function (srcDataSeries) {
  return totalToPerSecond(srcDataSeries) * 8;
};

// Specifies which stats should be converted before drawn and how.
// |convertedName| is the name of the converted value, |convertFunction|
// is the function used to calculate the new converted value based on the
// original dataSeries.
var dataConversionConfig = {
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
    convertFunction: function (srcDataSeries) {
      var length = srcDataSeries.dataPoints_.length;
      var lastDataPoint = srcDataSeries.dataPoints_[length - 1];
      if (lastDataPoint.value < 5000) return lastDataPoint.value * 1000;
      return lastDataPoint.value;
    },
  },
};

// Get report types for SSRC reports. Returns 'audio' or 'video' where this type
// can be deduced from existing stats labels. Otherwise empty string for
// non-SSRC reports or where type (audio/video) can't be deduced.
function getSsrcReportType(report) {
  if (report.type != "ssrc") return "";
  if (report.stats && report.stats.values) {
    // Known stats keys for audio send/receive streams.
    if (
      report.stats.values.indexOf("audioOutputLevel") != -1 ||
      report.stats.values.indexOf("audioInputLevel") != -1
    ) {
      return "audio";
    }
    // Known stats keys for video send/receive streams.
    // TODO(pbos): Change to use some non-goog-prefixed stats when available for
    // video.
    if (
      report.stats.values.indexOf("googFrameRateReceived") != -1 ||
      report.stats.values.indexOf("googFrameRateSent") != -1
    ) {
      return "video";
    }
  }
  return "";
}

// // Copyright (c) 2013 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export function initialize(url) {
  url && initWebsocket(url);

  const root = $("content-root");
  if (root === null) {
    return;
  }
  dumpCreator = new DumpCreator(root);
  root.appendChild(createStatsSelectionOptionElements());
  tabView = new TabView(root);
  ssrcInfoManager = new SsrcInfoManager();
  peerConnectionUpdateTable = new PeerConnectionUpdateTable();
  statsTable = new StatsTable(ssrcInfoManager);
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
export function getPeerConnectionId(data) {
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
    ssrcInfoManager.addSsrcStreamInfo(data.value);
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
export function addPeerConnectionUpdate(peerConnectionElement, update) {
  peerConnectionUpdateTable.addPeerConnectionUpdate(
    peerConnectionElement,
    update
  );
  extractSsrcInfo(update);
  peerConnectionDataStore[peerConnectionElement.id].addUpdate(update);
}

/** Browser message handlers. */

/**
 * Removes all information about a peer connection.
 *
 * @param {!Object<number>} data The object containing the pid and lid of a peer
 *     connection.
 */
function removePeerConnection(data) {
  var element = $(getPeerConnectionId(data));
  if (element) {
    delete peerConnectionDataStore[element.id];
    tabView.removeTab(element.id);
  }
}

/**
 * Adds a peer connection.
 *
 * @param {!Object} data The object containing the pid, lid, url,
 *     rtcConfiguration, and constraints of a peer connection.
 */
export function addPeerConnection(data) {
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
export function addStats(data) {
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
export function addGetUserMedia(data) {
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

/**
 * Removes the getUserMedia requests from the specified |rid|.
 *
 * @param {!Object} data The object containing rid {number}, the render id.
 */
function removeGetUserMediaForRenderer(data) {
  for (var i = userMediaRequests.length - 1; i >= 0; --i) {
    if (userMediaRequests[i].rid == data.rid) userMediaRequests.splice(i, 1);
  }

  var requests = $(USER_MEDIA_TAB_ID).childNodes;
  for (var i = 0; i < requests.length; ++i) {
    if (requests[i].rid == data.rid)
      $(USER_MEDIA_TAB_ID).removeChild(requests[i]);
  }
  if ($(USER_MEDIA_TAB_ID).childNodes.length == 0)
    tabView.removeTab(USER_MEDIA_TAB_ID);
}

/**
 * Notification that the audio debug recordings file selection dialog was
 * cancelled, i.e. recordings have not been enabled.
 */
function audioDebugRecordingsFileSelectionCancelled() {
  dumpCreator.disableAudioDebugRecordings();
}

/**
 * Notification that the event log recordings file selection dialog was
 * cancelled, i.e. recordings have not been enabled.
 */
function eventLogRecordingsFileSelectionCancelled() {
  dumpCreator.disableEventLogRecordings();
}

/**
 * Set
 */
function enableAudioDebugRecordings() {
  dumpCreator.enableAudioDebugRecordings();
}
