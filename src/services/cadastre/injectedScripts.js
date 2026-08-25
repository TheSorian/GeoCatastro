/**
 * Generador de script para el Visor In-App de Gipuzkoa
 */
export const getGipuzkoaInjectedJs = (targetFinca = '', targetDigito = '') => `
  (function() {
    try {
      var meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes';
      document.getElementsByTagName('head')[0].appendChild(meta);

      var style = document.createElement('style');
      style.innerHTML = \`
        html, body {
          overflow-x: auto !important;
          overflow-y: auto !important;
          min-width: 100% !important;
          margin: 0 !important;
          padding: 8px !important;
          background-color: #ffffff !important;
          box-sizing: border-box !important;
          -webkit-text-size-adjust: 100% !important;
        }
        * {
          box-sizing: border-box !important;
        }
        form {
          float: none !important;
          width: 100% !important;
          display: block !important;
        }
        table {
          width: 100% !important;
          max-width: 100% !important;
          border-collapse: collapse !important;
          table-layout: auto !important;
        }
        #bodyTable, #tblParcelas {
          width: 100% !important;
          display: table !important;
        }
        tr {
          display: table-row !important;
          visibility: visible !important;
        }
        td, th {
          font-size: 13px !important;
          line-height: 1.4 !important;
          padding: 6px 4px !important;
          white-space: normal !important;
          word-break: break-word !important;
          display: table-cell !important;
          visibility: visible !important;
        }
        .textSec td, tr.textSec td {
          background-color: #666666 !important;
          color: #ffffff !important;
          font-weight: bold !important;
          font-size: 12px !important;
        }
        .textGrid td, tr.textGrid td {
          background-color: #f9f9f9 !important;
          color: #000000 !important;
          font-size: 13px !important;
        }
        a {
          color: #0055a5 !important;
          text-decoration: underline !important;
          font-weight: bold !important;
          font-size: 13px !important;
        }
        .header {
          font-size: 15px !important;
          font-weight: bold !important;
          padding: 8px !important;
          background-color: #0055a5 !important;
          color: #ffffff !important;
        }
        .downGroup {
          min-height: 60px !important;
          padding: 6px !important;
          border: 1px solid #ccc !important;
          border-radius: 6px !important;
          background-color: #f5f5f5 !important;
        }
        .selector1, .selector2, img[src*="flecha"], img[src*="contaritos"] {
          display: none !important;
        }
      \`;
      document.getElementsByTagName('head')[0].appendChild(style);
    } catch (e) {}

    var targetFinca = ${JSON.stringify(targetFinca)};
    var targetDigito = ${JSON.stringify(targetDigito)};

    var currentUrl = window.location.href;
    if (currentUrl.indexOf('urbana.aspx') !== -1 && targetFinca) {
      var verLink = document.querySelector('table#tblParcelas a[href*="refMapa.asp"]');
      if (verLink) {
        setTimeout(function() {
          window.location.href = verLink.href;
        }, 300);
      }
    }

    if (currentUrl.indexOf('refCatastral.asp') !== -1 && targetFinca) {
      if (typeof EnviarDatosFinca === 'function') {
        setTimeout(function() {
          EnviarDatosFinca(targetFinca, targetDigito);
        }, 300);
      }
    }
  })();
  true;
`;

/**
 * Generador de script de autorrellenado automático para Bizkaia
 */
