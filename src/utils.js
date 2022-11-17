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
export function $(id) {
  var el = document.getElementById(id);
  return el ? assertInstanceof(el, HTMLElement) : null;
}

/**
 * 动态加载js文件
 * @param {*} hrefUrl 文件地址
 * @returns Promise
 */
export function loadCss(hrefUrl) {
  return new Promise((resolve, reject) => {
    // 判断当前css是否已经加载过
    const linkNodes = [].slice
      .call(document.querySelectorAll("link"))
      .map((item) => item.href);
    if (linkNodes.includes(hrefUrl)) return resolve();

    const link = document.createElement("link");
    link.type = "text/css";
    link.rel = "stylesheet";
    link.href = hrefUrl;
    document.head.appendChild(link);
    link.onload = () => {
      resolve();
    };
    link.onerror = (err) => {
      reject(err);
    };
  });
}
