import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';

/**
 * Proveedor para el Catastro Foral de Bizkaia (Vizcaya)
 * Utiliza los servicios oficiales de GeoBizkaia (Diputación Foral de Bizkaia)
 */
export class BizkaiaProvider {
  constructor() {
    this.restBase = 'https://geo.bizkaia.eus/arcgisserverinspire/rest/services/Catastro_O4_ServiciosMapas/MC_ProduccionVigente/MapServer';
  }

  /**
   * Consulta espacial mediante REST Identify en GeoBizkaia
   */
  async _identify(lat, lon) {
    try {
      const delta = 0.0008;
      const mapExtent = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
      const url = `${this.restBase}/identify?geometry=${lon},${lat}&geometryType=esriGeometryPoint&sr=4326&layers=all&tolerance=6&mapExtent=${mapExtent}&imageDisplay=800,600,96&returnGeometry=true&f=pjson`;

      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      return data.results || [];
    } catch (e) {
      console.warn('Error consultando ArcGIS Identify en Bizkaia:', e);
      return null;
    }
  }

  /**
   * Obtiene la referencia catastral a partir de coordenadas
   */
  async fetchParcelByCoords(lat, lon) {
    try {
      const results = await this._identify(lat, lon);
      if (!results || results.length === 0) {
        return { found: false, lat, lon };
      }

      // Buscar capa de parcelas
      const parcelaLayer = results.find(r => r.layerName === 'Parcelas consultas' || r.layerName === 'Parcelas');
      const munLayer = results.find(r => r.layerName === 'Municipios');

      if (parcelaLayer && parcelaLayer.attributes) {
        const cMun = String(parcelaLayer.attributes.Codigo_Municipio || '').padStart(3, '0');
        const cPol = String(parcelaLayer.attributes.Codigo_Poligono || '').padStart(4, '0');
        const cPar = String(parcelaLayer.attributes.Codigo_Parcela || '').padStart(5, '0');
        const refCat = `${cMun} ${cPol} ${cPar}`;

        return {
          found: true,
          ref: refCat,
          lat,
          lon,
          munName: munLayer?.attributes?.Descripcion?.trim() || 'Bizkaia'
        };
      }
    } catch (e) {
      console.warn('Error en fetchParcelByCoords Bizkaia:', e);
    }
    return { found: false, lat, lon };
  }

