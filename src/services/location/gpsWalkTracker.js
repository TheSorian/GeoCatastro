import * as Location from 'expo-location';

class GpsWalkTracker {
  constructor() {
    this.subscription = null;
    this.isRecording = false;
    this.recordedPoints = [];
    this.listeners = new Set();
    this.totalDistanceMeters = 0;
  }

  /**
   * Calcula la distancia Haversine en metros entre dos coordenadas
   */
  _calcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radio de la Tierra en metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Inicia la grabación del recorrido GPS caminando
   */
  async startRecording(onPointAdded) {
    if (onPointAdded) this.listeners.add(onPointAdded);
    if (this.isRecording) return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Permiso de ubicación denegado');
    }

    this.isRecording = true;
    this.recordedPoints = [];
    this.totalDistanceMeters = 0;

    try {
      // 1. Obtener primer punto inicial si es posible
      const initialPos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation
      });

      if (initialPos?.coords && initialPos.coords.accuracy <= 10) {
        const firstPt = {
          lat: initialPos.coords.latitude,
          lon: initialPos.coords.longitude,
          accuracy: initialPos.coords.accuracy,
          timestamp: Date.now()
        };
        this.recordedPoints.push(firstPt);
        this._notify(firstPt);
      }

      // 2. Suscribirse a stream de alta precisión
      this.subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 2
        },
        (location) => {
          if (!this.isRecording || !location?.coords) return;
          const { latitude: lat, longitude: lon, accuracy } = location.coords;

          // Filtro 1: Descartar lecturas con mala precisión satelital (> 8 metros)
          if (accuracy && accuracy > 8) return;

          // Filtro 2: Descartar lecturas estáticas (si no nos hemos movido al menos 3.5 metros del último punto)
          if (this.recordedPoints.length > 0) {
            const lastPt = this.recordedPoints[this.recordedPoints.length - 1];
            const dist = this._calcDistance(lastPt.lat, lastPt.lon, lat, lon);
            if (dist < 3.5) return;

            this.totalDistanceMeters += dist;
          }

          const newPt = { lat, lon, accuracy, timestamp: Date.now() };
          this.recordedPoints.push(newPt);
          this._notify(newPt);
        }
      );
    } catch (e) {
      console.warn('Error iniciando grabación de caminata GPS:', e);
      this.stopRecording();
      throw e;
    }
  }

  /**
   * Detiene la grabación del recorrido
   */
  stopRecording(onPointAdded) {
    if (onPointAdded) this.listeners.delete(onPointAdded);
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
    this.isRecording = false;
    return [...this.recordedPoints];
  }

  /**
   * Limpia los puntos grabados
   */
  clear() {
    this.recordedPoints = [];
    this.totalDistanceMeters = 0;
  }

  getPoints() {
    return [...this.recordedPoints];
  }

  _notify(point) {
    const payload = {
      point,
      totalPoints: this.recordedPoints.length,
      points: [...this.recordedPoints],
      totalDistanceMeters: Math.round(this.totalDistanceMeters)
    };
    this.listeners.forEach(fn => {
      try {
        fn(payload);
      } catch (e) {}
    });
  }
}

export const gpsWalkTracker = new GpsWalkTracker();
