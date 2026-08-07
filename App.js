import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Text,
  Alert,
  Keyboard,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Clipboard,
  Dimensions
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { XMLParser } from 'fast-xml-parser';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORAGE_KEY = '@catastro_recent_searches_v1';

export default function App() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [showRecent, setShowRecent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [parcelDetails, setParcelDetails] = useState(null);
  const [subparcels, setSubparcels] = useState([]);
  const [showSubparcels, setShowSubparcels] = useState(false);
  const [selectedSubparcel, setSelectedSubparcel] = useState(null);

  const webViewRef = useRef(null);
  const typingTimer = useRef(null);

  // Cargar búsquedas recientes al iniciar
  useEffect(() => {
    loadRecentSearches();
  }, []);

  const loadRecentSearches = async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        setRecentSearches(JSON.parse(data));
      }
    } catch (e) {}
  };

  const saveRecentSearch = async (text) => {
    if (!text || text.trim().length < 3) return;
    const clean = text.trim();
    try {
      let current = [...recentSearches];
      current = current.filter(item => item.toLowerCase() !== clean.toLowerCase());
      current.unshift(clean);
      if (current.length > 8) current = current.slice(0, 8);
      setRecentSearches(current);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (e) {}
  };

  const removeRecentSearch = async (textToRemove) => {
    try {
      const current = recentSearches.filter(item => item !== textToRemove);
      setRecentSearches(current);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (e) {}
  };

  const clearAllRecent = async () => {
    try {
      setRecentSearches([]);
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  };

  // HTML del visor Leaflet con listener compatible Android/iOS
  const leafletHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body, html, #map { width: 100%; height: 100%; margin: 0; padding: 0; background-color: #e5e3df; }
        .leaflet-control-attribution { font-size: 9px; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: false }).setView([40.4168, -3.7038], 16);
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(map);

        var catastroWMS = L.tileLayer.wms('https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx', {
          layers: 'catastro',
          format: 'image/png',
          transparent: true,
          version: '1.1.1',
          maxZoom: 20,
          opacity: 0.85
        }).addTo(map);

        var currentMarker = null;

        function handleRNMessage(event) {
          try {
            var rawData = event.data;
            var data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            if (data.type === 'MOVE_TO') {
              map.setView([data.lat, data.lon], 19);
              if (currentMarker) map.removeLayer(currentMarker);
              currentMarker = L.marker([data.lat, data.lon]).addTo(map);
              if (data.ref && data.ref !== 'Sin edificio en el centro de la calle') {
                currentMarker.bindPopup('<b>Ref. Catastral:</b><br>' + data.ref).openPopup();
              }
            }
          } catch(e) {}
        }

        window.addEventListener('message', handleRNMessage);
        document.addEventListener('message', handleRNMessage);

        map.on('click', function(e) {
          if (currentMarker) map.removeLayer(currentMarker);
          currentMarker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(map);
          
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'MAP_CLICK',
            lat: e.latlng.lat,
            lon: e.latlng.lng
          }));
        });
      </script>
    </body>
    </html>
  `;

  // Abrir Ficha Oficial del Catastro en Chrome Custom Tabs
  const openOfficialFicha = async (refCat, delCode, munCode) => {
    try {
      const cleanRef = String(refCat || '').trim();
      let url = '';

      if (cleanRef.length === 20) {
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
  };

  // Obtener datos de parcelas e inmuebles (Consulta_DNPRC) con parseTagValue: false (PRESERVA CEROS A LA IZQUIERDA)
  const fetchFullParcelDetails = async (refCat, lat, lon) => {
    setLoading(true);
    setSubparcels([]);
    setShowSubparcels(false);
    setSelectedSubparcel(null);

    try {
      const urlDNPRC = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC?Provincia=&Municipio=&RC=${refCat}`;
      const response = await fetch(urlDNPRC);
      const xmlData = await response.text();

      // PARSEADOR SEGURO: Preserva ceros iniciales en strings sin convertir a number
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

          if (index === 0 && dtObj) {
            delCode = dtObj?.loine?.cp ? String(dtObj.loine.cp).padStart(2, '0') : '';
            munCode = dtObj?.cmc ? String(dtObj.cmc) : '';
          }

          const full20RC = rcObj ? `${rcObj.pc1}${rcObj.pc2}${rcObj.car}${rcObj.cc1}${rcObj.cc2}` : refCat;

          const dirObj = dtObj?.locs?.lous?.lourb?.dir;
          const lointObj = dtObj?.locs?.lous?.lourb?.loint;

          const street = dirObj ? `${dirObj.tv || ''} ${dirObj.nv || ''} ${dirObj.pnp || ''}`.trim() : '';
          const muni = dtObj?.nm || '';
          const prov = dtObj?.np || '';
          const cp = dtObj?.locs?.lous?.lourb?.dp || '';

          const planta = lointObj?.pt ? `Planta ${lointObj.pt}` : '';
          const puerta = lointObj?.pu ? `Puerta ${lointObj.pu}` : '';
          const interior = [planta, puerta].filter(Boolean).join(', ');

          if (index === 0) {
            mainAddress = `${street}, ${muni} (${prov}) ${cp}`.trim();
          }

          parsedSubparcels.push({
            id: full20RC,
            ref20: full20RC,
            cargo: rcObj?.car || `${index + 1}`,
            address: street,
            interior: interior || 'Inmueble / Parcela Principal',
            muni,
            prov,
            del: delCode,
            mun: munCode
          });
        });
      } 
      // 2. Caso Finca de 1 solo inmueble / Chalet / Nave (<bico>)
      else if (dnp?.bico?.bi) {
        const bi = dnp.bico.bi;
        const rcObj = bi?.idbi?.rc;
        const dtObj = bi?.dt;

        delCode = dtObj?.loine?.cp ? String(dtObj.loine.cp).padStart(2, '0') : '';
        munCode = dtObj?.cmc ? String(dtObj.cmc) : '';
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
          interior: 'Inmueble Único (Finca / Chalet)',
          muni,
          prov,
          del: delCode,
          mun: munCode
        });
      }

      setSubparcels(parsedSubparcels);
      setParcelDetails({
        refCat,
        ref20: parsedSubparcels[0]?.ref20 || refCat,
        lat,
        lon,
        address: mainAddress || 'Ubicación Catastral',
        count: totalCount,
        del: delCode,
        mun: munCode
      });
    } catch (err) {
      setParcelDetails({
        refCat,
        ref20: refCat,
        lat,
        lon,
        address: 'Ubicación Seleccionada',
        count: 1
      });
    } finally {
      setLoading(false);
    }
  };

  // Clic en Coordenadas del Mapa con Sondeo Espacial de Radio
  const fetchParcelByCoords = async (lat, lon) => {
    setLoading(true);

    webViewRef.current?.postMessage(JSON.stringify({
      type: 'MOVE_TO',
      lat,
      lon
    }));

    try {
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
        setSelectedParcel({ lat, lon, ref: refCatastral });

        webViewRef.current?.postMessage(JSON.stringify({
          type: 'MOVE_TO',
          lat,
          lon,
          ref: refCatastral
        }));

        await fetchFullParcelDetails(refCatastral, lat, lon);
      } else {
        setParcelDetails({
          refCat: 'Sin edificio en el punto exacto',
          ref20: '',
          lat,
          lon,
          address: 'Ubicación alcanzada. Toca cualquier edificio en el mapa para ver sus datos.',
          count: 0,
          noExactBuilding: true
        });
      }
    } catch (err) {
      Alert.alert('Error', 'No se pudo conectar con el Catastro.');
    } finally {
      setLoading(false);
    }
  };

  // Buscador de Direcciones usando ArcGIS Cartociudad con outFields=* (extrae Pedanía / District)
  const handleSearchTextChange = (text) => {
    setQuery(text);
    setShowRecent(false);
    if (typingTimer.current) clearTimeout(typingTimer.current);

    if (text.length < 3) {
      setSuggestions([]);
      return;
    }

    const cleanText = text.trim().toUpperCase();

    // Detección segura de Referencia Catastral a partir de 13 caracteres sin espacios
    if (cleanText.length >= 13 && !cleanText.includes(' ') && /^[A-Z0-9]+$/.test(cleanText)) {
      setSuggestions([{
        place_id: 'rc_direct',
        display_name: `🔎 Buscar Referencia Catastral: ${cleanText}`,
        isRC: true,
        rc: cleanText
      }]);
      return;
    }

    typingTimer.current = setTimeout(async () => {
      try {
        const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(text)}&countryCode=ESP&maxLocations=6&outFields=*`;
        const response = await fetch(url);
        const data = await response.json();

        if (data?.candidates?.length > 0) {
          const mapped = data.candidates.map((c, idx) => {
            const attrs = c.attributes || {};
            const district = attrs.District || attrs.Neighborhood || '';
            const city = attrs.City || attrs.Subregion || '';
            const postal = attrs.Postal || '';

            let formattedTitle = c.address;
            if (district && !c.address.toLowerCase().includes(district.toLowerCase())) {
              const parts = c.address.split(',');
              if (parts.length >= 2) {
                formattedTitle = `${parts[0].trim()}, ${district} (${parts.slice(1).join(',').trim()})`;
              } else {
                formattedTitle = `${c.address}, ${district}`;
              }
            }

            return {
              place_id: `arcgis_${idx}`,
              display_name: formattedTitle,
              lat: c.location.y,
              lon: c.location.x,
              district,
              city
            };
          });
          setSuggestions(mapped);
        } else {
          // Fallback a Nominatim si no hay resultados
          const fallbackUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&countrycodes=es&limit=5`;
          const resNom = await fetch(fallbackUrl, {
            headers: { 'User-Agent': 'CatastroGSM-App/1.0' }
          });
          if (resNom.ok) {
            const dataNom = await resNom.json();
            setSuggestions(dataNom);
          }
        }
      } catch (err) {
        console.error('Error buscando dirección:', err);
      }
    }, 350);
  };

  const executeSearch = () => {
    if (!query.trim()) return;
    Keyboard.dismiss();
    setShowRecent(false);

    saveRecentSearch(query);

    const clean = query.trim().toUpperCase();

    if (clean.length >= 13 && !clean.includes(' ') && /^[A-Z0-9]+$/.test(clean)) {
      onSelectSuggestion({ isRC: true, rc: clean });
      return;
    }

    const coordMatch = query.match(/^(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      setSuggestions([]);
      fetchParcelByCoords(lat, lon);
      return;
    }

    if (suggestions.length > 0) {
      onSelectSuggestion(suggestions[0]);
    } else {
      handleSearchTextChange(query);
    }
  };

  const onSelectSuggestion = async (item) => {
    Keyboard.dismiss();
    setSuggestions([]);
    setShowRecent(false);

    if (item.isRC) {
      setQuery(item.rc);
      saveRecentSearch(item.rc);
      setLoading(true);
      try {
        // CORREGIDO: Usar RC= en lugar de RefCat= para que el Catastro devuelva las coordenadas
        const url = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG:4326&RC=${item.rc}`;
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
          setSelectedParcel({ lat: ycen, lon: xcen, ref: item.rc });
          webViewRef.current?.postMessage(JSON.stringify({
            type: 'MOVE_TO',
            lat: ycen,
            lon: xcen,
            ref: item.rc
          }));

          await fetchFullParcelDetails(item.rc, ycen, xcen);
        } else {
          Alert.alert('No encontrada', 'No se encontraron coordenadas para esa Referencia Catastral.');
        }
      } catch (err) {
        Alert.alert('Error', 'Fallo al consultar el Catastro.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Dirección normal
    setQuery(item.display_name);
    saveRecentSearch(item.display_name);

    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);

    webViewRef.current?.postMessage(JSON.stringify({
      type: 'MOVE_TO',
      lat,
      lon
    }));

    await fetchParcelByCoords(lat, lon);
  };

  const clearInputText = () => {
    setQuery('');
    setSuggestions([]);
    setShowRecent(recentSearches.length > 0);
  };

  const copyToClipboard = (text) => {
    Clipboard.setString(text);
    Alert.alert('Copiado', `Referencia copiada al portapapeles:\n${text}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Buscador Superior con Historial y Botón X */}
      <View style={styles.searchContainer}>
        <Text style={styles.appTitle}>🏛️ Catastro 360</Text>
        
        <View style={styles.inputRow}>
          <View style={styles.inputBoxContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Dirección, Calle y Nº, Ref. Catastral..."
              placeholderTextColor="#888"
              value={query}
              onChangeText={handleSearchTextChange}
              onFocus={() => {
                if (query.trim().length === 0 && recentSearches.length > 0) {
                  setShowRecent(true);
                }
              }}
              onSubmitEditing={executeSearch}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity style={styles.clearIconBtn} onPress={clearInputText}>
                <Text style={styles.clearIconText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.searchButton} onPress={executeSearch}>
            <Text style={styles.searchButtonText}>Buscar</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#0066cc" />
            <Text style={styles.loadingText}> Consultando Sede del Catastro...</Text>
          </View>
        )}

        {/* Lista de Búsquedas Recientes */}
        {showRecent && recentSearches.length > 0 && (
          <View style={styles.recentContainer}>
            <View style={styles.recentHeaderRow}>
              <Text style={styles.recentHeaderText}>🕒 Búsquedas Recientes</Text>
              <TouchableOpacity onPress={clearAllRecent}>
                <Text style={styles.recentClearAllText}>Borrar historial</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.recentScroll} keyboardShouldPersistTaps="handled">
              {recentSearches.map((item, idx) => (
                <View key={idx} style={styles.recentRowItem}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => {
                      setQuery(item);
                      setShowRecent(false);
                      handleSearchTextChange(item);
                    }}
                  >
                    <Text style={styles.recentItemText} numberOfLines={1}>🕒 {item}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ paddingLeft: 8 }}
                    onPress={() => removeRecentSearch(item)}
                  >
                    <Text style={styles.recentDeleteBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Lista de Sugerencias de Autocompletado */}
        {suggestions.length > 0 && (
          <FlatList
            data={suggestions}
            keyExtractor={(item, idx) => item.place_id ? item.place_id.toString() : idx.toString()}
            style={styles.suggestionsList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.suggestionItem} onPress={() => onSelectSuggestion(item)}>
                <Text numberOfLines={2} style={item.isRC ? styles.rcSuggestionText : styles.suggestionText}>
                  {item.display_name}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {/* Mapa Interactivo Leaflet + WMS Catastro */}
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: leafletHTML }}
        style={styles.map}
        onMessage={(e) => {
          try {
            const data = JSON.parse(e.nativeEvent.data);
            if (data.type === 'MAP_CLICK') fetchParcelByCoords(data.lat, data.lon);
          } catch (err) {}
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />

      {/* Tarjeta de Información de la Parcela e Inmuebles */}
      {parcelDetails && (
        <View style={styles.detailsCard}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardAddress} numberOfLines={2}>{parcelDetails.address}</Text>

              {!parcelDetails.noExactBuilding && (
                <>
                  <Text style={styles.cardRefLabel}>Ref. Catastral Base (14 car.):</Text>
                  <TouchableOpacity onPress={() => copyToClipboard(parcelDetails.refCat)}>
                    <Text style={styles.cardRefValue}>{parcelDetails.refCat} 📋</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <TouchableOpacity style={styles.closeCardBtn} onPress={() => setParcelDetails(null)}>
              <Text style={styles.closeCardBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {!parcelDetails.noExactBuilding ? (
            <>
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>🏢 {parcelDetails.count} Inmueble(s) / Subparcelas</Text>
                </View>
              </View>

              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => {
                    const isSingle = parcelDetails.count === 1;
                    const refToOpen = isSingle ? (parcelDetails.ref20 || parcelDetails.refCat) : parcelDetails.refCat;
                    openOfficialFicha(refToOpen, parcelDetails.del, parcelDetails.mun);
                  }}
                >
                  <Text style={styles.btnPrimaryText}>
                    {parcelDetails.count === 1 ? '📄 Abrir Ficha Oficial del Inmueble' : '📄 Abrir Mapa de la Parcela Base'}
                  </Text>
                </TouchableOpacity>

                {subparcels.length > 1 && (
                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => setShowSubparcels(!showSubparcels)}
                  >
                    <Text style={styles.btnSecondaryText}>
                      {showSubparcels ? '▲ Ocultar Pisos / Locales' : '▼ Ver Lista de Pisos / Locales'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Lista Desplegable de Subparcelas / Pisos de 20 dígitos */}
              {showSubparcels && subparcels.length > 1 && (
                <ScrollView style={styles.subparcelsScroll} nestedScrollEnabled={true}>
                  <Text style={styles.subparcelsHeader}>Selecciona un piso para abrir su Ficha Oficial:</Text>
                  {subparcels.map((sub, idx) => {
                    const isSelected = selectedSubparcel?.id === sub.id;
                    return (
                      <View
                        key={sub.id + idx}
                        style={[styles.subparcelItem, isSelected && styles.subparcelItemSelected]}
                      >
                        <TouchableOpacity
                          style={{ flex: 1 }}
                          onPress={() => setSelectedSubparcel(sub)}
                        >
                          <Text style={styles.subparcelTitle}>{sub.interior}</Text>
                          <Text style={styles.subparcelRC}>{sub.ref20}</Text>
                        </TouchableOpacity>

                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity
                            style={styles.btnMiniFicha}
                            onPress={() => openOfficialFicha(sub.ref20, sub.del, sub.mun)}
                          >
                            <Text style={styles.btnMiniFichaText}>Ficha 🌐</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.copyBtnMini}
                            onPress={() => copyToClipboard(sub.ref20)}
                          >
                            <Text style={styles.copyBtnMiniText}>Copiar</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </>
          ) : (
            <Text style={styles.hintText}>💡 Toca cualquier parcela o edificio en el mapa para cargar sus datos catastrales completos.</Text>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  searchContainer: {
    position: 'absolute',
    top: 45,
    left: 14,
    right: 14,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 12,
    zIndex: 100,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  appTitle: { fontWeight: 'bold', fontSize: 15, marginBottom: 8, color: '#111' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  inputBoxContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', position: 'relative' },
  searchInput: {
    flex: 1,
    height: 42,
    borderColor: '#ccc',
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 34,
    borderRadius: 8,
    backgroundColor: '#fafafa',
    fontSize: 13,
    color: '#000'
  },
  clearIconBtn: { position: 'absolute', right: 8, padding: 6 },
  clearIconText: { fontSize: 14, color: '#888', fontWeight: 'bold' },
  searchButton: {
    backgroundColor: '#0066cc',
    paddingHorizontal: 14,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginLeft: 8,
  },
  searchButtonText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  loadingBox: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  loadingText: { color: '#0066cc', fontSize: 12, fontWeight: '500' },

  // Estilos de búsquedas recientes
  recentContainer: {
    marginTop: 8,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 8,
  },
  recentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  recentHeaderText: { fontSize: 11, fontWeight: 'bold', color: '#555' },
  recentClearAllText: { fontSize: 11, color: '#cc0000', fontWeight: '600' },
  recentScroll: { maxHeight: 160 },
  recentRowItem: {
    flexDirection: 'row',
    justify: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  recentItemText: { fontSize: 12, color: '#333' },
  recentDeleteBtn: { fontSize: 13, color: '#999', paddingHorizontal: 4, fontWeight: 'bold' },

  suggestionsList: {
    maxHeight: 210,
    marginTop: 8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  suggestionText: { fontSize: 13, color: '#333' },
  rcSuggestionText: { fontSize: 13, color: '#0066cc', fontWeight: 'bold' },
  map: { flex: 1, zIndex: 1 },
  detailsCard: {
    position: 'absolute',
    bottom: 20,
    left: 14,
    right: 14,
    maxHeight: SCREEN_HEIGHT * 0.48,
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 14,
    zIndex: 100,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardAddress: { fontWeight: 'bold', fontSize: 14, color: '#222' },
  cardRefLabel: { fontSize: 11, color: '#666', marginTop: 4 },
  cardRefValue: { fontSize: 16, fontWeight: 'bold', color: '#0066cc', marginTop: 2 },
  closeCardBtn: { padding: 4, paddingLeft: 10 },
  closeCardBtnText: { fontSize: 18, color: '#888', fontWeight: 'bold' },
  badgeRow: { flexDirection: 'row', marginVertical: 8 },
  badge: { backgroundColor: '#e6f2ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#0066cc', fontSize: 12, fontWeight: '600' },
  hintText: { fontSize: 12, color: '#666', marginTop: 8, fontStyle: 'italic' },
  actionButtonsRow: { flexDirection: 'column', gap: 6, marginTop: 4 },
  btnPrimary: {
    backgroundColor: '#0066cc',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimaryText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  btnSecondary: {
    backgroundColor: '#f0f4f8',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d0e0f0'
  },
  btnSecondaryText: { color: '#0055aa', fontWeight: '600', fontSize: 12 },
  subparcelsScroll: { marginTop: 10, maxHeight: 160, borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 8 },
  subparcelsHeader: { fontWeight: 'bold', fontSize: 12, color: '#444', marginBottom: 6 },
  subparcelItem: {
    flexDirection: 'row',
    justify: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    borderRadius: 6
  },
  subparcelItemSelected: { backgroundColor: '#e6f2ff' },
  subparcelTitle: { fontSize: 12, color: '#222', fontWeight: '500' },
  subparcelRC: { fontSize: 11, color: '#0066cc', fontFamily: 'monospace' },
  btnMiniFicha: { backgroundColor: '#0066cc', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  btnMiniFichaText: { fontSize: 10, color: 'white', fontWeight: 'bold' },
  copyBtnMini: { backgroundColor: '#eef', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  copyBtnMiniText: { fontSize: 10, color: '#0066cc', fontWeight: 'bold' },
});
