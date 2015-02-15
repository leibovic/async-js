
var ReaderMode = {
  promiseDocument: function (url) {
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

        // Manually follow a meta refresh tag if one exists.
        var meta = doc.querySelector("meta[http-equiv=refresh]");
        if (meta) {
          var content = meta.getAttribute("content");
          if (content) {
            var urlIndex = content.indexOf("URL=");
            if (urlIndex > -1) {
              var url = content.substring(urlIndex + 4);
              this.promiseDocument(url).then((doc) => resolve(doc));
              return;
            }
          }
        }
        resolve(doc);
      }
      xhr.send();
    });
  },
};
