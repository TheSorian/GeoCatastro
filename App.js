import React, { useState, useRef } from 'react';
import { StyleSheet, View, TextInput, Text, Alert, Keyboard, FlatList, TouchableOpacity } from 'react-native';
import MapView, { WMSTile, Marker } from 'react-native-maps';
import { XMLParser } from 'fast-xml-parser';

export default function App() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedParcel, setSelectedParcel] = useState(null);
  
  const mapRef = useRef(null);
  const typingTimer = useRef(null);

  const initialRegion = {
    latitude: 40.4168,
    longitude: -3.7038,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  // Buscador de Direcciones usando OpenStreetMap (Nominatim)
  const handleSearch = (text) => {
    setQuery(text);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    
    if (text.length < 4) {
      setSuggestions([]);
      return;
    }

    typingTimer.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&countrycodes=es&limit=5`;
        const response = await fetch(url);
        const data = await response.json();
        setSuggestions(data);
      } catch (err) {
        console.error(err);
      }
    }, 500); // 500ms delay
  };

  const onSelectSuggestion = async (item) => {
    Keyboard.dismiss();
    setSuggestions([]);
    setQuery(item.display_name);
    setLoading(true);

    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);

    // 1. Mover el mapa a la dirección
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: lat,
        longitude: lon,
        latitudeDelta: 0.001,
        longitudeDelta: 0.001,
      }, 1000);
    }

    // 2. Pedir al Catastro qué parcela hay en esa coordenada
    try {
      const url = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=${lon}&Coordenada_Y=${lat}`;
      const response = await fetch(url);
      const xmlData = await response.text();
      
      const parser = new XMLParser();
      const jsonObj = parser.parse(xmlData);

      const error = jsonObj?.consulta_coordenadas?.control?.cuerr;
      if (error && parseInt(error) > 0) {
        Alert.alert('Catastro', 'No se ha encontrado ninguna parcela del Catastro en esta ubicación exacta.');
        setSelectedParcel({ lat, lon, ref: 'Desconocida' });
      } else {
        const pc = jsonObj?.consulta_coordenadas?.coordenadas?.coord?.pc;
        if (pc) {
          const refCatastral = `${pc.pc1}${pc.pc2}`;
          setSelectedParcel({ lat, lon, ref: refCatastral });
          Alert.alert('Parcela Encontrada', `Referencia Catastral:\n${refCatastral}`);
        }
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Fallo al conectar con el Catastro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <Text style={styles.title}>Buscador Inteligente</Text>
        <TextInput
          style={styles.input}
          placeholder="Escribe una dirección (Ej: Gran Vía 1, Madrid)"
          value={query}
          onChangeText={handleSearch}
        />
        {loading && <Text style={styles.loadingText}>Buscando en el Catastro...</Text>}
        
        {suggestions.length > 0 && (
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.place_id.toString()}
            style={styles.suggestionsList}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.suggestionItem} onPress={() => onSelectSuggestion(item)}>
                <Text numberOfLines={2}>{item.display_name}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      <MapView 
        ref={mapRef}
        style={styles.map} 
        initialRegion={initialRegion}
        mapType="standard"
      >
        <WMSTile
          urlTemplate="https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx?REQUEST=GetMap&SERVICE=WMS&VERSION=1.1.1&LAYERS=catastro&STYLES=&FORMAT=image/png&BGCOLOR=0xFFFFFF&TRANSPARENT=TRUE&SRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={minX},{minY},{maxX},{maxY}"
          zIndex={1}
          opacity={0.7}
        />
        {selectedParcel && (
          <Marker 
            coordinate={{ latitude: selectedParcel.lat, longitude: selectedParcel.lon }}
            title="Referencia Catastral"
            description={selectedParcel.ref}
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBox: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    zIndex: 2,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 10 },
  input: {
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    paddingHorizontal: 10,
    borderRadius: 5,
    backgroundColor: '#f9f9f9'
  },
  loadingText: { color: 'blue', marginTop: 5, fontSize: 12 },
  suggestionsList: {
    maxHeight: 150,
    marginTop: 5,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 5,
  },
  suggestionItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  map: { width: '100%', height: '100%', zIndex: 1 },
});
