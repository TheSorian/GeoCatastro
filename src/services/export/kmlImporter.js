import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';

/**
 * Calcula la distancia métrica entre dos puntos WGS84
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radio de la Tierra en metros
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calcula el área de un polígono en coordenadas WGS84 (en metros cuadrados)
 */
function calculatePolygonArea(coords) {
  if (!coords || coords.length < 3) return 0;
  const len = coords.length;
  let avgLat = 0;
  for (let i = 0; i < len; i++) {
    avgLat += coords[i].lat;
  }
  avgLat = (avgLat / len) * (Math.PI / 180);

  const kx = 111319.49079327357 * Math.cos(avgLat);
  const ky = 111132.954;

  let area = 0;
  for (let j = 0; j < len; j++) {
    const c1 = coords[j];
    const c2 = coords[(j + 1) % len];
    const x1 = c1.lng * kx;
    const y1 = c1.lat * ky;
    const x2 = c2.lng * kx;
    const y2 = c2.lat * ky;
    area += (x1 * y2 - x2 * y1);
  }
  return Math.abs(area / 2.0);
}

/**
 * Parsea un texto KML y extrae los puntos geográficos y metadatos
 */
export const parseKmlString = (kmlText, defaultName = 'KML Importado') => {
  try {
    // 1. Extraer nombre si existe
    const nameMatch = kmlText.match(/<name[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/name>/i);
    const parsedName = nameMatch && nameMatch[1] ? nameMatch[1].trim() : defaultName;

    // 2. Extraer descripción si existe
    const descMatch = kmlText.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    let parsedNotes = descMatch && descMatch[1] ? descMatch[1].replace(/<[^>]+>/g, ' ').trim() : '';

    // 3. Detectar si contiene Polygon o LineString
    const isPolygon = /<Polygon[\s>]/i.test(kmlText);

    // 4. Extraer el bloque de coordenadas
    const coordsMatch = kmlText.match(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i);
    if (!coordsMatch || !coordsMatch[1]) {
      throw new Error('No se encontraron coordenadas en el archivo KML.');
    }

    const rawCoords = coordsMatch[1].trim().split(/\s+/);
    const points = [];

    for (const tuple of rawCoords) {
      const parts = tuple.split(',').map(Number);
      if (parts.length >= 2) {
        const lon = parts[0];
        const lat = parts[1];
        if (!isNaN(lat) && !isNaN(lon)) {
          // Evitar añadir el último punto duplicado si cierra el polígono
          if (points.length > 0 && isPolygon) {
            const first = points[0];
            if (Math.abs(first.lat - lat) < 0.000001 && Math.abs(first.lng - lon) < 0.000001) {
              continue;
            }
          }
          points.push({ lat, lng: lon });
        }
      }
    }

    if (points.length === 0) {
      throw new Error('No se pudieron extraer vértices válidos del archivo KML.');
    }

    // Calcular estadísticas
    let distance = 0;
    let perimeter = 0;
    let area = 0;

    if (isPolygon && points.length >= 3) {
      area = calculatePolygonArea(points);
      for (let i = 0; i < points.length; i++) {
        const next = points[(i + 1) % points.length];
        perimeter += calculateDistance(points[i].lat, points[i].lng, next.lat, next.lng);
      }
      distance = perimeter;
    } else {
      for (let i = 0; i < points.length - 1; i++) {
        distance += calculateDistance(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
      }
    }

    return {
      success: true,
      name: parsedName,
      mode: isPolygon ? 'area' : 'distance',
      points,
      stats: {
        distance,
        area,
        perimeter: isPolygon ? perimeter : distance,
        pointsCount: points.length
      },
      notes: parsedNotes
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Error al procesar el archivo KML'
    };
  }
};

/**
 * Abre el selector de documentos para importar un archivo KML
 */
export const importKmlFile = async () => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['*/*', 'application/vnd.google-earth.kml+xml', 'text/xml', 'application/xml'],
      copyToCacheDirectory: true
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const file = result.assets[0];
    const fileUri = file.uri;
    const fileName = file.name || 'archivo.kml';

    const kmlContent = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8
    });

    const parsed = parseKmlString(kmlContent, fileName.replace(/\.kml$/i, ''));
    if (!parsed.success) {
      Alert.alert('Error al importar KML', parsed.error);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('Error importando KML:', error);
    Alert.alert('Error al importar KML', error.message || error.toString());
    return null;
  }
};