  /**
   * Obtiene los detalles completos de la parcela e inmuebles/subparcelas
   */
  async fetchFullParcelDetails(refCat, lat, lon) {
    try {
      let results = null;
      if (lat && lon) {
        results = await this._identify(lat, lon);
      }

      let munName = 'Bizkaia';
      let cMun = '';
      let cPol = '';
      let cPar = '';
      let superficie = '';
      let calle = '';
      let portal = '';
      let subparcels = [];

      if (results && results.length > 0) {
        const munLayer = results.find(r => r.layerName === 'Municipios');
        if (munLayer?.attributes?.Descripcion) {
          munName = munLayer.attributes.Descripcion.trim();
        }

        const parcelaLayer = results.find(r => r.layerName === 'Parcelas consultas' || r.layerName === 'Parcelas');
        if (parcelaLayer?.attributes) {
          cMun = String(parcelaLayer.attributes.Codigo_Municipio || '').padStart(3, '0');
          cPol = String(parcelaLayer.attributes.Codigo_Poligono || '').padStart(4, '0');
          cPar = String(parcelaLayer.attributes.Codigo_Parcela || '').padStart(5, '0');
          superficie = parcelaLayer.attributes['SHAPE.STArea()'] || '';
        }

        // Obtener dirección desde Textos de calles y Numeros de portal
        const calleLayer = results.find(r => r.layerName === 'Textos de calles');
        const portalLayer = results.find(r => r.layerName === 'Numeros de portal');
        if (calleLayer?.attributes?.Texto) calle = calleLayer.attributes.Texto.trim();
        if (portalLayer?.attributes?.Texto) portal = portalLayer.attributes.Texto.trim();

        // 1. Consultar Construcciones / Edificios en la parcela
        if (cMun && cPol && cPar) {
          try {
            const edifUrl = `https://geo.bizkaia.eus/arcgisserverinspire/rest/services/Catastro_O4_ServiciosMapas/GC_Vigente_Sin_Ortos/MapServer/118/query?where=Codigo_Municipio%3D${parseInt(cMun, 10)}+AND+Codigo_Poligono%3D${parseInt(cPol, 10)}+AND+Codigo_Parcela%3D${parseInt(cPar, 10)}&outFields=*&returnGeometry=false&f=json`;
            const edifRes = await fetch(edifUrl);
            const edifData = await edifRes.json();
            const edificios = edifData.features || [];

            for (const ed of edificios) {
              const a = ed.attributes || {};
              let calleEdificio = calle;
              if (a.Codigo_Calle) {
                try {
                  const calleUrl = `https://geo.bizkaia.eus/arcgisserverinspire/rest/services/Catastro_O4_ServiciosMapas/GC_Vigente_Sin_Ortos/MapServer/45/query?where=Codigo_Municipio%3D${parseInt(cMun, 10)}+AND+Codigo_Calle%3D${a.Codigo_Calle}&outFields=Texto&returnGeometry=false&f=json`;
                  const calleRes = await fetch(calleUrl);
                  const calleData = await calleRes.json();
                  if (calleData.features && calleData.features[0]?.attributes?.Texto) {
                    calleEdificio = calleData.features[0].attributes.Texto.trim();
                  }
                } catch (eCalle) {}
              }

              const portalStr = a.Numero_Portal ? String(parseInt(a.Numero_Portal, 10)) : portal;
              const dirEdificio = [calleEdificio, portalStr ? `Nº ${portalStr}` : ''].filter(Boolean).join(' ');
              const numEdif = a.Codigo_Edificio || '1';
              const numSub = a.Codigo_Subparcela || '1';
              const edifId = `${cMun}${cPol}${cPar}_E${numEdif}`;

              subparcels.push({
                id: edifId,
                ref20: `${cMun} ${cPol} ${cPar} E${String(numEdif).padStart(2, '0')}`,
                cargo: `E${numEdif}`,
                address: dirEdificio || `Edificio ${numEdif}`,
                interior: `Construcción / Edificio ${numEdif} (Subp. ${numSub})`,
                muni: cMun,
                prov: 'Bizkaia',
                del: '48',
                mun: cMun,
                parCode: cPar,
                polCode: cPol,
                subareaCode: numSub
              });

              if (!calle && calleEdificio) calle = calleEdificio;
              if (!portal && portalStr) portal = portalStr;
            }
          } catch (eEdif) {
            console.warn('Error consultando edificios en Bizkaia:', eEdif);
          }
        }

        // 2. Extraer Subparcelas
        const subLayers = results.filter(r => r.layerName === 'Subparcelas consultas' || r.layerName === 'Subparcelas tipo');
        for (const sub of subLayers) {
          const attr = sub.attributes || {};
          const numSub = attr.Codigo_Subparcela || '1';
          const nat = attr.Codigo_Naturaleza || 'Urb';
          const supSub = attr['SHAPE.STArea()'] ? `${Math.round(parseFloat(attr['SHAPE.STArea()'].replace(',', '.')))} m²` : '';
          const subId = `${cMun}${cPol}${cPar}_S${numSub}`;

          subparcels.push({
            id: subId,
            ref20: `${cMun} ${cPol} ${cPar} S${String(numSub).padStart(2, '0')}`,
            cargo: `S${numSub}`,
            address: [calle, portal ? `Nº ${portal}` : ''].filter(Boolean).join(' ') || `Parcela ${parseInt(cPar, 10)}, Polígono ${parseInt(cPol, 10)}`,
            interior: `Subparcela ${numSub} (${nat}) ${supSub}`.trim(),
            muni: cMun,
            prov: 'Bizkaia',
            del: '48',
            mun: cMun,
            parCode: cPar,
            polCode: cPol,
            subareaCode: numSub
          });
        }
      }

      // Si no tenemos elementos desde REST, parsear la referencia
      if (subparcels.length === 0 && refCat) {
        const clean = String(refCat).replace(/\s+/g, '');
        if (clean.length >= 12) {
          cMun = clean.substring(0, 3);
          cPol = clean.substring(3, 7);
          cPar = clean.substring(7, 12);
        }
      }

      const formattedRef = (cMun && cPol && cPar) ? `${cMun} ${cPol} ${cPar}` : (refCat || 'Bizkaia');
      const address = [calle, portal ? `Nº ${portal}` : ''].filter(Boolean).join(' ') || (cPar ? `Parcela ${parseInt(cPar, 10)}, Polígono ${parseInt(cPol, 10)} (${munName})` : 'Bizkaia');

      if (subparcels.length === 0) {
        subparcels.push({
          id: formattedRef,
          ref20: formattedRef,
          cargo: '001',
          address,
          interior: 'Parcela / Inmueble Único',
          muni: cMun || '020',
          prov: 'Bizkaia',
          del: '48',
          mun: cMun || '020',
          parCode: cPar || '00001',
          polCode: cPol || '0001',
          subareaCode: '1'
        });
      }

      return {
        parcelDetails: {
          refCat: formattedRef,
          ref20: formattedRef,
          lat,
          lon,
          address,
          count: subparcels.length,
          del: '48',
          mun: cMun,
          parCode: cPar,
          polCode: cPol,
          superficie: superficie ? `${Math.round(parseFloat(superficie.replace(',', '.')))} m²` : '',
          noExactBuilding: false
        },
        subparcels
      };
    } catch (e) {
      console.warn('Error en fetchFullParcelDetails Bizkaia:', e);
    }

    return {
      parcelDetails: {
        refCat: refCat || 'Bizkaia',
        ref20: refCat || 'Bizkaia',
        lat,
        lon,
        address: 'Ubicación Seleccionada (Bizkaia)',
        count: 1,
        del: '48',
        mun: '',
        noExactBuilding: false
      },
      subparcels: [{ id: refCat, ref20: refCat, interior: 'Parcela', address: 'Bizkaia' }]
    };
  }

