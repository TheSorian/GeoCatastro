import { XMLParser } from 'fast-xml-parser';
import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';

export class StateProvider {
  /**
   * Obtiene los detalles completos de la parcela/inmuebles (Consulta_DNPRC)
   */
  async fetchFullParcelDetails(refCat, lat, lon) {
    const clean14 = String(refCat || '').trim().substring(0, 14);
    const urlDNPRC = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC?Provincia=&Municipio=&RC=${clean14}`;
    const response = await fetch(urlDNPRC);
    const xmlData = await response.text();

    const parser = new XMLParser({ parseTagValue: false });
    const jsonObj = parser.parse(xmlData);

    const dnp = jsonObj?.consulta_dnp;

    let parsedSubparcels = [];
    let mainAddress = '';
    let delCode = '';
    let munCode = '';
    let totalCount = 0;

    // 1. Caso Edificio con varios inmuebles / división horizontal (<lrcdnp>)
    if (dnp?.lrcdnp?.rcdnp) {
      const items = Array.isArray(dnp.lrcdnp.rcdnp) ? dnp.lrcdnp.rcdnp : [dnp.lrcdnp.rcdnp];
      totalCount = dnp?.control?.cudnp ? parseInt(dnp.control.cudnp) : items.length;

      items.forEach((item, index) => {
        const rcObj = item?.rc;
        const dtObj = item?.dt;

        const itemDel = dtObj?.loine?.cp ? String(dtObj.loine.cp).padStart(2, '0') : '';
        const itemMun = (dtObj?.cmc || dtObj?.loine?.cm) ? String(dtObj.cmc || dtObj.loine?.cm) : '';

        if (index === 0 && dtObj) {
          delCode = itemDel;
          munCode = itemMun;
        }

        const full20RC = rcObj ? `${rcObj.pc1}${rcObj.pc2}${rcObj.car}${rcObj.cc1}${rcObj.cc2}` : refCat;

        const dirObj = dtObj?.locs?.lous?.lourb?.dir;
        const lointObj = dtObj?.locs?.lous?.lourb?.loint;

        const street = dirObj ? `${dirObj.tv || ''} ${dirObj.nv || ''} ${dirObj.pnp || ''}`.trim() : '';
        const muni = dtObj?.nm || '';
        const prov = dtObj?.np || '';
        const cp = dtObj?.locs?.lous?.lourb?.dp || '';

        const esc = lointObj?.es ? `Esc. ${lointObj.es}` : '';
        const planta = lointObj?.pt ? `Planta ${lointObj.pt}` : '';
        const puerta = lointObj?.pu ? `Puerta ${lointObj.pu}` : '';
        const lointStr = [esc, planta, puerta].filter(Boolean).join(', ');
        
        const streetPrefix = street ? `[${street}] ` : '';
        const interiorDesc = streetPrefix + (lointStr || 'Inmueble / Parcela Principal');

        if (index === 0) {
          mainAddress = `${street}, ${muni} (${prov}) ${cp}`.trim();
        }

        parsedSubparcels.push({
          id: full20RC,
          ref20: full20RC,
          cargo: rcObj?.car || `${index + 1}`,
          address: street,
          interior: interiorDesc,
          muni,
          prov,
          del: itemDel || delCode,
          mun: itemMun || munCode
        });
      });
    } 
    // 2. Caso Finca de 1 solo inmueble / Chalet / Nave (<bico>)
    else if (dnp?.bico?.bi) {
      const bi = dnp.bico.bi;
      const rcObj = bi?.idbi?.rc;
      const dtObj = bi?.dt;

      delCode = dtObj?.loine?.cp ? String(dtObj.loine.cp).padStart(2, '0') : '';
      munCode = (dtObj?.cmc || dtObj?.loine?.cm) ? String(dtObj.cmc || dtObj.loine?.cm) : '';
      totalCount = 1;

      const full20RC = rcObj ? `${rcObj.pc1}${rcObj.pc2}${rcObj.car}${rcObj.cc1}${rcObj.cc2}` : refCat;
      const dirObj = dtObj?.locs?.lous?.lourb?.dir;
      const street = dirObj ? `${dirObj.tv || ''} ${dirObj.nv || ''} ${dirObj.pnp || ''}`.trim() : '';
      const muni = dtObj?.nm || '';
      const prov = dtObj?.np || '';
      const cp = dtObj?.locs?.lous?.lourb?.dp || '';

      mainAddress = bi?.ldt || `${street}, ${muni} (${prov}) ${cp}`.trim();

      parsedSubparcels.push({
        id: full20RC,
        ref20: full20RC,
        cargo: rcObj?.car || '0001',
        address: street,
        interior: street ? `[${street}] Inmueble Único (Finca / Chalet)` : 'Inmueble Único (Finca / Chalet)',
        muni,
        prov,
        del: delCode,
        mun: munCode
      });
    }

    return {
      parcelDetails: {
        refCat,
        ref20: parsedSubparcels[0]?.ref20 || refCat,
        lat,
        lon,
        address: mainAddress || 'Ubicación Catastral',
        count: totalCount,
        del: delCode,
        mun: munCode,
        noExactBuilding: false
      },
      subparcels: parsedSubparcels
    };
  }

  /**
   * Obtiene la referencia catastral (si existe) a partir de coordenadas (Consulta_RCCOOR)
   */
  async fetchParcelByCoords(lat, lon) {
    const url = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=${lon}&Coordenada_Y=${lat}`;
    const response = await fetch(url);
    const xmlData = await response.text();
    const parser = new XMLParser({ parseTagValue: false });
    const jsonObj = parser.parse(xmlData);

    let pc = jsonObj?.consulta_coordenadas?.coordenadas?.coord?.pc;

    // Si cayó en el asfalto (cuerr > 0), probe espacial de 10m en 4 direcciones
    if (!pc) {
      const offsets = [
        [0.00008, 0.00008],
        [-0.00008, -0.00008],
        [0.00008, -0.00008],
        [-0.00008, 0.00008]
      ];
      for (const [dx, dy] of offsets) {
        const pUrl = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=${lon + dx}&Coordenada_Y=${lat + dy}`;
        const pRes = await fetch(pUrl);
        const pXml = await pRes.text();
        const pJson = parser.parse(pXml);
        const pPc = pJson?.consulta_coordenadas?.coordenadas?.coord?.pc;
        if (pPc) {
          pc = pPc;
          break;
        }
      }
    }

    if (pc) {
      const refCatastral = `${pc.pc1}${pc.pc2}`;
      return { found: true, ref: refCatastral, lat, lon };
    } else {
      return { found: false, lat, lon };
    }
  }

  /**
   * Obtiene las coordenadas a partir de una Referencia Catastral (Consulta_CPMRC)
   */
  async getCoordsFromRC(rc) {
    const url = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG:4326&RC=${rc}`;
    const response = await fetch(url);
    const xmlData = await response.text();
    const parser = new XMLParser({ parseTagValue: false });
    const jsonObj = parser.parse(xmlData);

    const coord = jsonObj?.consulta_coordenadas?.coordenadas?.coord;
    let xcen, ycen;
    if (Array.isArray(coord)) {
      xcen = parseFloat(coord[0].geo.xcen);
      ycen = parseFloat(coord[0].geo.ycen);
    } else if (coord) {
      xcen = parseFloat(coord.geo.xcen);
      ycen = parseFloat(coord.geo.ycen);
    }

    if (xcen && ycen) {
      return { found: true, lat: ycen, lon: xcen, ref: rc };
    } else {
      return { found: false };
    }
  }

  /**
   * Abre la ficha oficial de la sede electrónica
   */
  async openOfficialFicha(refCat, delCode, munCode, parCode, subareaCode) {
    try {
      const cleanRef = String(refCat || '').trim();
      let url = '';

      if (cleanRef.length >= 20) {
        // Ficha Informativa Oficial Descriptiva para inmueble de 20 dígitos o chalet
        const del = delCode ? String(delCode).padStart(2, '0') : '28';
        const mun = munCode ? String(munCode) : '900';
        url = `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiud.aspx?del=${del}&mun=${mun}&UrbRus=U&RefC=${cleanRef}&Apenom=&esBice=&RCBice1=&RCBice2=&DenoBice=&from=nuevoVisor&ZV=NO&anyoZV=`;
      } else {
        // Parcela Base (13 ó 14 dígitos)
        url = `https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?refcat=${cleanRef}`;
      }

      await WebBrowser.openBrowserAsync(url, {
        toolbarColor: '#0066cc',
        controlsColor: '#ffffff',
        showTitle: true,
      });
    } catch (err) {
      Alert.alert('Error', 'No se pudo abrir la Ficha del Catastro.');
    }
  }

  /**
   * Obtiene la geometría oficial (vértices [lat, lon]) de la parcela mediante INSPIRE WFS
   */
  async fetchParcelGeometry(refCat, lat, lon) {
    try {
      let clean14 = String(refCat || '').trim().substring(0, 14);
      if (!clean14 && lat && lon) {
        const res = await this.fetchParcelByCoords(lat, lon);
        if (res && res.found && res.ref) {
          clean14 = String(res.ref).trim().substring(0, 14);
        }
      }
      if (!clean14) return [];
      const url = `https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=wfs&version=2.0.0&request=GetFeature&STOREDQUERY_ID=GetParcel&srsname=EPSG:4326&REFCAT=${clean14}`;
      const response = await fetch(url);
      const xml = await response.text();
      const matches = [...xml.matchAll(/<gml:posList[^>]*>([^<]+)<\/gml:posList>/gi)];
      if (!matches || matches.length === 0) return [];
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
      return vertices;
    } catch (e) {
      return [];
    }
  }

  /**
   * Obtiene la URL del WMS para esta región
   */
  getWMSUrl() {
    return 'https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx';
  }

  /**
   * Obtiene las capas WMS para esta región
   */
  getWMSLayers() {
    return 'catastro';
  }
}

