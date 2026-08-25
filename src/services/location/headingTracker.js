import * as Location from 'expo-location';

class HeadingTracker {
  constructor() {
    this.positionSubscription = null;
    this.headingSubscription = null;
    this.currentPosition = null;
    this.currentHeading = 0;
    this.listeners = new Set();
    this.isTracking = false;
  }

  /**
   * Solicita permisos de ubicación
   */
  async requestPermissions() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  }

  /**
   * Obtiene la posición actual única
   */
  async getCurrentPosition() {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) throw new Error('Permiso de ubicación no concedido');

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High
    });
    if (loc?.coords) {
      this.currentPosition = loc.coords;
      if (loc.coords.heading !== undefined && loc.coords.heading !== null && loc.coords.heading >= 0) {
        this.currentHeading = loc.coords.heading;
      }
    }
    return loc?.coords;
  }

  /**
   * Inicia el seguimiento en vivo de ubicación y rumbo
   */
  async startTracking(callback) {
    if (callback) this.listeners.add(callback);
    if (this.isTracking) {
      if (this.currentPosition) this._notify();
      return;
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return;

    this.isTracking = true;

    // Notificar posición inicial de inmediato
    this.getCurrentPosition()
      .then((coords) => {
        if (coords) {
          this.currentPosition = coords;
          this._notify();
        }
      })
      .catch(() => {});

    try {
      // 1. Suscripción a cambios de posición
      this.positionSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1000,
          distanceInterval: 1
        },
        (loc) => {
          if (loc?.coords) {
            this.currentPosition = loc.coords;
            if (loc.coords.heading !== undefined && loc.coords.heading !== null && loc.coords.heading >= 0) {
              this.currentHeading = loc.coords.heading;
            }
            this._notify();
          }
        }
      );

      // 2. Suscripción al magnetómetro/brújula para rumbo en tiempo real
      this.headingSubscription = await Location.watchHeadingAsync((headingData) => {
        if (headingData) {
          const headingVal = headingData.trueHeading >= 0 ? headingData.trueHeading : headingData.magHeading;
          if (headingVal !== undefined && headingVal !== null && !isNaN(headingVal)) {
            this.currentHeading = headingVal;
            this._notify();
          }
        }
      });
    } catch (e) {
      console.warn('Error iniciando seguimiento de ubicación/brújula:', e);
    }
  }

  /**
   * Detiene el seguimiento
   */
  stopTracking(callback) {
    if (callback) this.listeners.delete(callback);
    if (this.listeners.size === 0) {
      if (this.positionSubscription) {
        this.positionSubscription.remove();
        this.positionSubscription = null;
      }
      if (this.headingSubscription) {
        this.headingSubscription.remove();
        this.headingSubscription = null;
      }
      this.isTracking = false;
    }
  }

  _notify() {
    if (!this.currentPosition) return;
    const payload = {
      lat: this.currentPosition.latitude,
      lon: this.currentPosition.longitude,
      heading: this.currentHeading,
      accuracy: this.currentPosition.accuracy
    };
    this.listeners.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {}
    });
  }
}

export const headingTracker = new HeadingTracker();
