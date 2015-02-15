// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// Simplified version of:
// http://hg.mozilla.org/mozilla-central/file/3f4673b89e04/mobile/android/chrome/content/Reader.js

var Reader = {

  parseDocumentFromURL: function Reader_parseDocumentFromURL(url, callback) {
    try {
      // First, try to find a cached parsed article in the DB
      this.getArticleFromCache(url, function(article) {
        if (article) {
          callback(article);
          return;
        }

        // Article hasn't been found in the cache DB, we need to
        // download the page and parse the article out of it.
        this._downloadAndParseDocument(url, callback);
      }.bind(this));
    } catch (e) {
      console.error(e);
      callback(null);
    }
  },

  _downloadAndParseDocument: function Reader_downloadAndParseDocument(url, callback) {
    try {
      this._downloadDocument(url, function(doc) {
        if (!doc) {
          callback(null);
          return;
        }

        this._readerParse(doc, function (article) {
          if (!article) {
            callback(null);
            return;
          }

          callback(article);
        }.bind(this));
      }.bind(this));
    } catch (e) {
      console.error(e);
      callback(null);
    }
  },

  _downloadDocument: function Reader_downloadDocument(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onerror = evt => reject(evt.error);
    xhr.responseType = "document";
    xhr.onload = evt => {
      if (xhr.status !== 200) {
        callback(null);
        return;
      }

      var doc = xhr.responseXML;
      callback(doc);
    }
    xhr.send();
  },

  _readerParse: function Reader_readerParse(doc, callback) {
    var worker = new Worker("readerWorker.js");
    worker.onmessage = function (evt) {
      var article = evt.data;
      callback(article);
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
      console.error(e);
      callback(null);
    }
  },

  // IndexedDB cache

  getArticleFromCache: function Reader_getArticleFromCache(url, callback) {
    this._getCacheDB(function(cacheDB) {
      if (!cacheDB) {
        callback(false);
        return;
      }

      var transaction = cacheDB.transaction(cacheDB.objectStoreNames);
      var articles = transaction.objectStore(cacheDB.objectStoreNames[0]);
      var request = articles.get(url);

      request.onerror = function(event) {
        callback(null);
      }.bind(this);

      request.onsuccess = function(event) {
        callback(event.target.result);
      }.bind(this);
    }.bind(this));
  },

  storeArticleInCache: function Reader_storeArticleInCache(article, callback) {
    this._getCacheDB(function(cacheDB) {
      if (!cacheDB) {
        callback(false);
        return;
      }

      var transaction = cacheDB.transaction(cacheDB.objectStoreNames, "readwrite");
      var articles = transaction.objectStore(cacheDB.objectStoreNames[0]);
      var request = articles.add(article);

      request.onerror = function(event) {
        callback(false);
      }.bind(this);

      request.onsuccess = function(event) {
        callback(true);
      }.bind(this);
    }.bind(this));
  },

  removeArticleFromCache: function Reader_removeArticleFromCache(url, callback) {
    this._getCacheDB(function(cacheDB) {
      if (!cacheDB) {
        callback(false);
        return;
      }

      var transaction = cacheDB.transaction(cacheDB.objectStoreNames, "readwrite");
      var articles = transaction.objectStore(cacheDB.objectStoreNames[0]);
      var request = articles.delete(url);

      request.onerror = function(event) {
        callback(false);
      }.bind(this);

      request.onsuccess = function(event) {
        callback(true);
      }.bind(this);
    }.bind(this));
  },


  _getCacheDB: function Reader_getCacheDB(callback) {
    if (this._cacheDB) {
      callback(this._cacheDB);
      return;
    }

    var request = window.indexedDB.open("about:reader", this.DB_VERSION);

    request.onerror = function(event) {
      this._cacheDB = null;
      callback(null);
    }.bind(this);

    request.onsuccess = function(event) {
      this._cacheDB = event.target.result;
      callback(this._cacheDB);
    }.bind(this);

    request.onupgradeneeded = function(event) {
      var cacheDB = event.target.result;

      // Create the articles object store
      cacheDB.createObjectStore("articles", { keyPath: "url" });
    }.bind(this);
  }
};
