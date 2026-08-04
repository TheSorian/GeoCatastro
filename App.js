import React, { useState, useRef } from 'react';
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
  Modal,
  ScrollView,
  Clipboard,
  Dimensions
} from 'react-native';
import { WebView } from 'react-native-webview';
import { XMLParser } from 'fast-xml-parser';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function App() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [parcelDetails, setParcelDetails] = useState(null);
  const [subparcels, setSubparcels] = useState([]);
  const [showSubparcels, setShowSubparcels] = useState(false);
  const [showFichaModal, setShowFichaModal] = useState(false);
  const [fichaUrl, setFichaUrl] = useState('');

  const webViewRef = useRef(null);
  const typingTimer = useRef(null);

  // Mapa Leaflet con Capa Oficial WMS del Catastro
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

        // Capa Base OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(map);

        // Capa WMS del Catastro
        var catastroWMS = L.tileLayer.wms('https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx', {
          layers: 'catastro',
          format: 'image/png',
          transparent: true,
          version: '1.1.1',
          maxZoom: 20,
          opacity: 0.8
        }).addTo(map);

        var currentMarker = null;

        window.addEventListener('message', function(event) {
          try {
            var data = JSON.parse(event.data);
            if (data.type === 'MOVE_TO') {
              map.setView([data.lat, data.lon], 18);
              if (currentMarker) map.removeLayer(currentMarker);
              currentMarker = L.marker([data.lat, data.lon]).addTo(map);
              if (data.ref) {
                currentMarker.bindPopup('<b>Ref. Catastral:</b><br>' + data.ref).openPopup();
              }
            }
          } catch(e) {}
        });

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

  // Obtener datos detallados del Catastro usando Consulta_DNPRC
  const fetchFullParcelDetails = async (refCat, lat, lon) => {
    setLoading(true);
    setSubparcels([]);
    setShowSubparcels(false);
    
    try {
      // 1. Consultar inmuebles / subparcelas
      const urlDNPRC = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC?Provincia=&Municipio=&RC=${refCat}`;
      const response = await fetch(urlDNPRC);
      const xmlData = await response.text();

      const parser = new XMLParser();
      const jsonObj = parser.parse(xmlData);

      const dnp = jsonObj?.consulta_dnp;
      const count = dnp?.control?.cudnp || 0;
      
      let parsedSubparcels = [];
      let mainAddress = '';

      if (dnp?.lrcdnp?.rcdnp) {
        const items = Array.isArray(dnp.lrcdnp.rcdnp) ? dnp.lrcdnp.rcdnp : [dnp.lrcdnp.rcdnp];
        
        items.forEach((item, index) => {
          const rcObj = item?.rc;
          const dtObj = item?.dt;
          
          // Construir Ref Catastral de 20 dígitos para el inmueble
          const full20RC = rcObj ? `${rcObj.pc1}${rcObj.pc2}${rcObj.car}${rcObj.cc1}${rcObj.cc2}` : refCat;
          
          // Construir dirección
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
            interior: interior || 'Finca / Parcela Principal',
            muni,
            prov
          });
        });
      }

      setSubparcels(parsedSubparcels);
      setParcelDetails({
        refCat,
        lat,
        lon,
        address: mainAddress || 'Dirección no especificada',
        count: count
      });

    } catch (err) {
      console.error(err);
      setParcelDetails({
        refCat,
        lat,
        lon,
        address: 'Ubicación seleccionada',
        count: 1
      });
    } finally {
      setLoading(false);
    }
  };

  // Clic en Coordenadas del Mapa
  const fetchParcelByCoords = async (lat, lon) => {
    setLoading(true);
    try {
      const url = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=${lon}&Coordenada_Y=${lat}`;
      const response = await fetch(url);
      const xmlData = await response.text();
      
      const parser = new XMLParser();
      const jsonObj = parser.parse(xmlData);

      const error = jsonObj?.consulta_coordenadas?.control?.cuerr;
      if (error && parseInt(error) > 0) {
        Alert.alert('Catastro', 'No hay datos catastrales registrados en esta coordenada.');
        setParcelDetails(null);
      } else {
        const pc = jsonObj?.consulta_coordenadas?.coordenadas?.coord?.pc;
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
        }
      }
    } catch (err) {
      Alert.alert('Error', 'No se pudo conectar con el Catastro.');
    } finally {
      setLoading(false);
    }
  };

  // Autocompletado de Direcciones (Nominatim con User-Agent para evitar bloqueo HTTP 403)
  const handleSearchTextChange = (text) => {
    setQuery(text);
    if (typingTimer.current) clearTimeout(typingTimer.current);

    if (text.length < 3) {
      setSuggestions([]);
      return;
    }

    // Detectar si es una Referencia Catastral directamente (14 o 20 caracteres)
    const cleanText = text.trim().toUpperCase();
    if (cleanText.length >= 14 && !cleanText.includes(' ')) {
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
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&countrycodes=es&limit=6`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'CatastroGSM-MobileApp/1.0 (contact@catastrogsm.app)'
          }
        });
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data);
        }
      } catch (err) {
        console.error('Error buscando direccion:', err);
      }
    }, 400);
  };

  // Ejecutar búsqueda activa (al pulsar botón Buscar o Enter en teclado)
  const executeSearch = () => {
    if (!query.trim()) return;
    Keyboard.dismiss();

    const clean = query.trim().toUpperCase();
    
    // 1. Comprobar si es Referencia Catastral
    if (clean.length >= 14 && !clean.includes(' ')) {
      onSelectSuggestion({ isRC: true, rc: clean });
      return;
    }

    // 2. Comprobar si son Coordenadas (ej: 40.4168, -3.7038)
    const coordMatch = query.match(/^(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      setSuggestions([]);
      fetchParcelByCoords(lat, lon);
      return;
    }

    // 3. Si hay sugerencias, usar la primera
    if (suggestions.length > 0) {
      onSelectSuggestion(suggestions[0]);
    } else {
      // Intentar búsqueda directa
      handleSearchTextChange(query);
    }
  };

  // Seleccionar sugerencia de la lista
  const onSelectSuggestion = async (item) => {
    Keyboard.dismiss();
    setSuggestions([]);

    if (item.isRC) {
      setQuery(item.rc);
      setLoading(true);
      try {
        const url = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG:4326&RefCat=${item.rc}`;
        const response = await fetch(url);
        const xmlData = await response.text();
        const parser = new XMLParser();
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
        Alert.alert('Error', 'Fallo al buscar en la API del Catastro.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Dirección normal
    setQuery(item.display_name);
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);

    webViewRef.current?.postMessage(JSON.stringify({
      type: 'MOVE_TO',
      lat,
      lon
    }));

    await fetchParcelByCoords(lat, lon);
  };

  // Abrir Ficha Oficial del Catastro en Modal Web
  const openOfficialFicha = (refCat) => {
    const url = `https://www1.sedecatastro.gob.es/Cartografia/datosBasicos.aspx?refcat=${refCat}`;
    setFichaUrl(url);
    setShowFichaModal(true);
  };

  const copyToClipboard = (text) => {
    Clipboard.setString(text);
    Alert.alert('Copiado', `Referencia copiada al portapapeles:\n${text}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Buscador Superior */}
      <View style={styles.searchContainer}>
        <Text style={styles.appTitle}>🏛️ Catastro de España</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Dirección, Ref. Catastral o Coordenadas..."
            placeholderTextColor="#888"
            value={query}
            onChangeText={handleSearchTextChange}
            onSubmitEditing={executeSearch}
            returnKeyType="search"
          />
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

      {/* Mapa Interactivo con Leaflet + Capa WMS Catastro */}
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: leafletHTML }}
        style={styles.map}
        onMessage={(e) => {
          try {
            const data = JSON.parse(e.nativeEvent.data);
            if (data.type === 'MAP_CLICK') fetchParcelByCoords(data.lat, data.lon);
          } catch(err) {}
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />

      {/* Tarjeta de Información Detallada de la Parcela */}
      {parcelDetails && (
        <View style={styles.detailsCard}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardAddress} numberOfLines={1}>{parcelDetails.address}</Text>
              <Text style={styles.cardRefLabel}>Ref. Catastral Base (14 car.):</Text>
              <TouchableOpacity onPress={() => copyToClipboard(parcelDetails.refCat)}>
                <Text style={styles.cardRefValue}>{parcelDetails.refCat} 📋</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.closeCardBtn} onPress={() => setParcelDetails(null)}>
              <Text style={styles.closeCardBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Ficha Resumen de Datos */}
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🏢 {parcelDetails.count} Inmueble(s) / Subparcelas</Text>
            </View>
          </View>

          {/* Botones de Acción */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity 
              style={styles.btnPrimary} 
              onPress={() => openOfficialFicha(parcelDetails.refCat)}
            >
              <Text style={styles.btnPrimaryText}>📄 Ficha Completa del Catastro</Text>
            </TouchableOpacity>

            {subparcels.length > 0 && (
              <TouchableOpacity 
                style={styles.btnSecondary} 
                onPress={() => setShowSubparcels(!showSubparcels)}
              >
                <Text style={styles.btnSecondaryText}>
                  {showSubparcels ? '▲ Ocultar Subparcelas' : '▼ Ver Subparcelas / Pisos'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Desplegable de Subparcelas / Bienes Inmuebles */}
          {showSubparcels && (
            <ScrollView style={styles.subparcelsScroll} nestedScrollEnabled={true}>
              <Text style={styles.subparcelsHeader}>Desglose de Bienes Inmuebles (20 dígitos):</Text>
              {subparcels.map((sub, idx) => (
                <View key={sub.id + idx} style={styles.subparcelItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subparcelTitle}>{sub.interior}</Text>
                    <Text style={styles.subparcelRC} selectTextOnPress={true}>{sub.ref20}</Text>
                  </View>
                  <TouchableOpacity style={styles.copyBtnMini} onPress={() => copyToClipboard(sub.ref20)}>
                    <Text style={styles.copyBtnMiniText}>Copiar</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Modal para Visualizar la Ficha Oficial del Catastro Web Incorporada */}
      <Modal visible={showFichaModal} animationType="slide" onRequestClose={() => setShowFichaModal(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📄 Sede Electrónica del Catastro</Text>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowFichaModal(false)}>
              <Text style={styles.modalCloseBtnText}>Cerrar ✕</Text>
            </TouchableOpacity>
          </View>
          <WebView 
            source={{ uri: fichaUrl }} 
            style={{ flex: 1 }} 
            startInLoadingState={true}
            renderLoading={() => <ActivityIndicator size="large" color="#0066cc" style={{ marginTop: 20 }} />}
          />
        </SafeAreaView>
      </Modal>
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
  searchInput: {
    flex: 1,
    height: 42,
    borderColor: '#ccc',
    borderWidth: 1,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fafafa',
    fontSize: 13,
    color: '#000'
  },
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
  suggestionsList: {
    maxHeight: 200,
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
    maxHeight: SCREEN_HEIGHT * 0.45,
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
  subparcelsScroll: { marginTop: 10, maxHeight: 140, borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 8 },
  subparcelsHeader: { fontWeight: 'bold', fontSize: 12, color: '#444', marginBottom: 6 },
  subparcelItem: {
    flexDirection: 'row',
    justify: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  subparcelTitle: { fontSize: 12, color: '#222', fontWeight: '500' },
  subparcelRC: { fontSize: 11, color: '#0066cc', fontFamily: 'monospace' },
  copyBtnMini: { backgroundColor: '#eef', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  copyBtnMiniText: { fontSize: 10, color: '#0066cc', fontWeight: 'bold' },
  modalContainer: { flex: 1, backgroundColor: 'white' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#0066cc',
  },
  modalTitle: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  modalCloseBtn: { padding: 4 },
  modalCloseBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 }
});
