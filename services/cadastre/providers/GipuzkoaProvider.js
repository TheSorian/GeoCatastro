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
 * Proveedor para el Catastro Foral de Gipuzkoa (Guipúzcoa)
 * Utiliza los servicios oficiales de b5m (Diputación Foral de Gipuzkoa)
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
          munCode,
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
   * Obtiene los detalles completos de la parcela e inmuebles
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
      const munCode = info?.munCode || '';
      const superficie = info?.areaValue ? `${info.areaValue} m²` : '';
      const address = parCode ? `Parcela ${parCode} (${cleanRef})` : `Referencia ${cleanRef} (Gipuzkoa)`;

      const subparcels = [
        {
          id: cleanRef,
          ref20: cleanRef,
          cargo: '001',
          address,
          interior: 'Parcela / Inmueble Único',
          muni: munCode || 'Gipuzkoa',
          prov: 'Gipuzkoa',
          del: '20',
          mun: munCode,
          parCode: parCode,
          polCode: '',
          subareaCode: '1'
        }
      ];

      return {
        parcelDetails: {
          refCat: cleanRef,
          ref20: cleanRef,
          lat,
          lon,
          address,
          count: 1,
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
        mun: '',
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
      // Apertura de la Sede Electrónica de Gipuzkoa
      const url = 'https://egoitza.gipuzkoa.eus/es/catastro';
      await WebBrowser.openBrowserAsync(url, {
        toolbarColor: '#0055a5', // Azul oficial de Gipuzkoa
        controlsColor: '#ffffff',
        showTitle: true,
      });
    } catch (e) {
      Alert.alert('Error', 'No se pudo abrir el Visor de Gipuzkoa.');
    }
  }

  /**
   * Obtiene la geometría de la parcela
   */
  async fetchParcelGeometry(refCat, lat, lon) {
    return [];
  }

  /**
   * Obtiene coordenadas a partir de la referencia
   */
  async getCoordsFromRC(rc) {
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
