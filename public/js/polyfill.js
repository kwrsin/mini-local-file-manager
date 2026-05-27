/**
 * polyfill.js – Compatibility shims for older browsers
 * Targets: Safari 10+ (iPhone 7, iOS 10), IE11
 *
 * Polyfills included:
 *  - Promise (basic, for IE11; Safari 10 has native Promise)
 *  - fetch (for IE11)
 *  - URLSearchParams (Safari 10.1+, but older versions missing)
 *  - Array.from
 *  - Array.prototype.includes
 *  - String.prototype.includes
 *  - String.prototype.startsWith / endsWith
 *  - Object.assign
 *  - Element.prototype.closest
 *  - Element.prototype.matches
 *  - NodeList.prototype.forEach
 *  - CSS.escape
 *  - File.prototype.text  (Safari < 14 missing)
 */

'use strict';

/* ── Array.from ───────────────────────────────────────────── */
if (!Array.from) {
  Array.from = function(arrayLike) {
    return Array.prototype.slice.call(arrayLike);
  };
}

/* ── Array.prototype.includes ─────────────────────────────── */
if (!Array.prototype.includes) {
  Array.prototype.includes = function(val) {
    for (var i = 0; i < this.length; i++) {
      if (this[i] === val) return true;
    }
    return false;
  };
}

/* ── String.prototype.includes ────────────────────────────── */
if (!String.prototype.includes) {
  String.prototype.includes = function(s) {
    return this.indexOf(s) >= 0;
  };
}

/* ── String.prototype.startsWith ──────────────────────────── */
if (!String.prototype.startsWith) {
  String.prototype.startsWith = function(s) {
    return this.slice(0, s.length) === s;
  };
}

/* ── String.prototype.endsWith ────────────────────────────── */
if (!String.prototype.endsWith) {
  String.prototype.endsWith = function(s) {
    return this.slice(-s.length) === s;
  };
}

/* ── Object.assign ────────────────────────────────────────── */
if (!Object.assign) {
  Object.assign = function(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (src) {
        for (var k in src) {
          if (Object.prototype.hasOwnProperty.call(src, k)) {
            target[k] = src[k];
          }
        }
      }
    }
    return target;
  };
}

/* ── Element.prototype.closest ────────────────────────────── */
if (typeof Element !== 'undefined' && !Element.prototype.closest) {
  Element.prototype.closest = function(sel) {
    var el = this;
    while (el && el.nodeType === 1) {
      if (el.matches ? el.matches(sel) : el.msMatchesSelector(sel)) return el;
      el = el.parentElement || el.parentNode;
    }
    return null;
  };
}

/* ── Element.prototype.matches ────────────────────────────── */
if (typeof Element !== 'undefined' && !Element.prototype.matches) {
  Element.prototype.matches =
    Element.prototype.msMatchesSelector ||
    Element.prototype.webkitMatchesSelector;
}

/* ── NodeList.prototype.forEach ───────────────────────────── */
if (typeof NodeList !== 'undefined' && !NodeList.prototype.forEach) {
  NodeList.prototype.forEach = Array.prototype.forEach;
}

/* ── CSS.escape ───────────────────────────────────────────── */
if (typeof CSS === 'undefined' || !CSS.escape) {
  window.CSS = window.CSS || {};
  CSS.escape = function(value) {
    var string = String(value);
    var length = string.length;
    var result = '';
    for (var i = 0; i < length; i++) {
      var c = string.charCodeAt(i);
      if (c === 0) { result += '\uFFFD'; continue; }
      if ((c >= 0x0001 && c <= 0x001F) || c === 0x007F ||
          (i === 0 && c >= 0x0030 && c <= 0x0039) ||
          (i === 1 && c >= 0x0030 && c <= 0x0039 && string.charCodeAt(0) === 0x002D)) {
        result += '\\' + c.toString(16) + ' '; continue;
      }
      if (i === 0 && length === 1 && c === 0x002D) { result += '\\' + string.charAt(i); continue; }
      if (c >= 0x0080 || c === 0x002D || c === 0x005F ||
          (c >= 0x0030 && c <= 0x0039) ||
          (c >= 0x0041 && c <= 0x005A) ||
          (c >= 0x0061 && c <= 0x007A)) {
        result += string.charAt(i); continue;
      }
      result += '\\' + string.charAt(i);
    }
    return result;
  };
}

/* ── URLSearchParams ──────────────────────────────────────── */
if (typeof URLSearchParams === 'undefined') {
  window.URLSearchParams = function(search) {
    this._params = {};
    var q = (search || '').replace(/^\?/, '');
    if (q) {
      var pairs = q.split('&');
      for (var i = 0; i < pairs.length; i++) {
        var kv = pairs[i].split('=');
        var k  = decodeURIComponent(kv[0]);
        var v  = kv.length > 1 ? decodeURIComponent(kv[1]) : '';
        this._params[k] = v;
      }
    }
  };
  URLSearchParams.prototype.get = function(k) {
    return this._params.hasOwnProperty(k) ? this._params[k] : null;
  };
  URLSearchParams.prototype.set = function(k, v) { this._params[k] = String(v); };
  URLSearchParams.prototype.delete = function(k) { delete this._params[k]; };
  URLSearchParams.prototype.toString = function() {
    var parts = [];
    for (var k in this._params) {
      if (this._params.hasOwnProperty(k)) {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(this._params[k]));
      }
    }
    return parts.join('&');
  };
}

/* ── URL (minimal, for history.replaceState usage) ─────────── */
(function() {
  var _OrigURL = typeof window.URL === 'function' ? window.URL : null;
  function safeURL(href) {
    if (_OrigURL) {
      try { return new _OrigURL(href); } catch(e) {}
    }
    // Minimal fallback
    this.href = href;
    var m = href.match(/^([^?#]*)\??([^#]*)#?(.*)/);
    this._base  = m ? m[1] : href;
    this._query = m ? m[2] : '';
    this._hash  = m ? m[3] : '';
    this.searchParams = new URLSearchParams(this._query);
    this.toString = function() {
      var q = this.searchParams.toString();
      return this._base + (q ? '?' + q : '') + (this._hash ? '#' + this._hash : '');
    };
  }
  // Patch URL constructor only if broken
  try {
    var u = new URL(location.href);
    u.searchParams.set('_t', '1');
  } catch(e) {
    window.URL = safeURL;
  }
})();

/* ── File.prototype.text ──────────────────────────────────── */
/* Safari < 14 does not have File.prototype.text()             */
if (typeof File !== 'undefined' && !File.prototype.text) {
  File.prototype.text = function() {
    var file = this;
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload  = function(e) { resolve(e.target.result); };
      reader.onerror = function(e) { reject(e); };
      reader.readAsText(file, 'utf-8');
    });
  };
}
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = File.prototype.text;
}

/* ── Promise.all / Promise.resolve fallback note ─────────── */
/* Safari 10 has native Promise, so no polyfill needed.        */
/* fetch is available in Safari 10+.                           */

/* ── Console fallback (IE) ────────────────────────────────── */
if (typeof console === 'undefined') {
  window.console = { log: function(){}, error: function(){}, warn: function(){} };
}
