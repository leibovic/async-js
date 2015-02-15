// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// Inspired by:
// http://hg.mozilla.org/mozilla-central/file/tip/toolkit/components/reader/ReaderMode.jsm

var Reader = {

  getArticle: Task.async(function* (url) {
    var article = yield this._getArticleFromCache(url);
    if (article) {
      return article;
    }

    var doc = yield this._downloadDocument(url);
    var article = yield this._readerParse(doc);

    article.url = url;
    yield this._storeArticleInCache(article);

    return article;
  }),

  _downloadDocument: function(url) {
    return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.onerror = evt => reject(evt.error);
      xhr.responseType = "document";
      xhr.onload = evt => {
        if (xhr.status !== 200) {
          reject("Reader mode XHR failed with status: " + xhr.status);
          return;
        }
        var doc = xhr.responseXML;
        resolve(doc);
      }
      xhr.send();
    });
  },

  _readerParse: function(doc) {
    return new Promise((resolve, reject) => {
      var worker = new Worker("readerWorker.js");
      worker.onmessage = function (evt) {
        var article = evt.data;
        resolve(article);
      };

      worker.onerror = evt => {
        reject("Error in worker: " + evt.message);
      };

      // Hacks to get URI details, since we don't have nsIURI in web content.
      var l = document.createElement("a");
      l.href = doc.documentURI;

      try {
        worker.postMessage({
          uri: {
            spec: l.href,
            host: l.host,
            prePath: l.protocol + "//" + l.host,
            scheme: l.protocol.substr(0, l.protocol.indexOf(":")),
            pathBase: l.protocol + "//" + l.host + l.pathname.substr(0, l.pathname.lastIndexOf("/") + 1)
          },
          doc: new XMLSerializer().serializeToString(doc)
        });
      } catch (e) {
        reject("Reader: could not build Readability arguments: " + e);
      }
    });
  },

  // IndexedDB cache

  _getArticleFromCache: Task.async(function* (url) {
    var cacheDB = yield this._getCacheDB();
    var transaction = cacheDB.transaction(cacheDB.objectStoreNames);
    var articles = transaction.objectStore(cacheDB.objectStoreNames[0]);
    return yield this._dbRequest(articles.get(url));
  }),

  _storeArticleInCache: Task.async(function* (article) {
    var cacheDB = yield this._getCacheDB();
    var transaction = cacheDB.transaction(cacheDB.objectStoreNames, "readwrite");
    var articles = transaction.objectStore(cacheDB.objectStoreNames[0]);
    return yield this._dbRequest(articles.add(article));
  }),

  _removeArticleFromCache: Task.async(function* (url) {
    var cacheDB = yield this._getCacheDB();
    var transaction = cacheDB.transaction(cacheDB.objectStoreNames, "readwrite");
    var articles = transaction.objectStore(cacheDB.objectStoreNames[0]);
    return yield this._dbRequest(articles.delete(url));
  }),

  _dbRequest: function(request) {
    return new Promise((resolve, reject) => {
      request.onerror = event => reject(event.target.errorCode);
      request.onsuccess = event => resolve(event.target.result);
    });
  },

  _getCacheDB: function() {
    return new Promise((resolve, reject) => {
      if (this._cacheDB) {
        resolve(this._cacheDB);
        return;
      }

      var request = window.indexedDB.open("about:reader", 1);

      request.onerror = event => {
        this._cacheDB = null;
        reject("Error getting cache DB");
      };

      request.onsuccess = event => {
        this._cacheDB = event.target.result;
        resolve(this._cacheDB);
      };

      request.onupgradeneeded = event => {
        var cacheDB = event.target.result;

        // Create the articles object store
        cacheDB.createObjectStore("articles", { keyPath: "url" });
      };
    });
  }
};
