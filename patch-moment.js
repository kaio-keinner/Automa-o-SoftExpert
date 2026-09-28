// patch-moment.js - Executa no mundo MAIN para interceptar parsing de datas DD/MM/YYYY no Moment.js do SoftExpert
(function() {
  function aplicarPatch(m) {
    if (!m || m.__seCustomFallback) return;
    m.__seCustomFallback = true;
    var prevFallback = m.createFromInputFallback;
    m.createFromInputFallback = function(config) {
      if (typeof config._i === 'string') {
        var match = config._i.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (match) {
          var d = parseInt(match[1], 10);
          var mo = parseInt(match[2], 10) - 1;
          var y = parseInt(match[3], 10);
          config._d = new Date(y, mo, d, 12, 0, 0);
          config._isValid = true;
          return;
        }
      }
      if (typeof prevFallback === 'function') {
        prevFallback(config);
      } else {
        config._d = new Date(config._i);
      }
    };
    console.log("[SoftExpert-Obsidian] ✅ Patch do Moment.js ativo para datas brasileiras DD/MM/YYYY!");
  }

  if (window.moment) {
    aplicarPatch(window.moment);
  }

  // Intercepta caso o moment seja instanciado ou reatribuído depois
  try {
    var _origMoment = window.moment;
    Object.defineProperty(window, 'moment', {
      configurable: true,
      enumerable: true,
      get: function() { return _origMoment; },
      set: function(val) {
        _origMoment = val;
        aplicarPatch(val);
      }
    });
  } catch(e) {}
})();
