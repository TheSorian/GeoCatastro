import React, { useState, useRef } from 'react';
import { StyleSheet, View, TextInput, Text, Alert, Keyboard, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { XMLParser } from 'fast-xml-parser';

export default function App() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedParcel, setSelectedParcel] = useState(null);
  
  const webViewRef = useRef(null);
  const typingTimer = useRef(null);

  // HTML embebido con Leaflet.js y Capa WMS del Catastro
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
        // Inicializar mapa centrado en España (Madrid por defecto)
        var map = L.map('map', { zoomControl: false }).setView([40.4168, -3.7038], 16);
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        // Capa Base: OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(map);

        // Capa WMS Oficial del Catastro Español
        var catastroWMS = L.tileLayer.wms('https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx', {
          layers: 'catastro',
          format: 'image/png',
          transparent: true,
          version: '1.1.1',
          maxZoom: 20,
          opacity: 0.75
        }).addTo(map);

        var currentMarker = null;

        // Escuchar mensajes desde React Native
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

        // Al hacer clic en el mapa
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

  // Consultar Referencia Catastral por Coordenadas en la API del Catastro
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
        setSelectedParcel({ lat, lon, ref: 'Sin datos en el Catastro' });
      } else {
        const pc = jsonObj?.consulta_coordenadas?.coordenadas?.coord?.pc;
        if (pc) {
          const refCatastral = `${pc.pc1}${pc.pc2}`;
          setSelectedParcel({ lat, lon, ref: refCatastral });
          
          // Notificar al mapa para abrir popup
          webViewRef.current?.postMessage(JSON.stringify({
            type: 'MOVE_TO',
            lat,
            lon,
            ref: refCatastral
          }));
        } else {
          setSelectedParcel({ lat, lon, ref: 'Sin datos catastrales' });
        }
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'No se pudo conectar con el Catastro.');
    } finally {
      setLoading(false);
    }
  };

  // Manejar búsqueda por dirección o por referencia catastral directamente
  const handleSearch = (text) => {
    setQuery(text);
    if (typingTimer.current) clearTimeout(typingTimer.current);

    if (text.length < 3) {
      setSuggestions([]);
      return;
    }

    // Si parece una Referencia Catastral (14 o 20 caracteres sin espacios)
    const cleanText = text.trim().toUpperCase();
    if (cleanText.length >= 14 && !cleanText.includes(' ')) {
      // Búsqueda directa por RC
      setSuggestions([{
        place_id: 'rc_direct',
        display_name: `🔎 Buscar Referencia Catastral: ${cleanText}`,
        isRC: true,
        rc: cleanText
      }]);
      return;
    }

    // Si es una dirección normal, buscar en Nominatim
    typingTimer.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&countrycodes=es&limit=5`;
        const response = await fetch(url);
        const data = await response.json();
        setSuggestions(data);
      } catch (err) {
        console.error(err);
      }
    }, 450);
  };

  // Seleccionar una sugerencia
  const onSelectSuggestion = async (item) => {
    Keyboard.dismiss();
    setSuggestions([]);

    if (item.isRC) {
      // Buscar directamente por Referencia Catastral
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
        } else {
          Alert.alert('No encontrada', 'No se encontraron coordenadas para esa Referencia Catastral.');
        }
      } catch (err) {
        Alert.alert('Error', 'Fallo al buscar la Referencia Catastral.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Es dirección normal
    setQuery(item.display_name);
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);

    // Mover mapa y buscar parcela en Catastro
    webViewRef.current?.postMessage(JSON.stringify({
      type: 'MOVE_TO',
      lat,
      lon
    }));

    await fetchParcelByCoords(lat, lon);
  };

  // Recibir mensajes desde Leaflet (Clics en el mapa)
  const onWebMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'MAP_CLICK') {
        fetchParcelByCoords(data.lat, data.lon);
      }
    } catch (e) {}
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Buscador Superior */}
      <View style={styles.searchBox}>
        <Text style={styles.title}>🗺️ Catastro de España</Text>
        <TextInput
          style={styles.input}
          placeholder="Escribe dirección o Ref. Catastral..."
          value={query}
          onChangeText={handleSearch}
          clearButtonMode="while-editing"
        />
        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#0066cc" />
            <Text style={styles.loadingText}> Consultando Catastro...</Text>
          </View>
        )}
        
        {suggestions.length > 0 && (
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.place_id.toString()}
            style={styles.suggestionsList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.suggestionItem} onPress={() => onSelectSuggestion(item)}>
                <Text numberOfLines={2} style={item.isRC ? styles.rcText : styles.suggestionText}>
                  {item.display_name}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {/* Mapa con Leaflet y WMS Catastro */}
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: leafletHTML }}
        style={styles.map}
        onMessage={onWebMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />

      {/* Tarjeta Informativa de Parcela Seleccionada */}
      {selectedParcel && (
        <View style={styles.parcelCard}>
          <Text style={styles.cardTitle}>📍 Parcela Seleccionada</Text>
          <Text style={styles.cardLabel}>Referencia Catastral:</Text>
          <Text style={styles.cardRef} selectable={true}>{selectedParcel.ref}</Text>
          <Text style={styles.cardCoords}>Coordenadas: {selectedParcel.lat.toFixed(5)}, {selectedParcel.lon.toFixed(5)}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  searchBox: {
    position: 'absolute',
    top: 50,
    left: 15,
    right: 15,
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 12,
    zIndex: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 8, color: '#1a1a1a' },
  input: {
    height: 42,
    borderColor: '#ddd',
    borderWidth: 1,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fafafa',
    fontSize: 14,
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  loadingText: { color: '#0066cc', fontSize: 12, fontWeight: '500' },
  suggestionsList: {
    maxHeight: 180,
    marginTop: 6,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionText: { fontSize: 13, color: '#333' },
  rcText: { fontSize: 13, color: '#0066cc', fontWeight: 'bold' },
  map: { flex: 1, zIndex: 1 },
  parcelCard: {
    position: 'absolute',
    bottom: 25,
    left: 15,
    right: 15,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    zIndex: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  cardTitle: { fontWeight: 'bold', fontSize: 15, color: '#1a1a1a', marginBottom: 6 },
  cardLabel: { fontSize: 12, color: '#666' },
  cardRef: { fontSize: 17, fontWeight: 'bold', color: '#0066cc', marginVertical: 4 },
  cardCoords: { fontSize: 11, color: '#888' },
});
