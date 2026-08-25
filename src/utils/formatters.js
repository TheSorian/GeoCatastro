/**
 * Formatea una distancia en metros o kilómetros
 */
export const formatDistance = (meters) => {
  if (!meters || meters === 0) return '0 m';
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  if (meters < 10) {
    return `${meters.toFixed(2)} m`;
  }
  return `${meters.toFixed(1)} m`;
};

/**
 * Formatea un área en m² o hectáreas
 */
export const formatArea = (sqMeters) => {
  if (!sqMeters || sqMeters === 0) return '0 m²';
  if (sqMeters >= 10000) {
    const ha = (sqMeters / 10000).toFixed(2);
    return `${ha} ha (${Math.round(sqMeters).toLocaleString('es-ES')} m²)`;
  }
  if (sqMeters < 100) {
    return `${sqMeters.toFixed(1)} m²`;
  }
  return `${Math.round(sqMeters).toLocaleString('es-ES')} m²`;
};

/**
 * Formatea una fecha ISO para visualización en español
 */
export const formatDate = (isoString) => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return isoString;
  }
};

/**
 * Limpia y estandariza una Referencia Catastral
 */
export const cleanRefCat = (ref) => {
  if (!ref) return '';
  return String(ref).trim().toUpperCase();
};
