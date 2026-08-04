import React, { useState, useRef } from 'react';
import { StyleSheet, View, TextInput, Button, Text, Alert, Keyboard } from 'react-native';
import MapView, { WMSTile } from 'react-native-maps';
import { XMLParser } from 'fast-xml-parser';

export default function App() {
  const [refCatastral, setRefCatastral] = useState('');
  const [loading, setLoading] = useState(false);
  const mapRef = useRef(null);

  // Madrid center by default
  const initialRegion = {
    latitude: 40.4168,
    longitude: -3.7038,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  const searchByRefCatastral = async () => {
    if (!refCatastral || refCatastral.length < 14) {
      Alert.alert('Error', 'Introduce una referencia catastral válida (mínimo 14 caracteres).');
      return;
    }

    setLoading(true);
    Keyboard.dismiss();
    try {
      // Usamos la API del Catastro para sacar las coordenadas
      const url = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG:4326&RefCat=${refCatastral}`;
      const response = await fetch(url);
      const xmlData = await response.text();
      
      const parser = new XMLParser();
      const jsonObj = parser.parse(xmlData);

      const error = jsonObj?.consulta_coordenadas?.control?.cuerr;
      if (error && parseInt(error) > 0) {
        Alert.alert('Error', 'No se encontró la parcela o hubo un error en Catastro.');
        setLoading(false);
        return;
      }

      // Parseamos lat y lon
      let xcen, ycen;
      const coord = jsonObj?.consulta_coordenadas?.coordenadas?.coord;
      
      if (Array.isArray(coord)) {
        xcen = parseFloat(coord[0].geo.xcen);
        ycen = parseFloat(coord[0].geo.ycen);
      } else if (coord) {
        xcen = parseFloat(coord.geo.xcen);
        ycen = parseFloat(coord.geo.ycen);
      } else {
        Alert.alert('Error', 'No se encontraron coordenadas.');
        setLoading(false);
        return;
      }

      // Centramos el mapa
      if (mapRef.current && xcen && ycen) {
        mapRef.current.animateToRegion({
          latitude: ycen, // ycen es latitud (EPSG:4326)
          longitude: xcen, // xcen es longitud
          latitudeDelta: 0.002,
          longitudeDelta: 0.002,
        }, 1000);
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
        <Text style={styles.title}>Buscador del Catastro</Text>
        <TextInput
          style={styles.input}
          placeholder="Referencia Catastral (Ej: 1234567VK4713S)"
          value={refCatastral}
          onChangeText={setRefCatastral}
          autoCapitalize="characters"
        />
        <Button 
          title={loading ? "Buscando..." : "Buscar Parcela"} 
          onPress={searchByRefCatastral} 
          disabled={loading}
        />
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
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  title: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 10,
  },
  input: {
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  map: {
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
});
