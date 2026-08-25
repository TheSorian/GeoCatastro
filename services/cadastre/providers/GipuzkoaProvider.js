import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';

/**
 * Conversión precisa de coordenadas WGS84 (Lat, Lon) a UTM Huso 30N (EPSG:25830)
 */
function latLonToUtm30N(lat, lon) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e2 = 2 * f - f * f;
  const ePrime2 = e2 / (1 - e2);

  const latRad = lat * (Math.PI / 180);
  const lonRad = lon * (Math.PI / 180);
  const lon0Rad = -3 * (Math.PI / 180); // Meridiano central del Huso 30 (-3°)

  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = ePrime2 * Math.cos(latRad) * Math.cos(latRad);
  const A = Math.cos(latRad) * (lonRad - lon0Rad);

  const M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * latRad
    - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * latRad)
    + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * latRad)
    - (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * latRad));

  const k0 = 0.9996;
  const x = 500000 + k0 * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ePrime2) * Math.pow(A, 5) / 120);
  const y = k0 * (M + N * Math.tan(latRad) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ePrime2) * Math.pow(A, 6) / 720));

  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Conversión inversa de UTM Huso 30N (EPSG:25830) a WGS84 (Lat, Lon)
 */
function utm30NToLatLon(x, y) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e2 = 2 * f - f * f;
  const ePrime2 = e2 / (1 - e2);

  const k0 = 0.9996;
  const x0 = 500000.0;
  const y0 = 0.0;

  const xRel = x - x0;
  const yRel = y - y0;

  const M = yRel / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const J1 = (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32);
  const J2 = (21 * Math.pow(e1, 2) / 16 - 55 * Math.pow(e1, 4) / 32);
  const J3 = (151 * Math.pow(e1, 3) / 96);
  const J4 = (1097 * Math.pow(e1, 4) / 512);

  const fp = mu + J1 * Math.sin(2 * mu) + J2 * Math.sin(4 * mu) + J3 * Math.sin(6 * mu) + J4 * Math.sin(8 * mu);

  const C1 = ePrime2 * Math.pow(Math.cos(fp), 2);
  const T1 = Math.pow(Math.tan(fp), 2);
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.pow(Math.sin(fp), 2), 1.5);
  const N1 = a / Math.sqrt(1 - e2 * Math.pow(Math.sin(fp), 2));

  const D = xRel / (N1 * k0);

  const latRad = fp - (N1 * Math.tan(fp) / R1) * (
    Math.pow(D, 2) / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * Math.pow(C1, 2) - 9 * ePrime2) * Math.pow(D, 4) / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * Math.pow(T1, 2) - 252 * ePrime2 - 3 * Math.pow(C1, 2)) * Math.pow(D, 6) / 720
  );

  const lonRad = (-3 * Math.PI / 180) + (
    D
    - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * Math.pow(C1, 2) + 8 * ePrime2 + 24 * Math.pow(T1, 2)) * Math.pow(D, 5) / 120
  ) / Math.cos(fp);

  return {
    lat: latRad * (180 / Math.PI),
    lon: lonRad * (180 / Math.PI)
  };
}

/**
 * Proveedor para el Catastro Foral de Gipuzkoa (Guipúzcoa)
 * Utiliza los servicios oficiales de b5m y la Sede de Catastro de la Diputación Foral de Gipuzkoa
 */
export class GipuzkoaProvider {
  constructor() {
    this.wmsBase = 'https://b5m.gipuzkoa.eus/inspire/wms/gipuzkoa_wms';
  }

