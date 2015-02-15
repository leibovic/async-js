/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

importScripts("JSDOMParser.js", "Readability.js");

self.onmessage = function (msg) {
  var uri = msg.data.uri;
  var doc = new JSDOMParser().parse(msg.data.doc);
  var article = new Readability(uri, doc).parse();
  postMessage(article);
};