  /**
   * Abre el Visor / Ficha oficial en la Sede Electrónica de Bizkaia (eBizkaia)
   */
  async openOfficialFicha(refCat, delCode, munCode, parCode, subareaCode, polCode) {
    try {
      // Visor Catastral completo de Bizkaia con submenús de Bienes Inmuebles, Construcciones, Subparcelas y Elementos
      const url = 'https://appsec.ebizkaia.eus/O4GC000C/vistas/visor.xhtml?language=es';
      await WebBrowser.openBrowserAsync(url, {
        toolbarColor: '#cc0000', // Rojo característico de Bizkaia
        controlsColor: '#ffffff',
        showTitle: true,
      });
    } catch (e) {
      Alert.alert('Error', 'No se pudo abrir el Visor Catastral de Bizkaia.');
    }
  }

  /**
   * Obtiene la geometría de la parcela para medición y snapping
   */
  async fetchParcelGeometry(refCat, lat, lon) {
    try {
      if (lat && lon) {
        const results = await this._identify(lat, lon);
        const parcelaLayer = results?.find(r => r.layerName === 'Parcelas consultas' || r.layerName === 'Parcelas');
        if (parcelaLayer?.geometry?.rings && parcelaLayer.geometry.rings.length > 0) {
          // rings en formato [[lon, lat], [lon, lat], ...]
          const ring = parcelaLayer.geometry.rings[0];
          return ring.map(([vLon, vLat]) => [vLat, vLon]);
        }
      }
    } catch (e) {
      console.warn('Error obteniendo geometría en Bizkaia:', e);
    }
    return [];
  }

  /**
   * Obtiene coordenadas a partir de la referencia
   */
  async getCoordsFromRC(rc) {
    return { found: false };
  }

  /**
   * URL del MapServer para Bizkaia (usado por ArcGIS Export Layer)
   */
  getWMSUrl() {
    return 'https://geo.bizkaia.eus/arcgisserverinspire/rest/services/Catastro_O4_ServiciosMapas/MC_ProduccionVigente/MapServer/export';
  }

  /**
   * Capas WMS para Bizkaia (solo referencia, el Export usa la URL directamente)
   */
  getWMSLayers() {
    return 'show:38,42';
  }

  /**
   * Tipo de capa: arcgis_export (no WMS estándar)
   */
  getWMSLayerType() {
    return 'arcgis_export';
  }
}
