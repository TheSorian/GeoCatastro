import { Linking, Platform, Alert } from 'react-native';

/**
 * Abre la app de navegación GPS del sistema (Google Maps, Waze, Apple Maps)
 * con la ruta calculada hacia las coordenadas de la parcela.
 */
export const openGpsNavigation = async (lat, lon, label = 'Finca') => {
  if (!lat || !lon) {
    Alert.alert('Ubicación no disponible', 'No se disponen de coordenadas válidas para esta parcela.');
    return;
  }

  const cleanLabel = encodeURIComponent(label || 'Finca');
  const destination = `${lat},${lon}`;

  // URL universal de Google Maps
  const googleMapsWebUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}&destination_place_id=${cleanLabel}`;

  try {
    if (Platform.OS === 'ios') {
      const appleMapsUrl = `maps:0,0?q=${destination}(${cleanLabel})`;
      const canOpenApple = await Linking.canOpenURL(appleMapsUrl);
      if (canOpenApple) {
        await Linking.openURL(appleMapsUrl);
        return;
      }
    } else {
      // Android Intent estándar para aplicaciones de navegación GPS
      const geoUrl = `geo:${destination}?q=${destination}(${cleanLabel})`;
      const canOpenGeo = await Linking.canOpenURL(geoUrl);
      if (canOpenGeo) {
        await Linking.openURL(geoUrl);
        return;
      }
    }

    // Fallback universal a Google Maps
    await Linking.openURL(googleMapsWebUrl);
  } catch (err) {
    try {
      await Linking.openURL(googleMapsWebUrl);
    } catch (e) {
      Alert.alert('Error', 'No se pudo abrir la aplicación de mapas.');
    }
  }
};
