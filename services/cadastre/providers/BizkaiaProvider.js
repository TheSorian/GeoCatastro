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
  async fetchFullParcelDetails(refCat, lat, lon, userDni = '12345678Z') {
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

        // 1. Consultar Bienes Inmuebles oficiales de la Diputación Foral de Bizkaia
        if (cMun && cPol && cPar) {
          try {
            const officialInmuebles = await this.queryOfficialBienesInmuebles(cMun, cPol, cPar, userDni || '12345678Z');
            if (officialInmuebles && officialInmuebles.length > 0) {
              subparcels = officialInmuebles;
              if (officialInmuebles[0]?.address) {
                calle = officialInmuebles[0].address;
              }
            }
          } catch (eInm) {
            console.warn('Error consultando Bienes Inmuebles en Bizkaia:', eInm);
          }
        }

        // 2. Si no se obtuvieron bienes inmuebles, consultar Construcciones / Edificios
        if (subparcels.length === 0 && cMun && cPol && cPar) {
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

        // 3. Si aún no hay elementos, extraer Subparcelas
        if (subparcels.length === 0) {
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
   * Consulta el listado oficial de Bienes Inmuebles (pisos, locales, garajes) en la Sede de Bizkaia
   */
  async queryOfficialBienesInmuebles(cMun, cPol, cPar, userDni = '12345678Z') {
    try {
      const parcelStr = `${cMun} ${cPol} ${cPar}`;
      const getRes = await fetch('https://appsec.ebizkaia.eus/O4GC000C/vistas/fichaCatastral.xhtml?language=es', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const cookie = getRes.headers.get('set-cookie');
      const html = await getRes.text();
      let vsMatch = html.match(/name="javax\.faces\.ViewState"[^>]+value="([^"]+)"/);
      let viewState = vsMatch ? vsMatch[1] : '';

      if (!viewState) return [];

      // 1. Validar solicitante
      let params = new URLSearchParams();
      params.append('javax.faces.partial.ajax', 'true');
      params.append('javax.faces.source', 'form1:rmBuscarSolicitanteFichaCatastral');
      params.append('javax.faces.partial.execute', 'form1:panelSolicitanteFichaCatastral');
      params.append('javax.faces.partial.render', 'form1:panelSolicitanteFichaCatastral form1:personaTable');
      params.append('form1:textNifSolicitanteFichaCatastral', userDni);
      params.append('form1:panelBusquedaNifCheckSolicitanteFichaCatastral', '1');
      params.append('form1', 'form1');
      params.append('javax.faces.ViewState', viewState);

      let postRes = await fetch('https://appsec.ebizkaia.eus/O4GC000C/vistas/fichaCatastral.xhtml?language=es', {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Faces-Request': 'partial/ajax',
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': cookie || ''
        },
        body: params.toString()
      });
      let xml = await postRes.text();
      vsMatch = xml.match(/<update id="j_id1:javax\.faces\.ViewState:0"><!\[CDATA\[(.*?)\]\]><\/update>/);
      if (vsMatch) viewState = vsMatch[1];

      // 2. Cambiar a modo Parcela
      params = new URLSearchParams();
      params.append('javax.faces.partial.ajax', 'true');
      params.append('javax.faces.source', 'form1:consolePublico');
      params.append('javax.faces.partial.execute', 'form1:consolePublico');
      params.append('javax.faces.partial.render', 'form1:panelSeleccionFichaCatastral form1:panelBotoneraBuscar');
      params.append('form1:consolePublico', 'PAR');
      params.append('form1:textNifSolicitanteFichaCatastral', userDni);
      params.append('form1:panelBusquedaNifCheckSolicitanteFichaCatastral', '1');
      params.append('form1', 'form1');
      params.append('javax.faces.ViewState', viewState);

      postRes = await fetch('https://appsec.ebizkaia.eus/O4GC000C/vistas/fichaCatastral.xhtml?language=es', {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Faces-Request': 'partial/ajax',
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': cookie || ''
        },
        body: params.toString()
      });
      xml = await postRes.text();
      vsMatch = xml.match(/<update id="j_id1:javax\.faces\.ViewState:0"><!\[CDATA\[(.*?)\]\]><\/update>/);
      if (vsMatch) viewState = vsMatch[1];

      // 3. Ejecutar Búsqueda de Parcela
      params = new URLSearchParams();
      params.append('javax.faces.partial.ajax', 'true');
      params.append('javax.faces.source', 'form1:cmdButtonBuscar');
      params.append('javax.faces.partial.execute', '@all');
      params.append('javax.faces.partial.render', 'form1:facesMessages form1:panelResultados form1:resultadopdf');
      params.append('form1:cmdButtonBuscar', 'form1:cmdButtonBuscar');
      params.append('form1:opcion', 'BI');
      params.append('form1:grafico', 'CONGRAF');
      params.append('form1:textNifSolicitanteFichaCatastral', userDni);
      params.append('form1:panelBusquedaNifCheckSolicitanteFichaCatastral', '1');
      params.append('form1:consolePublico', 'PAR');
      params.append('form1:parcelaTipoEntrada', 'TEXTO');
      params.append('form1:textParcela', parcelStr);
      params.append('form1', 'form1');
      params.append('javax.faces.ViewState', viewState);

      postRes = await fetch('https://appsec.ebizkaia.eus/O4GC000C/vistas/fichaCatastral.xhtml?language=es', {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Faces-Request': 'partial/ajax',
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': cookie || ''
        },
        body: params.toString()
      });
      xml = await postRes.text();
      vsMatch = xml.match(/<update id="j_id1:javax\.faces\.ViewState:0"><!\[CDATA\[(.*?)\]\]><\/update>/);
      if (vsMatch) viewState = vsMatch[1];

      // 4. Crear Árbol de Inmuebles
      params = new URLSearchParams();
      params.append('javax.faces.partial.ajax', 'true');
      params.append('javax.faces.source', 'form1:j_idt63');
      params.append('javax.faces.partial.execute', 'form1:j_idt63');
      params.append('javax.faces.partial.render', 'form1:resultadopdf');
      params.append('form1:j_idt63', 'form1:j_idt63');
      params.append('form1', 'form1');
      params.append('javax.faces.ViewState', viewState);

      postRes = await fetch('https://appsec.ebizkaia.eus/O4GC000C/vistas/fichaCatastral.xhtml?language=es', {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Faces-Request': 'partial/ajax',
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': cookie || ''
        },
        body: params.toString()
      });
      xml = await postRes.text();

      // Parsear filas del árbol
      const items = [];
      const rowRegex = /<tr[^>]+data-rk="([^"]+)"[^>]*>(.*?)<\/tr>/gs;
      let match;
      let idx = 1;
      let parentRef = '';
      while ((match = rowRegex.exec(xml)) !== null) {
        const rowContent = match[2];
        const tds = [];
        const tdRegex = /<td[^>]*>(.*?)<\/td>/gs;
        let tdMatch;
        while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
          tds.push(tdMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        }

        if (tds.length >= 5) {
          const rawRef = tds[1];
          if (rawRef && rawRef.length >= 12) {
            parentRef = rawRef;
          }
          const itemRef = rawRef || (parentRef ? `${parentRef.substring(0, 12)}${String(idx).padStart(4, '0')}` : `${cMun}${cPol}${cPar}${String(idx).padStart(4, '0')}`);
          const address = tds[2];
          const door = tds[3];
          const numFijo = tds[4];

          const formattedRef16 = itemRef.length >= 16 
            ? `${itemRef.substring(0, 3)} ${itemRef.substring(3, 7)} ${itemRef.substring(7, 12)} ${itemRef.substring(12, 16)}`
            : itemRef;

          items.push({
            id: `BI_${itemRef}_${idx}`,
            ref20: formattedRef16,
            cargo: String(idx).padStart(4, '0'),
            address: address || `Parcela ${cPar}`,
            interior: [door, numFijo ? `· Nº Fijo: ${numFijo}` : ''].filter(Boolean).join(' '),
            muni: cMun,
            prov: 'Bizkaia',
            del: '48',
            mun: cMun,
            parCode: cPar,
            polCode: cPol,
            subareaCode: String(idx)
          });
          idx++;
        }
      }
      return items;
    } catch (e) {
      console.warn('Error consultando Bienes Inmuebles oficial Bizkaia:', e);
      return [];
    }
  }
  async openOfficialFicha(refCat, delCode, munCode, parCode, subareaCode, polCode) {
    try {
      // Ficha Catastral oficial de Bizkaia (permite consulta por NIF + Parcela / Bien Inmueble)
      const url = 'https://appsec.ebizkaia.eus/O4GC000C/vistas/fichaCatastral.xhtml?language=es';
      await WebBrowser.openBrowserAsync(url, {
        toolbarColor: '#cc0000', // Rojo característico de Bizkaia
        controlsColor: '#ffffff',
        showTitle: true,
      });
    } catch (e) {
      Alert.alert('Error', 'No se pudo abrir la Ficha Catastral de Bizkaia.');
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
