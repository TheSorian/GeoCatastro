import AsyncStorage from '@react-native-async-storage/async-storage';

const FAVORITES_STORAGE_KEY = '@catastro_favorites_v1';

/**
 * Obtiene todas las parcelas favoritas guardadas
 */
export const getFavorites = async () => {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Error cargando favoritos:', e);
    return [];
  }
};

/**
 * Guarda directamente una lista completa de favoritos (útil para restaurar backups)
 */
export const saveFavoritesList = async (list) => {
  try {
    await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(list || []));
    return list;
  } catch (e) {
    console.error('Error guardando lista de favoritos:', e);
    throw e;
  }
};

/**
 * Guarda o actualiza una parcela en favoritos con fotos opcionales
 */
export const saveFavorite = async (parcel, customName = '', notes = '', photos = []) => {
  try {
    const current = await getFavorites();
    const cleanRef = String(parcel.ref20 || parcel.refCat || parcel.id || '').trim();
    const id = cleanRef || `fav_${Date.now()}`;

    const existingIndex = current.findIndex(item => item.id === id || item.refCat === parcel.refCat);

    const favoriteItem = {
      id,
      refCat: parcel.refCat || cleanRef,
      ref20: parcel.ref20 || cleanRef,
      address: parcel.address || 'Ubicación Catastral',
      customName: (customName || '').trim() || parcel.address || 'Parcela Guardada',
      notes: (notes || '').trim(),
      photos: Array.isArray(photos) ? photos : [],
      lat: parcel.lat,
      lon: parcel.lon,
      region: parcel.region || 'ES',
      count: parcel.count || 1,
      del: parcel.del || '',
      mun: parcel.mun || '',
      polCode: parcel.polCode || '',
      parCode: parcel.parCode || '',
      subareaCode: parcel.subareaCode || '',
      savedAt: new Date().toISOString()
    };

    let updated;
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = { ...updated[existingIndex], ...favoriteItem };
    } else {
      updated = [favoriteItem, ...current];
    }

    await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(updated));
    return favoriteItem;
  } catch (e) {
    console.error('Error guardando favorito:', e);
    throw e;
  }
};

/**
 * Elimina una parcela de favoritos
 */
export const removeFavorite = async (id) => {
  try {
    const current = await getFavorites();
    const updated = current.filter(item => item.id !== id && item.refCat !== id);
    await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Error eliminando favorito:', e);
    throw e;
  }
};

/**
 * Comprueba si una referencia está guardada en favoritos
 */
export const isFavorite = async (refCat) => {
  if (!refCat) return false;
  try {
    const current = await getFavorites();
    const clean = String(refCat).trim();
    return current.some(item => item.id === clean || item.refCat === clean || item.ref20 === clean);
  } catch (e) {
    return false;
  }
};
