// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// Inspired by:
// http://hg.mozilla.org/mozilla-central/file/3f4673b89e04/mobile/android/chrome/content/Reader.js

var Reader = {

  getArticle: function(url) {
    // return this._getArticleFromCache(url).then((article) => {
    //   return article;
    // }, (reason) => {
      return this._downloadDocument(url)
        .then(this._parseDocument)
        .then((article) => {
          return this._storeArticleInCache(url, article)
            .then(() => {
              return article;
            });
        });
    //});
  },

  _downloadDocument: function(url) {
    return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.onerror = (event) => reject(event.error);
      xhr.responseType = "document";
      xhr.onload = (event) => {
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

  _parseDocument: function(doc) {
    return new Promise((resolve, reject) => {
      var worker = new Worker("readerWorker.js");
      worker.onmessage = function (event) {
        var article = event.data;
        resolve(article);
      };

      worker.onerror = (event) => reject("Error in worker: " + event.message);

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

  _getArticleFromCache: function(url) {
    return new Promise((resolve, reject) => {
      this._getCacheDB().then((cacheDB) => {
        var transaction = cacheDB.transaction(cacheDB.objectStoreNames);
        var articles = transaction.objectStore(cacheDB.objectStoreNames[0]);
        var request = articles.get(url);

        request.onerror = (event) => reject(event.target.errorCode);
        request.onsuccess = (event) => resolve(event.target.result);
      });
    });
  },

  _storeArticleInCache: function(url, article) {
    return new Promise((resolve, reject) => {
      this._getCacheDB().then((cacheDB) => {
        var transaction = cacheDB.transaction(cacheDB.objectStoreNames, "readwrite");
        var articles = transaction.objectStore(cacheDB.objectStoreNames[0]);

        // Use url as a key
        article.url = url;
        var request = articles.add(article);

        request.onerror = (event) => reject(event.target.errorCode);
        request.onsuccess = (event) => resolve(event.target.result);
      });
    });
  },

  _removeArticleFromCache: function(url) {
    return new Promise((resolve, reject) => {
      this._getCacheDB().then((cacheDB) => {
        var transaction = cacheDB.transaction(cacheDB.objectStoreNames, "readwrite");
        var articles = transaction.objectStore(cacheDB.objectStoreNames[0]);
        var request = articles.delete(url);

        request.onerror = (event) => reject(event.target.errorCode);
        request.onsuccess = (event) => resolve(event.target.result);
      });
    });
  },

  _getCacheDB: function() {
    return new Promise((resolve, reject) => {
      if (this._cacheDB) {
        resolve(this._cacheDB);
        return;
      }

      var request = window.indexedDB.open("about:reader", 1);

      request.onerror = (event) => {
        this._cacheDB = null;
        reject("Error getting cache DB");
      };

      request.onsuccess = (event) => {
        this._cacheDB = event.target.result;
        resolve(this._cacheDB);
      };

      request.onupgradeneeded = (event) => {
        var cacheDB = event.target.result;
        cacheDB.createObjectStore("articles", { keyPath: "url" });
      };
    });
  }
};