export const getBizkaiaInjectedJs = (dni, parcelRef, isBI = false, targetNumFijo = '', targetDoor = '', targetCargo = '') => `
  (function() {
    var dni = ${JSON.stringify(dni)};
    var ref = ${JSON.stringify(parcelRef)};
    var isBI = ${isBI};
    var targetNumFijo = ${JSON.stringify(targetNumFijo)};
    var targetDoor = ${JSON.stringify(targetDoor)};
    var targetCargo = ${JSON.stringify(targetCargo)};

    window.latestPdfUrl = '';
    window.latestPdfBase64 = '';

    window.triggerSharePdf = function() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'TRIGGER_SHARE'
        }));
      }
    };

    function loadPdfJs(callback) {
      if (window.pdfjsLib) {
        callback();
        return;
      }
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = function() {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        callback();
      };
      document.head.appendChild(script);
    }

    function renderPdfPages(docTab, fullUrl) {
      if (docTab.getAttribute('data-pdf-rendered')) return;
      docTab.setAttribute('data-pdf-rendered', 'true');

      fetch(fullUrl, { credentials: 'include' })
        .then(function(res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.blob();
        })
        .then(function(blob) {
          var reader = new FileReader();
          reader.onloadend = function() {
            var base64data = reader.result;
            window.latestPdfBase64 = base64data;
            
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'PDF_BASE64',
                dataUrl: base64data,
                url: fullUrl
              }));
            }

            var banner = document.createElement('div');
            banner.style.cssText = 'padding:14px;background:#fef2f2;border:2px solid #ef4444;border-radius:10px;margin:12px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.1);';
            banner.innerHTML = '<p style="font-weight:bold;color:#991b1b;margin-bottom:10px;font-size:15px;">📄 Ficha Catastral Oficial Lista</p>' +
              '<button type="button" onclick="window.triggerSharePdf()" style="display:inline-block;background:#cc0000;color:#fff;font-weight:bold;padding:12px 24px;border-radius:8px;border:none;font-size:15px;box-shadow:0 3px 6px rgba(0,0,0,0.2);cursor:pointer;">📤 GUARDAR / COMPARTIR FICHA</button>' +
              '<div id="pdf-canvas-container" style="margin-top:15px;"><p style="color:#666;font-size:13px;">Cargando visor de páginas...</p></div>';
            docTab.insertBefore(banner, docTab.firstChild);

            loadPdfJs(function() {
              if (!window.pdfjsLib) return;
              var raw = window.atob(base64data.split(',')[1]);
              var rawLength = raw.length;
              var array = new Uint8Array(new ArrayBuffer(rawLength));
              for (var i = 0; i < rawLength; i++) {
                array[i] = raw.charCodeAt(i);
              }

              window.pdfjsLib.getDocument({ data: array }).promise.then(function(pdfDoc) {
                var container = document.getElementById('pdf-canvas-container');
                if (container) container.innerHTML = '';
                var numPages = pdfDoc.numPages;
                for (var pageNum = 1; pageNum <= numPages; pageNum++) {
                  (function(num) {
                    pdfDoc.getPage(num).then(function(page) {
                      var viewport = page.getViewport({ scale: 1.5 });
                      var canvas = document.createElement('canvas');
                      var ctx = canvas.getContext('2d');
                      canvas.height = viewport.height;
                      canvas.width = viewport.width;
                      canvas.style.cssText = 'max-width:100%;height:auto;margin:10px auto;border:1px solid #ccc;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.15);display:block;background:#fff;';
                      if (container) container.appendChild(canvas);

                      page.render({
                        canvasContext: ctx,
                        viewport: viewport
                      });
                    });
                  })(pageNum);
                }
              });
            });
          };
          reader.readAsDataURL(blob);
        })
        .catch(function(err) {
          var banner = document.createElement('div');
          banner.style.cssText = 'padding:14px;background:#fef2f2;border:2px solid #ef4444;border-radius:10px;margin:12px;text-align:center;';
          banner.innerHTML = '<p style="font-weight:bold;color:#991b1b;margin-bottom:10px;">📄 Ficha Catastral Lista</p>' +
            '<button type="button" onclick="window.triggerSharePdf()" style="background:#cc0000;color:#fff;font-weight:bold;padding:12px 24px;border-radius:8px;border:none;cursor:pointer;">📤 GUARDAR / COMPARTIR FICHA</button>';
          docTab.insertBefore(banner, docTab.firstChild);
        });
    }

    setInterval(function() {
      try {
        var docTab = document.getElementById('form1:resultadopdf:idTabResultadopdfCDocumentoCodigo');
        if (docTab) {
          var ifr = docTab.querySelector('iframe, object, embed');
          var pSrc = ifr ? (ifr.src || ifr.data) : '';
          if (pSrc && !pSrc.includes('recaptcha') && !pSrc.includes('google.com') && !pSrc.includes('gstatic')) {
            var fullPSrc = pSrc.startsWith('/') ? (window.location.origin + pSrc) : pSrc;
            window.latestPdfUrl = fullPSrc;
            renderPdfPages(docTab, fullPSrc);
            
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'PDF_READY',
                url: fullPSrc
              }));
            }
          }
        }

        var pdfLinks = document.querySelectorAll('a[href*=".pdf"], iframe[src*=".pdf"], object[data*=".pdf"], embed[src*=".pdf"]');
        for (var p = 0; p < pdfLinks.length; p++) {
          var pEl = pdfLinks[p];
          var linkSrc = pEl.href || pEl.src || pEl.data;
          if (linkSrc && !linkSrc.includes('recaptcha') && !linkSrc.includes('google.com') && !linkSrc.includes('gstatic') && !pEl.getAttribute('data-pdf-notified')) {
            pEl.setAttribute('data-pdf-notified', 'true');
            var fullLinkSrc = linkSrc.startsWith('/') ? (window.location.origin + linkSrc) : linkSrc;
            window.latestPdfUrl = fullLinkSrc;
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'PDF_READY',
                url: fullLinkSrc
              }));
            }
          }
        }
      } catch (e) {}
    }, 500);

    function fillField(id, val) {
      var el = document.getElementById(id);
      if (el) {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      return el;
    }

    function startAutofill() {
      try {
        var grafRadio = document.getElementById('form1:grafico:0');
        if (grafRadio && !grafRadio.checked) {
          grafRadio.checked = true;
          if (typeof PrimeFaces !== 'undefined' && PrimeFaces.ab) {
            PrimeFaces.ab({
              s: "form1:grafico",
              e: "change",
              p: "form1:grafico",
              u: "form1:panelFiltroGrafico",
              ps: true
            });
          } else if (grafRadio.onchange) {
            grafRadio.onchange();
          }
        }

        fillField('form1:textNifSolicitanteFichaCatastral', dni);
        fillField('form1:panelBusquedaNifCheckSolicitanteFichaCatastral', '1');
        
        if (typeof buscarSolicitanteFichaCatastral === 'function') {
          buscarSolicitanteFichaCatastral();
        }

        setTimeout(function() {
          var radioId = isBI ? 'form1:consolePublico:1' : 'form1:consolePublico:3';
          var inputId = isBI ? 'form1:textBI' : 'form1:textParcela';

          var radioOpt = document.getElementById(radioId);
          if (radioOpt) {
            radioOpt.checked = true;
            if (typeof PrimeFaces !== 'undefined' && PrimeFaces.ab) {
              PrimeFaces.ab({
                s: "form1:consolePublico",
                e: "change",
                p: "form1:consolePublico",
                u: "form1:panelSeleccionFichaCatastral form1:panelBotoneraBuscar"
              });
            } else if (radioOpt.onchange) {
              radioOpt.onchange();
            }
          }

          var attempts = 0;
          var interval = setInterval(function() {
            attempts++;
            var textInput = document.getElementById(inputId);
            var btnBuscar = document.getElementById('form1:cmdButtonBuscar');
            if (textInput && btnBuscar) {
              clearInterval(interval);
              fillField(inputId, ref);
              setTimeout(function() {
                btnBuscar.click();
                waitForResultsAndHighlight();
              }, 400);
            }
            if (attempts > 30) clearInterval(interval);
          }, 300);
        }, 600);
      } catch (e) {
        console.error('Error autorrellenando Bizkaia:', e);
      }
    }

    function waitForResultsAndHighlight() {
      var resAttempts = 0;
      var resInterval = setInterval(function() {
        resAttempts++;
        var rows = document.querySelectorAll('tr[role="row"]');
        if (rows.length > 1) {
          clearInterval(resInterval);
          var matchedRow = null;
          
          for (var i = 1; i < rows.length; i++) {
            var rowText = rows[i].innerText || '';
            if (targetNumFijo && rowText.includes(targetNumFijo)) {
              matchedRow = rows[i];
              break;
            }
            if (targetDoor && rowText.toLowerCase().includes(targetDoor.toLowerCase().trim())) {
              matchedRow = rows[i];
              break;
            }
          }

          if (!matchedRow && rows.length > 1) {
            matchedRow = rows[1];
          }

          if (matchedRow) {
            matchedRow.style.backgroundColor = '#fff3cd';
            matchedRow.style.border = '2px solid #cc0000';
            matchedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            if (targetNumFijo || targetDoor) {
              var docLink = matchedRow.querySelector('a.ui-commandlink, a[id*="idCommandLinkCargaCaptchaFichaCatastral"]');
              if (docLink) {
                setTimeout(function() {
                  docLink.click();
                }, 600);
              }
            }
          }
        }
        if (resAttempts > 40) clearInterval(resInterval);
      }, 400);
    }

    if (document.readyState === 'complete') {
      setTimeout(startAutofill, 400);
    } else {
      window.addEventListener('load', function() { setTimeout(startAutofill, 400); });
    }
  })();
  true;
`;