  /**
   * Consulta WMS GetFeatureInfo en proyección UTM 30N
   */
  async _queryGipuzkoaWMS(x, y) {
    try {
      const delta = 60;
      const bbox = `${x - delta},${y - delta},${x + delta},${y + delta}`;
      const url = `${this.wmsBase}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&LAYERS=cp.CadastralParcel&QUERY_LAYERS=cp.CadastralParcel&INFO_FORMAT=application/vnd.ogc.gml&X=50&Y=50&WIDTH=101&HEIGHT=101&SRS=EPSG:25830&BBOX=${bbox}`;

      const res = await fetch(url);
      if (!res.ok) return null;
      const xml = await res.text();

      const refMatch = xml.match(/<NCADASTREF>([^<]+)<\/NCADASTREF>/i);
      const inspireMatch = xml.match(/<INSPIREID>([^<]+)<\/INSPIREID>/i);
      const areaMatch = xml.match(/<AREAVALUE>([^<]+)<\/AREAVALUE>/i);

      if (refMatch && refMatch[1]) {
        const refCat = refMatch[1].trim();
        const inspireId = inspireMatch ? inspireMatch[1].trim() : '';
        const areaValue = areaMatch ? Math.round(parseFloat(areaMatch[1])) : '';

        // Formato INSPIRE: ES.GFA.CP.[MMM]-[NCADASTREF]-[PARCELA]
        let munCode = '';
        let parCode = '';
        if (inspireId) {
          const parts = inspireId.split('-');
          if (parts.length >= 3) {
            const munPart = parts[0].split('.');
            munCode = munPart[munPart.length - 1] || '';
            parCode = parts[2] || '';
          }
        }

        return {
          refCat,
          inspireId,
          areaValue,
          munCode: parseInt(munCode, 10) || munCode || '69',
          parCode
        };
      }
    } catch (e) {
      console.warn('Error consultando WMS b5m Gipuzkoa:', e);
    }
    return null;
  }

  /**
   * Obtiene la referencia catastral a partir de coordenadas
   */
  async fetchParcelByCoords(lat, lon) {
    try {
      const { x, y } = latLonToUtm30N(lat, lon);
      let info = await this._queryGipuzkoaWMS(x, y);

      // Sondeo en 4 direcciones si el clic cae cerca del borde
      if (!info) {
        const offsets = [
          [20, 20],
          [-20, -20],
          [20, -20],
          [-20, 20],
          [35, 0],
          [-35, 0],
          [0, 35],
          [0, -35]
        ];
        for (const [dx, dy] of offsets) {
          const pInfo = await this._queryGipuzkoaWMS(x + dx, y + dy);
          if (pInfo) {
            info = pInfo;
            break;
          }
        }
      }

      if (info && info.refCat) {
        return {
          found: true,
          ref: info.refCat,
          lat,
          lon,
          munName: 'Gipuzkoa'
        };
      }
    } catch (e) {
      console.warn('Error en fetchParcelByCoords Gipuzkoa:', e);
    }
    return { found: false, lat, lon };
  }

