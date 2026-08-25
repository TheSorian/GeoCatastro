import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';
import { getFavorites, saveFavoritesList } from './favoritesStorage';
import { getSavedMeasurements, saveMeasurementsList } from './measurementsStorage';

/**
 * Exporta una copia de seguridad UNIFICADA de toda la app (Favoritos + Mediciones)
 * en un único archivo JSON compartible.
 */
export const exportUnifiedBackup = async () => {
  try {
    const favorites = await getFavorites();
    const measurements = await getSavedMeasurements();

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    const backupPayload = {
      app: 'GeoCatastro',
      backupVersion: '1.0',
      exportedAt: now.toISOString(),
      summary: {
        totalFavorites: favorites.length,
        totalMeasurements: measurements.length
      },
      data: {
        favorites: favorites || [],
        measurements: measurements || []
      }
    };

    const jsonContent = JSON.stringify(backupPayload, null, 2);
    const fileName = `GeoCatastro_CopiaSeguridad_${dateStr}.json`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, jsonContent, {
      encoding: FileSystem.EncodingType.UTF8
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/json',
        dialogTitle: 'Exportar Copia de Seguridad de GeoCatastro',
        UTI: 'public.json'
      });
      return { success: true, countFavorites: favorites.length, countMeasurements: measurements.length };
    } else {
      Alert.alert('Exportado', `Copia guardada en el dispositivo: ${fileName}`);
      return { success: true };
    }
  } catch (error) {
    Alert.alert('Error', 'No se pudo generar la copia de seguridad: ' + (error.message || error.toString()));
    return { success: false, error };
  }
};

/**
 * Importa y restaura una copia de seguridad UNIFICADA desde un archivo JSON.
 * Fusiona los datos con los existentes sin duplicar referencias ni IDs.
 */
export const restoreUnifiedBackup = async () => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/json', '*/*'],
      copyToCacheDirectory: true
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { canceled: true };
    }

    const file = result.assets[0];
    const jsonStr = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.UTF8
    });

    let backupData;
    try {
      backupData = JSON.parse(jsonStr);
    } catch (e) {
      Alert.alert('Archivo no válido', 'El archivo seleccionado no contiene un formato JSON válido.');
      return { success: false };
    }

    // Validación básica del formato de GeoCatastro
    const favsToRestore = backupData?.data?.favorites || (Array.isArray(backupData?.favorites) ? backupData.favorites : []);
    const measToRestore = backupData?.data?.measurements || (Array.isArray(backupData?.measurements) ? backupData.measurements : []);

    if (favsToRestore.length === 0 && measToRestore.length === 0) {
      Alert.alert('Copia vacía o incompatible', 'No se encontraron fincas favoritas ni mediciones en el archivo.');
      return { success: false };
    }

    // 1. Restaurar / Fusionar Favoritos
    const currentFavs = await getFavorites();
    const favMap = new Map();
    // Insertar actuales
    currentFavs.forEach(f => {
      const key = f.ref || f.id;
      if (key) favMap.set(key, f);
    });
    // Fusionar nuevos (los importados sobrescriben o añaden)
    let addedFavs = 0;
    favsToRestore.forEach(f => {
      const key = f.ref || f.id;
      if (key) {
        if (!favMap.has(key)) addedFavs++;
        favMap.set(key, { ...favMap.get(key), ...f });
      }
    });
    await saveFavoritesList(Array.from(favMap.values()));

    // 2. Restaurar / Fusionar Mediciones
    const currentMeas = await getSavedMeasurements();
    const measMap = new Map();
    // Insertar actuales
    currentMeas.forEach(m => {
      if (m.id) measMap.set(m.id, m);
    });
    // Fusionar nuevas
    let addedMeas = 0;
    measToRestore.forEach(m => {
      const key = m.id || `meas_${Date.now()}_${Math.random()}`;
      if (!measMap.has(key)) addedMeas++;
      measMap.set(key, { ...m, id: key });
    });
    await saveMeasurementsList(Array.from(measMap.values()));

    return {
      success: true,
      restoredFavorites: favsToRestore.length,
      restoredMeasurements: measToRestore.length,
      totalFavoritesNow: favMap.size,
      totalMeasurementsNow: measMap.size
    };
  } catch (error) {
    Alert.alert('Error', 'Fallo al restaurar la copia de seguridad: ' + (error.message || error.toString()));
    return { success: false, error };
  }
};
