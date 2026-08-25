import AsyncStorage from '@react-native-async-storage/async-storage';

const MEASUREMENTS_STORAGE_KEY = '@catastro_saved_measurements_v1';

/**
 * Obtiene todas las mediciones guardadas
 */
export const getSavedMeasurements = async () => {
  try {
    const raw = await AsyncStorage.getItem(MEASUREMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Error cargando mediciones guardadas:', e);
    return [];
  }
};

/**
 * Guarda una nueva medición
 * @param {Object} data { mode: 'distance'|'area', points: Array<{lat, lng}>, stats: { distance, area, perimeter, pointsCount }, name: string, notes: string }
 */
export const saveMeasurement = async (data, customName = '', notes = '') => {
  try {
    const current = await getSavedMeasurements();
    const id = data.id || `meas_${Date.now()}`;

    const defaultTitle = data.mode === 'area'
      ? `Área: ${(data.stats?.area || 0) >= 10000 ? ((data.stats?.area || 0) / 10000).toFixed(2) + ' ha' : Math.round(data.stats?.area || 0) + ' m²'}`
      : `Distancia: ${(data.stats?.distance || 0) >= 1000 ? ((data.stats?.distance || 0) / 1000).toFixed(2) + ' km' : (data.stats?.distance || 0).toFixed(1) + ' m'}`;

    const measurementItem = {
      id,
      name: (customName || '').trim() || defaultTitle,
      mode: data.mode || (data.stats?.area > 0 ? 'area' : 'distance'),
      points: data.points || [],
      stats: {
        distance: data.stats?.distance || 0,
        area: data.stats?.area || 0,
        perimeter: data.stats?.perimeter || 0,
        pointsCount: data.points?.length || data.stats?.pointsCount || 0
      },
      notes: (notes || '').trim(),
      createdAt: data.createdAt || new Date().toISOString()
    };

    const existingIndex = current.findIndex(item => item.id === id);
    let updated;
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = { ...updated[existingIndex], ...measurementItem };
    } else {
      updated = [measurementItem, ...current];
    }

    await AsyncStorage.setItem(MEASUREMENTS_STORAGE_KEY, JSON.stringify(updated));
    return measurementItem;
  } catch (e) {
    console.error('Error guardando medición:', e);
    throw e;
  }
};

/**
 * Elimina una medición guardada
 */
export const removeMeasurement = async (id) => {
  try {
    const current = await getSavedMeasurements();
    const updated = current.filter(item => item.id !== id);
    await AsyncStorage.setItem(MEASUREMENTS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Error eliminando medición:', e);
    throw e;
  }
};