  /**
   * Obtiene los detalles completos de la parcela e inmuebles (con desglose de unidades)
   */
  async fetchFullParcelDetails(refCat, lat, lon) {
    try {
      let info = null;
      if (lat && lon) {
        const { x, y } = latLonToUtm30N(lat, lon);
        info = await this._queryGipuzkoaWMS(x, y);
      }

      const cleanRef = info?.refCat || refCat || 'Gipuzkoa';
      const parCode = info?.parCode || '';
      const munCode = String(info?.munCode || '69');
      const superficie = info?.areaValue ? `${info.areaValue} m²` : '';

      let subparcels = [];
      let mainAddress = parCode ? `Parcela ${parCode} (${cleanRef})` : `Referencia ${cleanRef} (Gipuzkoa)`;

      const isRustic = cleanRef.includes('-');
      let rusticRef = cleanRef;
      if (isRustic) {
        const segs = cleanRef.split('-');
        if (segs.length === 3) {
          rusticRef = `${segs[1]}-${segs[2]}`;
        }
      }

      if (isRustic) {
        // --- PARCELA RÚSTICA ---
        try {
          const tooltipUrl = `https://ssl6.gipuzkoa.eus/Catastro/tooltip/rustica.aspx?id=${encodeURIComponent(rusticRef)}&idioma=esp&aytoId=${encodeURIComponent(munCode)}&herr=1`;
          const res = await fetch(tooltipUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          let refMapaUrl = '';
          if (res.ok) {
            const html = await res.text();
            const linkMatch = html.match(/href=['"]([^'"]*refMapa\.asp[^'"]*)['"]/i);
            if (linkMatch) {
              refMapaUrl = linkMatch[1].replace(/&amp;/g, '&');
            }
          }

          if (!refMapaUrl) {
            const [pol, par] = rusticRef.split('-');
            refMapaUrl = `https://ssl7.gipuzkoa.net/OgasunaNet/Rustico/refMapa.asp?Cod_munic=${encodeURIComponent(munCode)}&poligono=${encodeURIComponent(pol)}&parcela=${encodeURIComponent(par)}&origen=unidad_grafica&Idioma=Cas`;
          }

          let cultivos = [];
          try {
            const resM = await fetch(refMapaUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://ssl6.gipuzkoa.eus/'
              }
            });
            if (resM.ok) {
              const htmlM = await resM.text();
              const subSecIdx = htmlM.indexOf('Datos de subParcelas');
              if (subSecIdx !== -1) {
                const subHtml = htmlM.substring(subSecIdx);
                const rows = [...subHtml.matchAll(/<tr[^>]*bgcolor="#FFFFFF"[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
                rows.forEach((r, idx) => {
                  const cols = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
                  if (cols.length >= 2) {
                    const cultivo = cols[0] || 'RÚSTICO';
                    const sup = cols[1] ? `${cols[1]} m²` : '';
                    cultivos.push({
                      id: `${rusticRef}-${idx + 1}`,
                      refCat: rusticRef,
                      ref20: rusticRef,
                      cargo: String(idx + 1).padStart(3, '0'),
                      address: `Polígono ${rusticRef.split('-')[0]}, Parcela ${rusticRef.split('-')[1]}`,
                      interior: `Subparcela ${idx + 1} (${sup} · ${cultivo})`,
                      superficie: sup,
                      uso: cultivo,
                      muni: munCode,
                      prov: 'Gipuzkoa',
                      del: '20',
                      mun: munCode,
                      parCode: rusticRef,
                      polCode: rusticRef.split('-')[0] || '',
                      subareaCode: String(idx + 1)
                    });
                  }
                });
              }
            }
          } catch (errM) {
            console.warn('Error en refMapa rústica:', errM);
          }

          const [pol, par] = rusticRef.split('-');
          mainAddress = `Polígono ${pol}, Parcela ${par}`;
          if (cultivos.length > 0) {
            subparcels = cultivos;
          }
        } catch (errRustic) {
          console.warn('Error obteniendo desglose rústico Gipuzkoa:', errRustic);
        }
      } else {
        // --- PARCELA URBANA ---
        try {
          const tooltipUrl = `https://ssl6.gipuzkoa.eus/Catastro/tooltip/urbana.aspx?id=${encodeURIComponent(cleanRef)}&idioma=esp&aytoId=${encodeURIComponent(munCode)}&herr=1`;
          const res = await fetch(tooltipUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          let sCode = '0001';
          let portalNum = '001';
          let streetName = '';

          if (res.ok) {
            const html = await res.text();
            const linkMatch = html.match(/href=['"][^'"]*refMapa\.asp\?([^'"]+)['"]/i);
            if (linkMatch) {
              const rawParams = linkMatch[1].replace(/&amp;/g, '&');
              const qMatchCalle = rawParams.match(/Calle=([^&]+)/i);
              const qMatchPortal = rawParams.match(/Portal=([^&]+)/i);
              if (qMatchCalle) sCode = qMatchCalle[1];
              if (qMatchPortal) portalNum = qMatchPortal[1];
            }
            const rowMatch = html.match(/<tr[^>]*class="textGrid"[^>]*>([\s\S]*?)<\/tr>/i);
            if (rowMatch) {
              const cols = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
              if (cols[0]) streetName = cols[0];
            }

            // Consultar el listado completo de fincas en refMapa.asp
            const refMapaUrl = `https://ssl7.gipuzkoa.net/OgasunaNet/Catastro/refMapa.asp?Municipio=${encodeURIComponent(munCode)}&RefCatastral=${encodeURIComponent(cleanRef)}&Calle=${encodeURIComponent(sCode)}&Portal=${encodeURIComponent(portalNum)}&Idioma=Cas`;
            const resM = await fetch(refMapaUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://ssl6.gipuzkoa.eus/'
              }
            });

            if (resM.ok) {
              const htmlM = await resM.text();
              const fincasMatches = [...htmlM.matchAll(/<tr[^>]*bgcolor="#FFFFFF"[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
              if (fincasMatches.length > 0) {
                const cleanPortal = portalNum.replace(/^0+/, '');
                if (streetName) {
                  mainAddress = `C/ ${streetName} ${cleanPortal}`.trim();
                }

                subparcels = fincasMatches.map((rowHtml, idx) => {
                  const fnMatch = rowHtml.match(/EnviarDatosFinca\('([^']+)',\s*'([^']+)'\)/i);
                  const cols = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
                  const fincaId = fnMatch ? fnMatch[1] : (cols[0] ? cols[0].split(' ')[0] : `${cleanRef}-${idx + 1}`);
                  const digito = fnMatch ? fnMatch[2] : (cols[0] && cols[0].split(' ')[1] ? cols[0].split(' ')[1] : '');
                  const esc = cols[1] && cols[1] !== '-' ? `Esc. ${cols[1]}` : '';
                  const planta = cols[2] && cols[2] !== '-' ? `Planta ${cols[2]}` : '';
                  const mano = cols[3] && cols[3] !== '-' ? `Mano ${cols[3]}` : '';
                  const destino = cols[4] || 'INMUEBLE';
                  const sup = cols[5] ? `${cols[5]} m²` : '';

                  const doorParts = [planta, mano, esc].filter(Boolean).join(' - ');
                  const interior = doorParts ? `${doorParts} (${sup} · ${destino})` : `Finca ${fincaId} ${digito} (${sup} · ${destino})`;
                  const addr = streetName ? `C/ ${streetName} ${cleanPortal}` : `Parcela ${cleanRef}`;

                  return {
                    id: `${fincaId}${digito ? `-${digito}` : ''}`,
                    refCat: cleanRef,
                    ref20: `${fincaId}${digito ? ` ${digito}` : ''}`,
                    fincaId,
                    codDigito: digito,
                    cargo: String(idx + 1).padStart(3, '0'),
                    address: addr,
                    interior,
                    superficie: sup,
                    uso: destino,
                    muni: munCode,
                    prov: 'Gipuzkoa',
                    del: '20',
                    mun: munCode,
                    parCode: cleanRef,
                    polCode: '',
                    subareaCode: String(idx + 1)
                  };
                });
              }
            }
          }
        } catch (errScrap) {
          console.warn('Error obteniendo desglose Gipuzkoa:', errScrap);
        }
      }

      if (subparcels.length === 0) {
        const fallbackRef = isRustic ? rusticRef : cleanRef;
        subparcels = [
          {
            id: fallbackRef,
            ref20: fallbackRef,
            cargo: '001',
            address: mainAddress,
            interior: isRustic ? `Parcela Rústica ${fallbackRef}` : 'Parcela / Inmueble Único',
            muni: munCode,
            prov: 'Gipuzkoa',
            del: '20',
            mun: munCode,
            parCode: fallbackRef,
            polCode: isRustic ? (fallbackRef.split('-')[0] || '') : '',
            subareaCode: '1'
          }
        ];
      }

      return {
        parcelDetails: {
          refCat: cleanRef,
          ref20: cleanRef,
          lat,
          lon,
          address: mainAddress,
          count: subparcels.length,
          del: '20',
          mun: munCode,
          parCode,
          superficie,
          noExactBuilding: false
        },
        subparcels
      };
    } catch (e) {
      console.warn('Error en fetchFullParcelDetails Gipuzkoa:', e);
    }

    return {
      parcelDetails: {
        refCat: refCat || 'Gipuzkoa',
        ref20: refCat || 'Gipuzkoa',
        lat,
        lon,
        address: 'Ubicación Seleccionada (Gipuzkoa)',
        count: 1,
        del: '20',
        mun: '69',
        noExactBuilding: false
      },
      subparcels: [{ id: refCat, ref20: refCat, interior: 'Parcela', address: 'Gipuzkoa' }]
    };
  }

  /**
   * Abre la ficha oficial en la Sede / Visor de Gipuzkoa
   */
  async openOfficialFicha(refCat, delCode, munCode, parCode, subareaCode, polCode) {
    try {
      const ayto = parseInt(munCode, 10) || '69';
      let clean = String(refCat || '').trim();
      const isRustic = clean.includes('-');
      if (isRustic) {
        const segs = clean.split('-');
        if (segs.length === 3) {
          clean = `${segs[1]}-${segs[2]}`;
        }
      }
      const pageType = isRustic ? 'rustica' : 'urbana';
      // URL oficial de la ficha catastral de Gipuzkoa (detalles, subparcelas, descargas GML/SHP/KML/DXF)
      const url = `https://ssl6.gipuzkoa.eus/Catastro/tooltip/${pageType}.aspx?id=${encodeURIComponent(clean)}&idioma=esp&aytoId=${encodeURIComponent(ayto)}&herr=1`;
      await WebBrowser.openBrowserAsync(url, {
        toolbarColor: '#0055a5', // Azul oficial de Gipuzkoa
        controlsColor: '#ffffff',
        showTitle: true,
      });
    } catch (e) {
      Alert.alert('Error', 'No se pudo abrir la Ficha de Gipuzkoa.');
    }
  }

  /**
   * Obtiene la geometría vectorial de la parcela para el sistema de imán (snapping)
   */
  async fetchParcelGeometry(refCat, lat, lon) {
    if (!lat || !lon) return [];
    try {
      const { x, y } = latLonToUtm30N(lat, lon);
      const url = `https://b5m.gipuzkoa.eus/api/2.0/topoquery2?coors=${x},${y}&lang=es`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return [];
      const json = await res.json();
      for (const f of (json.features || [])) {
        if (f.geometry && f.geometry.coordinates) {
          let rings = f.geometry.coordinates;
          if (f.geometry.type === 'MultiPolygon') rings = rings[0];
          const outerRing = rings[0];
          const vertices = outerRing.map(pt => utm30NToLatLon(pt[0], pt[1]));
          return vertices;
        }
      }
    } catch (e) {
      console.warn('Error obteniendo geometría Gipuzkoa:', e);
    }
    return [];
  }

  /**
   * Obtiene coordenadas a partir de la referencia
   */
  async getCoordsFromRC(rc) {
    try {
      const url = `https://b5m.gipuzkoa.eus/api/2.0/toposearch2?q=${encodeURIComponent(rc)}&lang=es`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return { found: false };
      const json = await res.json();
      const docs = json?.response?.docs || [];
      if (docs.length > 0 && docs[0].lat && docs[0].lon) {
        return {
          found: true,
          lat: parseFloat(docs[0].lat),
          lon: parseFloat(docs[0].lon),
          address: docs[0].display_name
        };
      }
    } catch (e) {}
    return { found: false };
  }

  /**
   * URL del WMS para Gipuzkoa
   */
  getWMSUrl() {
    return 'https://b5m.gipuzkoa.eus/inspire/wms/gipuzkoa_wms';
  }

  /**
   * Capas WMS para Gipuzkoa
   */
  getWMSLayers() {
    return 'cp.CadastralParcel,bu.building,ad.Address';
  }
}
