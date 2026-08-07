import { XMLParser } from 'fast-xml-parser';
import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';

export class NavarraProvider {
  /**
   * Helper to perform a WFS query to IDENA
   */
  async _queryIDENAWFS(layer, cqlFilter) {
    const baseUrl = 'https://idena.navarra.es/ogc/wfs';
    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: layer,
      outputFormat: 'application/json',
      cql_filter: cqlFilter,
      srsName: 'EPSG:4326'
    });

    const url = `${baseUrl}?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('IDENA WFS Error');
    }
    return await response.json();
  }

  /**
   * Obtiene los detalles completos de la parcela
   * Para IDENA, podemos extraer la información directamente del Feature devuelto por WFS.
   * La Referencia Catastral puede parsearse (Municpio, Poligono, Parcela)
   */
  async fetchFullParcelDetails(refCat, lat, lon) {
    // Si tenemos las coordenadas, podemos hacer una consulta espacial rápida o usar la referencia si la sabemos completa.
    // Buscaremos en ParcelaUrba y si no hay, en ParcelaRusti
    let geojson = null;

    try {
      // 1. Intentar con Parcela Urbana mediante coordenadas
      geojson = await this._queryIDENAWFS('IDENA:CATAST_Pol_ParcelaUrba', `INTERSECTS(the_geom, POINT(${lon} ${lat}))`);
      if (!geojson?.features || geojson.features.length === 0) {
        // 2. Intentar con Parcela Rústica
        geojson = await this._queryIDENAWFS('IDENA:CATAST_Pol_ParcelaRusti', `INTERSECTS(the_geom, POINT(${lon} ${lat}))`);
      }
      
      if (!geojson?.features || geojson.features.length === 0) {
        // 3. Intentar con Parcela Mixta
        geojson = await this._queryIDENAWFS('IDENA:CATAST_Pol_ParcelaMixta', `INTERSECTS(the_geom, POINT(${lon} ${lat}))`);
      }

      // Fallback de proximidad por BBOX en Portales si el punto cae en la acera/calle
      if (!geojson?.features || geojson.features.length === 0) {
        const delta = 0.00035;
        const bboxP = `BBOX(the_geom, ${lon - delta}, ${lat - delta}, ${lon + delta}, ${lat + delta}, 'EPSG:4326')`;
        const jsonP = await this._queryIDENAWFS('IDENA:CATAST_Txt_Portal', bboxP);
        
        if (jsonP?.features && jsonP.features.length > 0) {
          let best = null;
          let minDist = Infinity;
          for (const f of jsonP.features) {
            const coords = f.geometry?.coordinates;
            if (coords) {
              const d = Math.hypot(coords[0] - lon, coords[1] - lat);
              if (d < minDist) {
                minDist = d;
                best = f;
              }
            }
          }
          if (best?.properties?.IDCATASTRO) {
            geojson = await this._queryIDENAWFS('IDENA:CATAST_Pol_ParcelaUrba', `IDCATASTRO = ${best.properties.IDCATASTRO}`);
          }
        }
      }

      if (geojson?.features && geojson.features.length > 0) {
        const properties = geojson.features[0].properties;
        
        // Extraer códigos para la ficha
        const munCode = properties.CMUNICIPIO || properties.MUNICIPIO || '';
        const polCode = properties.POLIGONO || '';
        const parCode = properties.PARCELA || '';
        
        const mainAddress = properties.DIRECCION || properties.PARAJE || `Parcela ${parCode}, Polígono ${polCode} (${munCode})`;

        // Extraer subparcelas e inmuebles haciendo scraping del HTML de la ficha
        const parsedSubparcels = await this._fetchNavarraInmuebles(munCode, polCode, parCode, refCat, mainAddress);

        return {
          parcelDetails: {
            refCat,
            ref20: refCat,
            lat,
            lon,
            address: mainAddress,
            count: parsedSubparcels.length, 
            del: munCode,
            mun: polCode, 
            parCode: parCode,
            noExactBuilding: false
          },
          subparcels: parsedSubparcels
        };
      }
    } catch (e) {
      console.warn("Error consultando detalles Navarra WFS", e);
    }

    // Fallback genérico
    return {
      parcelDetails: {
        refCat,
        ref20: refCat,
        lat,
        lon,
        address: 'Ubicación Seleccionada (Navarra)',
        count: 1,
        del: '',
        mun: '',
        noExactBuilding: false
      },
      subparcels: [{ id: refCat, ref20: refCat, interior: 'Parcela', address: 'Navarra' }]
    };
  }

  async _fetchNavarraInmuebles(cMun, cPol, cPar, refCat, mainAddress) {
    let allSubparcels = [];
    try {
      const urlParcela = `https://catastro.navarra.es/ref_catastral/unidades.aspx?C=${cMun}&PO=${cPol}&PA=${cPar}&lang=es`;
      const resParcela = await fetch(urlParcela);
      const htmlParcela = await resParcela.text();

      // Buscamos los botones de las subáreas: onClick="unidades(1)"
      const subareaMatches = [...htmlParcela.matchAll(/onClick="unidades\((\d+)\)"/g)];
      let subareas = subareaMatches.map(m => m[1]);
      subareas = [...new Set(subareas)]; // Eliminar duplicados

      if (subareas.length === 0) {
        allSubparcels.push({
          id: refCat, ref20: refCat, cargo: '0001', address: mainAddress, interior: 'Parcela / Inmueble Único',
          muni: cMun, prov: 'Navarra', del: cMun, mun: cPol, parCode: cPar, subareaCode: ''
        });
        return allSubparcels;
      }

      // 2. Por cada subárea, bajar sus pisos en paralelo
      const fetchPromises = subareas.map(async (S) => {
        const urlSub = `https://catastro.navarra.es/ref_catastral/unidades.aspx?C=${cMun}&PO=${cPol}&PA=${cPar}&S=${S}&lang=es`;
        const resSub = await fetch(urlSub);
        const htmlSub = await resSub.text();

        const domMatch = htmlSub.match(/Domicilio:<\/td>\s*<td[^>]*>([^<]+)/i);
        const subAddress = domMatch ? domMatch[1].trim().replace(/&nbsp;/g, '') : mainAddress;

        const rows = htmlSub.split('<td class="bi">');
        let parsed = [];
        for (let i = 1; i < rows.length; i++) {
          const chunk = rows[i];
          const refMatch = chunk.match(/^([^<]+)/);
          const trRest = chunk.split('</tr>')[0];
          const tds = [...trRest.matchAll(/<td[^>]*>([^<]*)<*/gi)].map(m => m[1].trim().replace(/&nbsp;/g, ''));
          
          const biRef = refMatch ? refMatch[1].trim() : '';
          const uuId = tds[0] || '';
          const esc = tds[1] || '';
          const planta = tds[2] || '';
          const puerta = tds[3] || '';
          const uso = tds[4] || '';

          const streetPrefix = subAddress ? `[${subAddress}] ` : `[Portal ${S}] `;
          const interiorDesc = streetPrefix + [esc, planta ? `Planta ${planta}` : '', puerta ? `Puerta ${puerta}` : '', uso ? `(${uso})` : ''].filter(Boolean).join(' ');

          if (biRef) {
            parsed.push({
              id: biRef + '_' + uuId, ref20: biRef, cargo: uuId, address: subAddress, interior: interiorDesc,
              muni: cMun, prov: 'Navarra', del: cMun, mun: cPol, parCode: cPar, subareaCode: S
            });
          }
        }
        return parsed;
      });

      const results = await Promise.all(fetchPromises);
      results.forEach(arr => {
        allSubparcels = allSubparcels.concat(arr);
      });

      if (allSubparcels.length === 0) {
        allSubparcels.push({ id: refCat, ref20: refCat, address: mainAddress, interior: 'Parcela de Navarra', del: cMun, mun: cPol, parCode: cPar, subareaCode: '' });
      }

    } catch(err) {
      console.warn("Error parseando inmuebles HTML Navarra", err);
    }
    return allSubparcels;
  }

  /**
   * Obtiene la referencia catastral a partir de coordenadas
   */
  async fetchParcelByCoords(lat, lon) {
    try {
      let geojson = await this._queryIDENAWFS('IDENA:CATAST_Pol_ParcelaUrba', `INTERSECTS(the_geom, POINT(${lon} ${lat}))`);
      
      if (!geojson?.features || geojson.features.length === 0) {
        geojson = await this._queryIDENAWFS('IDENA:CATAST_Pol_ParcelaRusti', `INTERSECTS(the_geom, POINT(${lon} ${lat}))`);
      }
      if (!geojson?.features || geojson.features.length === 0) {
        geojson = await this._queryIDENAWFS('IDENA:CATAST_Pol_ParcelaMixta', `INTERSECTS(the_geom, POINT(${lon} ${lat}))`);
      }

      // Fallback de proximidad por BBOX en Portales si el punto cae en la acera/calle
      if (!geojson?.features || geojson.features.length === 0) {
        const delta = 0.00035;
        const bboxP = `BBOX(the_geom, ${lon - delta}, ${lat - delta}, ${lon + delta}, ${lat + delta}, 'EPSG:4326')`;
        const jsonP = await this._queryIDENAWFS('IDENA:CATAST_Txt_Portal', bboxP);
        
        if (jsonP?.features && jsonP.features.length > 0) {
          let best = null;
          let minDist = Infinity;
          for (const f of jsonP.features) {
            const coords = f.geometry?.coordinates;
            if (coords) {
              const d = Math.hypot(coords[0] - lon, coords[1] - lat);
              if (d < minDist) {
                minDist = d;
                best = f;
              }
            }
          }
          if (best?.properties?.IDCATASTRO) {
            geojson = await this._queryIDENAWFS('IDENA:CATAST_Pol_ParcelaUrba', `IDCATASTRO = ${best.properties.IDCATASTRO}`);
          }
        }
      }

      // Si aún así no hay portales, probar BBOX directo en ParcelaUrba
      if (!geojson?.features || geojson.features.length === 0) {
        const delta = 0.0003;
        const bboxU = `BBOX(the_geom, ${lon - delta}, ${lat - delta}, ${lon + delta}, ${lat + delta}, 'EPSG:4326')`;
        geojson = await this._queryIDENAWFS('IDENA:CATAST_Pol_ParcelaUrba', bboxU);
      }

      if (geojson?.features && geojson.features.length > 0) {
        const properties = geojson.features[0].properties;
        const cMun = properties.CMUNICIPIO || properties.MUNICIPIO || '000';
        const cPol = properties.POLIGONO || '000';
        const cPar = properties.PARCELA || '00000';
        
        const refCatastral = properties.RC || properties.REFCATASTRAL || `NA_${cMun}_${cPol}_${cPar}`;

        return { found: true, ref: refCatastral, lat, lon };
      }
    } catch (e) {
      console.warn("Error en fetchParcelByCoords Navarra", e);
    }

    return { found: false, lat, lon };
  }

  /**
   * Obtiene las coordenadas a partir de una Referencia Catastral
   */
  async getCoordsFromRC(rc) {
    try {
      const filter = `RC = '${rc}' OR REFCATASTRAL = '${rc}'`;
      
      let geojson = await this._queryIDENAWFS('IDENA:CATAST_Pol_ParcelaUrba', filter);
      if (!geojson?.features || geojson.features.length === 0) {
        geojson = await this._queryIDENAWFS('IDENA:CATAST_Pol_ParcelaRusti', filter);
      }

      if (geojson?.features && geojson.features.length > 0) {
        const geom = geojson.features[0].geometry;
        let coords;
        if (geom.type === 'MultiPolygon') {
          coords = geom.coordinates[0][0][0];
        } else if (geom.type === 'Polygon') {
          coords = geom.coordinates[0][0];
        }
        
        if (coords) {
          return { found: true, lat: coords[1], lon: coords[0], ref: rc };
        }
      }
    } catch (e) {
      console.warn("Error en getCoordsFromRC Navarra", e);
    }
    return { found: false };
  }

  /**
   * Abre la ficha oficial de Navarra usando la URL proporcionada
   */
  async openOfficialFicha(refCat, delCode, munCode, parCode, subareaCode) {
    try {
      let municipio = delCode || '';
      let poligono = munCode || '';
      let parcela = parCode || '';

      if (!municipio && String(refCat).startsWith('NA_')) {
        const parts = String(refCat).split('_');
        if (parts.length >= 4) {
          municipio = parts[1];
          poligono = parts[2];
          parcela = parts[3];
        }
      }

      let url = `https://catastro.navarra.es/ref_catastral/unidades.aspx?C=${municipio}&PO=${poligono}&PA=${parcela}&lang=es`;
      if (subareaCode) {
        url += `&S=${subareaCode}`;
      }

      await WebBrowser.openBrowserAsync(url, {
        toolbarColor: '#dc2626', // Rojo Navarra
        controlsColor: '#ffffff',
        showTitle: true,
      });
    } catch (err) {
      Alert.alert('Error', 'No se pudo abrir la Ficha del Catastro de Navarra.');
    }
  }

  /**
   * Obtiene la URL del WMS para esta región
   */
  getWMSUrl() {
    return 'https://idena.navarra.es/ogc/wms';
  }

  /**
   * Obtiene las capas WMS para esta región
   */
  getWMSLayers() {
    return 'catastro'; // Capa general que engloba rústica, urbana, etc.
  }
}
