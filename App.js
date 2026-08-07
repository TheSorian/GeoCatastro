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
import { cadastreService } from './services/cadastre/CadastreService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import appConfig from './app.json';

SplashScreen.preventAutoHideAsync().catch(() => {});

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
  const [selectedRegion, setSelectedRegion] = useState('ES');
  const [subparcelFilter, setSubparcelFilter] = useState('');

  const webViewRef = useRef(null);
  const typingTimer = useRef(null);

  const CURRENT_VERSION = appConfig.expo.version;

  // Cargar búsquedas recientes y comprobar actualizaciones en GitHub al iniciar
  useEffect(() => {
    loadRecentSearches();
    checkAppUpdate();
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const checkAppUpdate = async () => {
    try {
      const response = await fetch('https://api.github.com/repos/TheSorian/GeoCatastro/releases/latest');
      if (!response.ok) return;

      const data = await response.json();
      const latestTag = data?.tag_name || '';
      const cleanLatest = latestTag.replace(/^v/, '').trim();

      if (cleanLatest && isVersionNewer(CURRENT_VERSION, cleanLatest)) {
        const downloadUrl = data?.assets?.[0]?.browser_download_url || data?.html_url;

        Alert.alert(
          '🚀 Nueva Actualización Disponible',
          `Existe una nueva versión de GeoCatastro (${latestTag}). ¿Deseas descargar e instalar la actualización ahora?`,
          [
            { text: 'Más tarde', style: 'cancel' },
            {
              text: '📲 Actualizar Ahora',
              onPress: async () => {
                if (downloadUrl) {
                  await WebBrowser.openBrowserAsync(downloadUrl);
                }
              }
            }
          ]
        );
      }
    } catch (e) {}
  };

  const isVersionNewer = (current, latest) => {
    const pCurrent = current.split('.').map(Number);
    const pLatest = latest.split('.').map(Number);
    for (let i = 0; i < Math.max(pCurrent.length, pLatest.length); i++) {
      const c = pCurrent[i] || 0;
      const l = pLatest[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  };

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

        var currentWMSUrl = 'https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx';
        var currentWMSLayers = 'catastro';

        var catastroWMS = L.tileLayer.wms(currentWMSUrl, {
          layers: currentWMSLayers,
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
            if (data.type === 'CHANGE_REGION') {
              if (catastroWMS) map.removeLayer(catastroWMS);
              currentWMSUrl = data.wmsUrl;
              currentWMSLayers = data.wmsLayers;
              catastroWMS = L.tileLayer.wms(currentWMSUrl, {
                layers: currentWMSLayers,
                format: 'image/png',
                transparent: true,
                version: '1.1.1',
                maxZoom: 20,
                opacity: 0.85
              }).addTo(map);
            } else if (data.type === 'MOVE_TO') {
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

  // Abrir Ficha Oficial delegado a CadastreService
  const openOfficialFicha = async (item) => {
    // Para Estado necesitamos refCat (o ref20), delCode, munCode. 
    // Para Navarra necesitamos también parCode y subareaCode (si existe)
    const ref = item.ref20 || item.refCat;
    await cadastreService.openOfficialFicha(ref, item.del, item.mun, item.parCode, item.subareaCode, selectedRegion);
  };

  // Obtener datos de parcelas e inmuebles
  const fetchFullParcelDetails = async (refCat, lat, lon, regionOverride) => {
    setLoading(true);
    setSubparcels([]);
    setShowSubparcels(false);
    setSelectedSubparcel(null);
    const detectedRegion = (lat && lon) ? cadastreService.detectRegionFromCoords(lat, lon) : selectedRegion;
    const targetRegion = regionOverride || detectedRegion;

    if (targetRegion !== selectedRegion) {
      changeRegion(targetRegion);
    }

    try {
      const data = await cadastreService.fetchFullParcelDetails(refCat, lat, lon, targetRegion);
      setSubparcels(data.subparcels || []);
      setParcelDetails(data.parcelDetails);
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
  const fetchParcelByCoords = async (lat, lon, regionOverride) => {
    setLoading(true);
    const detectedRegion = cadastreService.detectRegionFromCoords(lat, lon);
    const targetRegion = regionOverride || detectedRegion;

    if (targetRegion !== selectedRegion) {
      changeRegion(targetRegion);
    }

    webViewRef.current?.postMessage(JSON.stringify({
      type: 'MOVE_TO',
      lat,
      lon
    }));

    try {
      const result = await cadastreService.fetchParcelByCoords(lat, lon, targetRegion);

      if (result && result.found) {
        setSelectedParcel({ lat, lon, ref: result.ref });

        webViewRef.current?.postMessage(JSON.stringify({
          type: 'MOVE_TO',
          lat,
          lon,
          ref: result.ref
        }));

        await fetchFullParcelDetails(result.ref, lat, lon, targetRegion);
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

            let formattedTitle = c.address;
            if (district && !c.address.toLowerCase().includes(district.toLowerCase())) {
              const parts = c.address.split(',');
              if (parts.length >= 2) {
                formattedTitle = `${parts[0].trim()}, ${district} (${parts.slice(1).join(',').trim()})`;
              } else {
                formattedTitle = `${c.address}, ${district}`;
              }
            }

            const region = (city.toLowerCase() === 'navarra' || c.address.toLowerCase().includes('navarra') || attrs.Subregion === 'Navarra') ? 'NA' : 'ES';

            return {
              place_id: `arcgis_${idx}`,
              display_name: formattedTitle,
              lat: c.location.y,
              lon: c.location.x,
              district,
              city,
              region
            };
          });
          setSuggestions(mapped);
        } else {
          // Intentar primero con la API suggest de ArcGIS para consultas de calle + número sin municipio
          const urlSuggest = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest?f=json&text=${encodeURIComponent(text)}&countryCode=ESP&maxSuggestions=6`;
          const resS = await fetch(urlSuggest);
          const dataS = await resS.json();

          if (dataS?.suggestions?.length > 0) {
            const mappedSuggestions = [];
            for (const s of dataS.suggestions) {
              if (s.magicKey) {
                try {
                  const urlKey = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&magicKey=${s.magicKey}&outFields=*`;
                  const resKey = await fetch(urlKey);
                  const dataKey = await resKey.json();
                  if (dataKey?.candidates?.[0]) {
                    const c = dataKey.candidates[0];
                    const attrs = c.attributes || {};
                    const district = attrs.District || attrs.Neighborhood || '';
                    const city = attrs.City || attrs.Subregion || '';

                    let formattedTitle = c.address;
                    if (district && !c.address.toLowerCase().includes(district.toLowerCase())) {
                      const parts = c.address.split(',');
                      if (parts.length >= 2) {
                        formattedTitle = `${parts[0].trim()}, ${district} (${parts.slice(1).join(',').trim()})`;
                      } else {
                        formattedTitle = `${c.address}, ${district}`;
                      }
                    }

                    const region = (city.toLowerCase() === 'navarra' || c.address.toLowerCase().includes('navarra') || attrs.Subregion === 'Navarra') ? 'NA' : 'ES';

                    mappedSuggestions.push({
                      place_id: `arcgis_sugg_${s.magicKey}`,
                      display_name: formattedTitle,
                      lat: c.location.y,
                      lon: c.location.x,
                      district,
                      city,
                      region
                    });
                  }
                } catch(e) {}
              }
            }
            if (mappedSuggestions.length > 0) {
              setSuggestions(mappedSuggestions);
              return;
            }
          }

          // Fallback final a Nominatim si no hay resultados en ArcGIS
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

  const changeRegion = (newRegion) => {
    if (newRegion !== selectedRegion) {
      setSelectedRegion(newRegion);
      webViewRef.current?.postMessage(JSON.stringify({
        type: 'CHANGE_REGION',
        wmsUrl: cadastreService.getWMSUrl(newRegion),
        wmsLayers: cadastreService.getWMSLayers(newRegion)
      }));
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
        const result = await cadastreService.getCoordsFromRC(item.rc, selectedRegion);
        
        if (result && result.found) {
          setSelectedParcel({ lat: result.lat, lon: result.lon, ref: item.rc });
          webViewRef.current?.postMessage(JSON.stringify({
            type: 'MOVE_TO',
            lat: result.lat,
            lon: result.lon,
            ref: item.rc
          }));

          await fetchFullParcelDetails(item.rc, result.lat, result.lon, selectedRegion);
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

    if (item.region && item.region !== selectedRegion) {
      changeRegion(item.region);
    }

    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);

    webViewRef.current?.postMessage(JSON.stringify({
      type: 'MOVE_TO',
      lat,
      lon
    }));

    await fetchParcelByCoords(lat, lon, item.region);
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

  const cleanQuery = query.trim().toUpperCase();
  const isRCInput = cleanQuery.length >= 13 && !cleanQuery.includes(' ') && /^[A-Z0-9]+$/.test(cleanQuery);

  return (
    <SafeAreaView style={styles.container}>
      {/* Buscador Superior con Historial y Botón X */}
      <View style={styles.searchContainer}>
        <Text style={styles.appTitle}>🏛️ GeoCatastro</Text>
        
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

        {isRCInput && (
          <View style={styles.regionSelectorRow}>
            <TouchableOpacity 
              style={[styles.regionBtn, selectedRegion === 'ES' && styles.regionBtnActive]}
              onPress={() => changeRegion('ES')}
            >
              <Text style={[styles.regionBtnText, selectedRegion === 'ES' && styles.regionBtnTextActive]}>🇪🇸 Estado</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.regionBtn, selectedRegion === 'NA' && styles.regionBtnActive]}
              onPress={() => changeRegion('NA')}
            >
              <Text style={[styles.regionBtnText, selectedRegion === 'NA' && styles.regionBtnTextActive]}>🔴 Navarra</Text>
            </TouchableOpacity>
          </View>
        )}

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
                    openOfficialFicha({
                      refCat: refToOpen,
                      ref20: parcelDetails.ref20,
                      del: parcelDetails.del,
                      mun: parcelDetails.mun,
                      parCode: parcelDetails.parCode,
                      subareaCode: '' // Parcela principal
                    });
                  }}
                >
                  <Text style={styles.btnPrimaryText}>
                    {parcelDetails.count === 1 ? '📄 Abrir Ficha del Inmueble' : '📄 Abrir Mapa de Parcela'}
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
                <View style={styles.subparcelsContainer}>
                  <Text style={styles.subparcelsHeader}>Selecciona un piso para abrir su Ficha:</Text>
                  
                  <TextInput
                    style={styles.subparcelFilterInput}
                    placeholder="Filtrar por portal, planta, puerta..."
                    placeholderTextColor="#888"
                    value={subparcelFilter}
                    onChangeText={setSubparcelFilter}
                  />

                  <ScrollView style={styles.subparcelsScroll} nestedScrollEnabled={true}>
                    {subparcels.filter(sub => {
                      if (!subparcelFilter) return true;
                      const term = subparcelFilter.toLowerCase();
                      const addr = (sub.address || '').toLowerCase();
                      const int = (sub.interior || '').toLowerCase();
                      return addr.includes(term) || int.includes(term);
                    }).map((sub, idx) => {
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
                            onPress={() => openOfficialFicha(sub)}
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
                </View>
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
  regionSelectorRow: { flexDirection: 'row', marginTop: 10, backgroundColor: '#f0f0f0', borderRadius: 8, padding: 2 },
  regionBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  regionBtnActive: { backgroundColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1, elevation: 2 },
  regionBtnText: { fontSize: 12, color: '#666', fontWeight: '600' },
  regionBtnTextActive: { color: '#0066cc', fontWeight: 'bold' },

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

  subparcelsContainer: {
    maxHeight: 250,
    marginTop: 10,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 8
  },
  subparcelsScroll: { },
  subparcelFilterInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    marginBottom: 8,
    color: '#333'
  },

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
