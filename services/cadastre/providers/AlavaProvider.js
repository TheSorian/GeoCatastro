import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';

export class AlavaProvider {
  /**
   * Helper para consultar WMS GetFeatureInfo en GeoAraba (WMS Katastroa)
   */
  async _queryGeoArabaWMS(lat, lon) {
    try {
      const delta = 0.0006;
      const bbox = (lon - delta) + ',' + (lat - delta) + ',' + (lon + delta) + ',' + (lat + delta);
      const urlGFI = 'https://geo.araba.eus/WMS_Katastroa?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&LAYERS=PartzelaHiritarrak_ParcelasUrbanas,PartzelaLandatarrak_ParcelasRusticas&QUERY_LAYERS=PartzelaHiritarrak_ParcelasUrbanas,PartzelaLandatarrak_ParcelasRusticas&INFO_FORMAT=application/vnd.ogc.gml&X=50&Y=50&WIDTH=101&HEIGHT=101&SRS=EPSG:4326&BBOX=' + bbox;

      const res = await fetch(urlGFI);
      if (!res.ok) return null;
      const xml = await res.text();

      const munMatch = xml.match(/MUNICIPIO="([^"]+)"/i);
      const polMatch = xml.match(/POLIGONO="([^"]+)"/i);
      const parMatch = xml.match(/TXPARCELA="([^"]+)"/i);
      const refMatch = xml.match(/REF_CATASTRAL="([^"]+)"/i);
      const txtMunMatch = xml.match(/TXT_MUNICIPIO="([^"]+)"/i);

      if (munMatch && polMatch && parMatch) {
        const rawMun = munMatch[1];
        const rawPol = polMatch[1];
        const rawPar = parMatch[1];
        return {
          munCode: String(parseInt(rawMun, 10)),
          polCode: String(parseInt(rawPol, 10)),
          parCode: String(parseInt(rawPar, 10)),
          refCat: refMatch ? refMatch[1] : (rawMun.padStart(3, '0') + rawPol.padStart(4, '0') + rawPar.padStart(4, '0')),
          munName: txtMunMatch ? txtMunMatch[1] : 'Álava'
        };
      }
    } catch(e) {
      console.warn('Error consultando WMS GeoAraba:', e);
    }
    return null;
  }

  /**
   * Obtiene los detalles completos de la parcela e inmuebles
   */
  async fetchFullParcelDetails(refCat, lat, lon) {
    try {
      let info = null;
      if (lat && lon) {
        info = await this._queryGeoArabaWMS(lat, lon);
      }

      let munCode = info?.munCode || '';
      let polCode = info?.polCode || '';
      let parCode = info?.parCode || '';
      let munName = info?.munName || 'Álava';
      let cleanRef = info?.refCat || refCat || '';

      // Si no tenemos lat/lon pero sí refCat de 20 dígitos:
      if (!info && refCat && refCat.length >= 11) {
        const clean = refCat.replace(/\D/g, '');
        if (clean.length >= 11) {
          munCode = String(parseInt(clean.substring(0, 3), 10));
          polCode = String(parseInt(clean.substring(3, 7), 10));
          parCode = String(parseInt(clean.substring(7, 11), 10));
        }
      }

      const mainAddress = `Parcela ${parCode}, Polígono ${polCode} (${munName})`;

      // Extraer subparcelas e inmuebles haciendo scraping del HTML oficial de Álava
      const parsedSubparcels = await this._fetchAlavaInmuebles(munCode, polCode, parCode, cleanRef, mainAddress);

      const realAddress = (parsedSubparcels[0]?.address && !parsedSubparcels[0].address.startsWith('Parcela')) 
        ? parsedSubparcels[0].address 
        : mainAddress;

      return {
        parcelDetails: {
          refCat: cleanRef,
          ref20: cleanRef,
          lat,
          lon,
          address: realAddress,
          count: parsedSubparcels.length,
          del: '01',
          mun: munCode,
          parCode: parCode,
          polCode: polCode,
          noExactBuilding: false
        },
        subparcels: parsedSubparcels
      };
    } catch(e) {
      console.warn('Error en fetchFullParcelDetails Álava:', e);
    }

    return {
      parcelDetails: {
        refCat: refCat || 'Álava',
        ref20: refCat || 'Álava',
        lat,
        lon,
        address: 'Ubicación Seleccionada (Álava / Araba)',
        count: 1,
        del: '01',
        mun: '',
        noExactBuilding: false
      },
      subparcels: [{ id: refCat, ref20: refCat, interior: 'Parcela', address: 'Álava' }]
    };
  }

  /**
   * Extrae los edificios e inmuebles de la parcela
   */
  async _fetchAlavaInmuebles(cMun, cPol, cPar, refCat, mainAddress) {
    let allSubparcels = [];
    if (!cMun || !cPol || !cPar) return allSubparcels;

    try {
      const urlEdificios = `https://catastroalava.tracasa.es/ref_catastral/edificios.aspx?C=${cMun}&PO=${cPol}&PA=${cPar}&lang=es`;
      const resEd = await fetch(urlEdificios);
      const htmlEd = await resEd.text();

      const edMatches = [...htmlEd.matchAll(/go\((\d+),this\)/g)].map(m => m[1]);
      const edificios = [...new Set(edMatches)];

      const edificiosToFetch = edificios.length > 0 ? edificios : ['1'];

      const fetchPromises = edificiosToFetch.map(async (ed) => {
        try {
          const urlUnidades = `https://catastroalava.tracasa.es/ref_catastral/unidades.aspx?C=${cMun}&PO=${cPol}&PA=${cPar}&S=&E=${ed}&lang=es`;
          const resU = await fetch(urlUnidades);
          const htmlU = await resU.text();

          const dirMatch = htmlU.match(/Direcci[oó]n:\s*<\/td><td class=valor>([^<]+)<\/td>/i);
          const subAddress = dirMatch ? dirMatch[1].trim() : mainAddress;

          const rows = htmlU.split('<tr align="center">');
          let parsed = [];

          for (let i = 1; i < rows.length; i++) {
            const chunk = rows[i].split('</tr>')[0];
            const tds = [...chunk.matchAll(/<td[^>]*>([^<]*)<*/gi)].map(m => m[1].trim().replace(/&nbsp;/g, ''));
            const uuId = tds[0] || '';
            const biRef = tds[1] || refCat;
            const esc = tds[2] || '';
            const planta = tds[3] || '';
            const puerta = tds[4] || '';
            const uso = tds[8] || '';

            const streetPrefix = subAddress ? `[${subAddress}] ` : '';
            const interiorDesc = streetPrefix + [esc ? 'Esc. ' + esc : '', planta ? 'Planta ' + planta : '', puerta ? 'Pta. ' + puerta : '', uso ? '(' + uso + ')' : ''].filter(Boolean).join(' ');

            if (biRef) {
              parsed.push({
                id: biRef + '_' + uuId,
                ref20: biRef,
                cargo: uuId,
                address: subAddress,
                interior: interiorDesc || 'Inmueble / Piso',
                muni: cMun,
                prov: 'Álava',
                del: '01',
                mun: cMun,
                parCode: cPar,
                polCode: cPol,
                subareaCode: ed
              });
            }
          }
          return parsed;
        } catch(err) {
          return [];
        }
      });

      const results = await Promise.all(fetchPromises);
      results.forEach(arr => {
        allSubparcels = allSubparcels.concat(arr);
      });

      if (allSubparcels.length === 0) {
        allSubparcels.push({
          id: refCat,
          ref20: refCat,
          cargo: '0001',
          address: mainAddress,
          interior: 'Parcela / Inmueble Único',
          muni: cMun,
          prov: 'Álava',
          del: '01',
          mun: cMun,
          parCode: cPar,
          polCode: cPol,
          subareaCode: ''
        });
      }
    } catch(e) {
      console.warn('Error parseando inmuebles Álava:', e);
    }
    return allSubparcels;
  }

  /**
   * Obtiene la referencia catastral a partir de coordenadas
   */
  async fetchParcelByCoords(lat, lon) {
    try {
      const details = await this.fetchFullParcelDetails(null, lat, lon);
      return details?.parcelDetails?.refCat || null;
    } catch(e) {
      return null;
    }
  }

  /**
   * Obtiene coordenadas a partir de la referencia catastral
   */
  async getCoordsFromRC(rc) {
    try {
      const clean = rc.replace(/\D/g, '');
      if (clean.length >= 11) {
        const cMun = parseInt(clean.substring(0, 3), 10);
        const cPol = parseInt(clean.substring(3, 7), 10);
        const cPar = parseInt(clean.substring(7, 11), 10);
        const geom = await this.fetchParcelGeometry(rc, null, null, cMun, cPol, cPar);
        if (geom && geom.length > 0) {
          return { lat: geom[0][0], lon: geom[0][1] };
        }
      }
    } catch(e) {}
    return null;
  }

  /**
   * Abre la ficha oficial en el visor de GeoAraba / Catastro de Álava
   */
  async openOfficialFicha(refCat, delCode, munCode, parCode, subareaCode) {
    try {
      let cMun = munCode || '';
      let cPol = '';
      let cPar = parCode || '';

      if ((!cMun || !cPar) && refCat) {
        const clean = refCat.replace(/\D/g, '');
        if (clean.length >= 11) {
          cMun = parseInt(clean.substring(0, 3), 10);
          cPol = parseInt(clean.substring(3, 7), 10);
          cPar = parseInt(clean.substring(7, 11), 10);
        }
      }

      if (cMun && cPar) {
        const url = `https://catastroalava.tracasa.es/navegar/refCatastral.aspx?fondo=catastro&vector=CatastroyCallejero&C=${cMun}&PO=${cPol || '1'}&PA=${cPar}`;
        await WebBrowser.openBrowserAsync(url);
        return;
      }

      // Fallback
      await WebBrowser.openBrowserAsync('https://geo.araba.eus/geobisorea/');
    } catch(e) {
      Alert.alert('Error', 'No se pudo abrir la ficha oficial de Álava.');
    }
  }

  /**
   * Extrae la geometría de la parcela desde INSPIRE WFS de Álava para snapping y mediciones
   */
  async fetchParcelGeometry(refCat, lat, lon, munOverride, polOverride, parOverride) {
    try {
      let cMun = munOverride;
      let cPol = polOverride;
      let cPar = parOverride;

      if (!cMun && lat && lon) {
        const info = await this._queryGeoArabaWMS(lat, lon);
        if (info) {
          cMun = info.munCode;
          cPol = info.polCode;
          cPar = info.parCode;
        }
      }

      if (!cMun && refCat) {
        const clean = refCat.replace(/\D/g, '');
        if (clean.length >= 11) {
          cMun = parseInt(clean.substring(0, 3), 10);
          cPol = parseInt(clean.substring(3, 7), 10);
          cPar = parseInt(clean.substring(7, 11), 10);
        }
      }

      if (cMun && cPar) {
        const literal = String(cMun) + String(cPol || '1') + String(cPar).padStart(4, '0');
        const filter = `<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0"><fes:PropertyIsEqualTo><fes:ValueReference>cp:inspireId/base:Identifier/base:localId</fes:ValueReference><fes:Literal>${literal}</fes:Literal></fes:PropertyIsEqualTo></fes:Filter>`;
        const url = 'https://geo.araba.eus/WFS_INSPIRE_CP_V4?service=WFS&version=2.0.0&request=GetFeature&filter=' + encodeURIComponent(filter) + '&typenames=cp:CadastralParcel&count=1&srsName=urn:ogc:def:crs:EPSG::4326';

        const res = await fetch(url);
        const text = await res.text();
        const matches = [...text.matchAll(/<gml:posList[^>]*>([^<]+)<\/gml:posList>/gi)];
        if (matches && matches.length > 0) {
          const vertices = [];
          for (const m of matches) {
            if (!m[1]) continue;
            const coords = m[1].trim().split(/\s+/).map(Number);
            for (let i = 0; i < coords.length; i += 2) {
              const vLat = coords[i];
              const vLon = coords[i + 1];
              if (!isNaN(vLat) && !isNaN(vLon)) {
                vertices.push([vLat, vLon]);
              }
            }
          }
          if (vertices.length > 0) return vertices;
        }
      }
    } catch(e) {
      console.warn('Error obteniendo geometría Álava:', e);
    }
    return [];
  }

  /**
   * Obtiene la URL del WMS para esta región
   */
  getWMSUrl() {
    return 'https://geo.araba.eus/WMS_Katastroa';
  }

  /**
   * Obtiene las capas WMS para esta región
   */
  getWMSLayers() {
    return 'PartzelaHiritarrak_ParcelasUrbanas,PartzelaLandatarrak_ParcelasRusticas,Eraikinak_Edificios';
  }
}

