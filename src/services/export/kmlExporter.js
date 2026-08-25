import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { formatArea, formatDistance } from '../../utils/formatters';

/**
 * Genera el contenido XML de un archivo KML 2.2 a partir de una medición o polígono
 */
export const generateKmlString = (measurement) => {
  const { name = 'Medición GeoCatastro', mode = 'area', points = [], stats = {}, notes = '' } = measurement;
  const isPolygon = mode === 'area' && points.length >= 3;

  const escapeXml = (unsafe) => {
    return String(unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  let coordinatesStr = '';
  points.forEach((pt) => {
    const lat = Array.isArray(pt) ? pt[0] : (pt.lat !== undefined ? pt.lat : pt.latitude);
    const lon = Array.isArray(pt) ? pt[1] : (pt.lng !== undefined ? pt.lng : (pt.lon !== undefined ? pt.lon : pt.longitude));
    if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
      coordinatesStr += `${lon},${lat},0 `;
    }
  });

  // Cerrar el polígono si es área repitiendo el primer vértice
  if (isPolygon && points.length > 0) {
    const first = points[0];
    const fLat = Array.isArray(first) ? first[0] : (first.lat !== undefined ? first.lat : first.latitude);
    const fLon = Array.isArray(first) ? first[1] : (first.lng !== undefined ? first.lng : (first.lon !== undefined ? first.lon : first.longitude));
    coordinatesStr += `${fLon},${fLat},0`;
  }

  const descLines = [];
  if (notes) descLines.push(`Notas: ${escapeXml(notes)}`);
  if (isPolygon) {
    descLines.push(`Área: ${formatArea(stats.area || 0)}`);
    descLines.push(`Perímetro: ${formatDistance(stats.perimeter || 0)}`);
  } else {
    descLines.push(`Distancia: ${formatDistance(stats.distance || 0)}`);
  }
  descLines.push(`Vértices: ${points.length}`);
  descLines.push(`Generado por: GeoCatastro App`);

  const description = descLines.join('<br/>');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(name)}</name>
    <description>${escapeXml(notes)}</description>
    <Style id="polyStyle">
      <LineStyle>
        <color>ffcc6600</color>
        <width>3</width>
      </LineStyle>
      <PolyStyle>
        <color>66ff9900</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Style id="lineStyle">
      <LineStyle>
        <color>ff3339e6</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>${escapeXml(name)}</name>
      <description><![CDATA[${description}]]></description>
      <styleUrl>${isPolygon ? '#polyStyle' : '#lineStyle'}</styleUrl>
      ${isPolygon ? `
      <Polygon>
        <extrude>1</extrude>
        <altitudeMode>clampToGround</altitudeMode>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordinatesStr.trim()}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>` : `
      <LineString>
        <extrude>1</extrude>
        <altitudeMode>clampToGround</altitudeMode>
        <coordinates>${coordinatesStr.trim()}</coordinates>
      </LineString>`}
    </Placemark>
  </Document>
</kml>`;
};

/**
 * Exporta y comparte una medición como archivo KML
 */
export const exportMeasurementToKml = async (measurement) => {
  try {
    if (!measurement?.points || measurement.points.length === 0) {
      Alert.alert('Aviso', 'No hay puntos en la medición para exportar.');
      return false;
    }

    const kmlContent = generateKmlString(measurement);
    const safeTitle = (measurement.name || 'Medicion_GeoCatastro')
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .substring(0, 30);
    const fileName = `${safeTitle}_${Date.now()}.kml`;
    const fileUri = FileSystem.cacheDirectory + fileName;

    await FileSystem.writeAsStringAsync(fileUri, kmlContent, {
      encoding: FileSystem.EncodingType.UTF8
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.google-earth.kml+xml',
        dialogTitle: 'Exportar Medición a KML (Google Earth, QGIS)'
      });
      return true;
    } else {
      Alert.alert('Error', 'La función de compartir archivos no está disponible en este dispositivo.');
      return false;
    }
  } catch (error) {
    console.error('Error exportando KML:', error);
    Alert.alert('Error', 'No se pudo generar el archivo KML: ' + (error.message || error.toString()));
    return false;
  }
};
