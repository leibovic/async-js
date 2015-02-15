// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// Inspired by:
// http://hg.mozilla.org/mozilla-central/file/3f4673b89e04/mobile/android/chrome/content/Reader.js

var Reader = {

  getArticle: function(url, callback) {
    try {
      this._getArticleFromCache(url, (article) => {
        if (article) {
          callback(article);
          return;
        }
        this._downloadDocument(url, (doc) => {
          if (!doc) {
            callback(null);
            return;
          }

          this._parseDocument(doc, (article) => {
            if (!article) {
              callback(null);
              return;
            }
            this._storeArticleInCache(url, article, function(){});
            callback(article);
          });
        });
      });
    } catch (e) {
      callback(null);
    }
  },

  _downloadDocument: function(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onerror = (event) => reject(event.error);
    xhr.responseType = "document";
    xhr.onload = (event) => {
      if (xhr.status !== 200) {
        callback(null);
        return;
      }
      var doc = xhr.responseXML;
      callback(doc);
    }
    xhr.send();
  },

  _parseDocument: function(doc, callback) {
    var worker = new Worker("readerWorker.js");
    worker.onmessage = (event) => {
      var article = event.data;
      callback(article);
    };

    worker.onerror = (event) => callback(null);

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
      callback(null);
    }
  },

  // IndexedDB cache

  _getArticleFromCache: function(url, callback) {
    this._getCacheDB((cacheDB) => {
      if (!cacheDB) {
        callback(false);
        return;
      }

      var transaction = cacheDB.transaction(cacheDB.objectStoreNames);
      var articles = transaction.objectStore(cacheDB.objectStoreNames[0]);
      var request = articles.get(url);

      request.onerror = (event) => callback(null);
      request.onsuccess = (event) => callback(event.target.result);
    });
  },

  _storeArticleInCache: function(url, article, callback) {
    this._getCacheDB((cacheDB) => {
      if (!cacheDB) {
        callback(false);
        return;
      }

      var transaction = cacheDB.transaction(cacheDB.objectStoreNames, "readwrite");
      var articles = transaction.objectStore(cacheDB.objectStoreNames[0]);

      // Use url as a key
      article.url = url;
      var request = articles.add(article);

      request.onerror = (event) => callback(false);
      request.onsuccess = (event) => callback(true);
    });
  },

  _removeArticleFromCache: function(url, callback) {
    this._getCacheDB((cacheDB) => {
      if (!cacheDB) {
        callback(false);
        return;
      }

      var transaction = cacheDB.transaction(cacheDB.objectStoreNames, "readwrite");
      var articles = transaction.objectStore(cacheDB.objectStoreNames[0]);
      var request = articles.delete(url);

      request.onerror = (event) => callback(false);
      request.onsuccess = (event) => callback(true);
    });
  },


  _getCacheDB: function(callback) {
    if (this._cacheDB) {
      callback(this._cacheDB);
      return;
    }

    var request = window.indexedDB.open("about:reader", this.DB_VERSION);

    request.onerror = (event) => {
      this._cacheDB = null;
      callback(null);
    };

    request.onsuccess = (event) => {
      this._cacheDB = event.target.result;
      callback(this._cacheDB);
    };

    request.onupgradeneeded = (event) => {
      var cacheDB = event.target.result;
      cacheDB.createObjectStore("articles", { keyPath: "url" });
    };
  }
};
