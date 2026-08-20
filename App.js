import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Text,
  Alert,
  Keyboard,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Clipboard,
  Dimensions,
  Animated,
  PanResponder,
  Modal,
  Switch,
  Linking
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import * as Location from 'expo-location';
import { cadastreService } from './services/cadastre/CadastreService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import appConfig from './app.json';

SplashScreen.preventAutoHideAsync().catch(() => {});

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORAGE_KEY = '@catastro_recent_searches_v1';

export default function App() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [showRecent, setShowRecent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [parcelDetails, setParcelDetails] = useState(null);
  const [subparcels, setSubparcels] = useState([]);
  const [showSubparcels, setShowSubparcels] = useState(false);
  const [selectedSubparcel, setSelectedSubparcel] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState('ES');
  const [subparcelFilter, setSubparcelFilter] = useState('');

  // Estados del Gestor de Capas
  const [showLayersModal, setShowLayersModal] = useState(false);
  const [activeBaseLayer, setActiveBaseLayer] = useState('osm'); // 'osm' | 'ign_base' | 'ign_pnoa' | 'esri_sat'
  const [catastroVisible, setCatastroVisible] = useState(true);
  const [catastroOpacity, setCatastroOpacity] = useState(0.85);
  const [ignLabelsVisible, setIgnLabelsVisible] = useState(false);

  // Estados de la Herramienta de Medición
  const [measureMode, setMeasureMode] = useState(null); // null | 'distance' | 'area'
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [measureStats, setMeasureStats] = useState({
    distance: 0,
    area: 0,
    perimeter: 0,
    pointsCount: 0,
    snapped: false
  });

  const webViewRef = useRef(null);
  const typingTimer = useRef(null);

  // Animaciones y Gestos del Panel Desplazable (Bottom Sheet)
  const PANEL_HEIGHT = SCREEN_HEIGHT * 0.75;
  const COLLAPSED_Y = SCREEN_HEIGHT * 0.45;
  const EXPANDED_Y = 0;
  const DISMISSED_Y = SCREEN_HEIGHT * 0.85;

  const cardAnimY = useRef(new Animated.Value(COLLAPSED_Y)).current;
  const isExpandedRef = useRef(false);

  const resetCardPosition = () => {
    isExpandedRef.current = false;
    setShowSubparcels(false);
    Animated.spring(cardAnimY, {
      toValue: COLLAPSED_Y,
      useNativeDriver: true,
      bounciness: 3
    }).start();
  };

  const expandCard = () => {
    isExpandedRef.current = true;
    setShowSubparcels(true);
    Animated.spring(cardAnimY, {
      toValue: EXPANDED_Y,
      useNativeDriver: true,
      bounciness: 3
    }).start();
  };

  const dismissCard = () => {
    Animated.timing(cardAnimY, {
      toValue: DISMISSED_Y,
      duration: 200,
      useNativeDriver: true
    }).start(() => {
      setParcelDetails(null);
      setShowSubparcels(false);
      isExpandedRef.current = false;
      cardAnimY.setValue(COLLAPSED_Y);
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        const startY = isExpandedRef.current ? EXPANDED_Y : COLLAPSED_Y;
        let newY = startY + gestureState.dy;
        if (newY < -20) newY = -20;
        cardAnimY.setValue(newY);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (!isExpandedRef.current) {
          if (gestureState.dy < -50) {
            expandCard();
          } else if (gestureState.dy > 80) {
            dismissCard();
          } else {
            resetCardPosition();
          }
        } else {
          if (gestureState.dy > 180) {
            dismissCard();
          } else if (gestureState.dy > 50) {
            resetCardPosition();
          } else {
            expandCard();
          }
        }
      }
    })
  ).current;

  const CURRENT_VERSION = appConfig.expo.version;

  // Cargar búsquedas recientes, comprobar actualizaciones y obtener ubicación inicial
  useEffect(() => {
    loadRecentSearches();
    checkAppUpdate();
    getUserLocation(true);
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const getUserLocation = async (isInitial = false) => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!isInitial) {
          Alert.alert(
            'Permiso Denegado',
            'Necesitamos permiso de ubicación para situarte en el mapa y cargar el catastro correspondiente.'
          );
        }
        return;
      }

      setLoading(true);
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      if (loc && loc.coords) {
        const { latitude: lat, longitude: lon } = loc.coords;
        const region = cadastreService.detectRegionFromCoords(lat, lon);

        if (region !== selectedRegion) {
          setSelectedRegion(region);
          webViewRef.current?.postMessage(JSON.stringify({
            type: 'CHANGE_REGION',
            wmsUrl: cadastreService.getWMSUrl(region),
            wmsLayers: cadastreService.getWMSLayers(region)
          }));
        }

        webViewRef.current?.postMessage(JSON.stringify({
          type: 'MOVE_TO',
          lat,
          lon
        }));

        if (!measureMode) {
          await fetchParcelByCoords(lat, lon, region);
        }
      }
    } catch (e) {
      if (!isInitial) {
        Alert.alert('Error de ubicación', 'No se pudo obtener la ubicación actual.');
      }
    } finally {
      setLoading(false);
    }
  };

  const checkAppUpdate = async () => {
    try {
      const response = await fetch('https://api.github.com/repos/TheSorian/GeoCatastro/releases/latest');
      if (!response.ok) return;

      const data = await response.json();
      const latestTag = data?.tag_name || '';
      const cleanLatest = latestTag.replace(/^v/, '').trim();

      if (cleanLatest && isVersionNewer(CURRENT_VERSION, cleanLatest)) {
        const downloadUrl = data?.assets?.[0]?.browser_download_url || data?.html_url;

        Alert.alert(
          '🚀 Nueva Actualización Disponible',
          `Existe una nueva versión de GeoCatastro (${latestTag}). ¿Deseas descargar e instalar la actualización ahora?`,
          [
            { text: 'Más tarde', style: 'cancel' },
            {
              text: '📲 Actualizar Ahora',
              onPress: async () => {
                try {
                  if (downloadUrl) {
                    await Linking.openURL(downloadUrl);
                  } else if (data?.html_url) {
                    await Linking.openURL(data.html_url);
                  }
                } catch (err) {
                  if (data?.html_url) {
                    await Linking.openURL(data.html_url);
                  }
                }
              }
            }
          ]
        );
      }
    } catch (e) {}
  };

  const isVersionNewer = (current, latest) => {
    const pCurrent = current.split('.').map(Number);
    const pLatest = latest.split('.').map(Number);
    for (let i = 0; i < Math.max(pCurrent.length, pLatest.length); i++) {
      const c = pCurrent[i] || 0;
      const l = pLatest[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  };

  const loadRecentSearches = async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        setRecentSearches(JSON.parse(data));
      }
    } catch (e) {}
  };

  const saveRecentSearch = async (text) => {
    if (!text || text.trim().length < 3) return;
    const clean = text.trim();
    try {
      let current = [...recentSearches];
      current = current.filter(item => item.toLowerCase() !== clean.toLowerCase());
      current.unshift(clean);
      if (current.length > 8) current = current.slice(0, 8);
      setRecentSearches(current);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (e) {}
  };

  const removeRecentSearch = async (textToRemove) => {
    try {
      const current = recentSearches.filter(item => item !== textToRemove);
      setRecentSearches(current);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (e) {}
  };

  const clearAllRecent = async () => {
    try {
      setRecentSearches([]);
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  };

  // --- Funciones de Gestión de Capas ---
  const handleSelectBaseLayer = (layerKey) => {
    setActiveBaseLayer(layerKey);
    webViewRef.current?.postMessage(JSON.stringify({
      type: 'SET_BASE_LAYER',
      layer: layerKey
    }));
  };

  const handleToggleCatastro = (value) => {
    setCatastroVisible(value);
    webViewRef.current?.postMessage(JSON.stringify({
      type: 'SET_CATASTRO_VISIBILITY',
      visible: value
    }));
  };

  const handleSetCatastroOpacity = (opacityVal) => {
    setCatastroOpacity(opacityVal);
    webViewRef.current?.postMessage(JSON.stringify({
      type: 'SET_CATASTRO_OPACITY',
      opacity: opacityVal
    }));
  };

  const handleToggleIgnLabels = (value) => {
    setIgnLabelsVisible(value);
    webViewRef.current?.postMessage(JSON.stringify({
      type: 'SET_IGN_LABELS_VISIBILITY',
      visible: value
    }));
  };

  // --- Funciones de Medición ---
  const startMeasureMode = (mode) => {
    setParcelDetails(null);
    setMeasureMode(mode);
    setMeasureStats({ distance: 0, area: 0, perimeter: 0, pointsCount: 0, snapped: false });
    webViewRef.current?.postMessage(JSON.stringify({
      type: 'SET_MEASURE_MODE',
      mode: mode
    }));
  };

  const exitMeasureMode = () => {
    setMeasureMode(null);
    setMeasureStats({ distance: 0, area: 0, perimeter: 0, pointsCount: 0, snapped: false });
    webViewRef.current?.postMessage(JSON.stringify({
      type: 'SET_MEASURE_MODE',
      mode: null
    }));
  };

  const toggleSnap = () => {
    const nextVal = !snapEnabled;
    setSnapEnabled(nextVal);
    webViewRef.current?.postMessage(JSON.stringify({
      type: 'SET_SNAP_ENABLED',
      enabled: nextVal
    }));
  };

  const undoMeasurePoint = () => {
    webViewRef.current?.postMessage(JSON.stringify({
      type: 'MEASURE_UNDO'
    }));
  };

  const clearMeasurePoints = () => {
    setMeasureStats({ distance: 0, area: 0, perimeter: 0, pointsCount: 0, snapped: false });
    webViewRef.current?.postMessage(JSON.stringify({
      type: 'MEASURE_CLEAR'
    }));
  };

  const formatDistance = (meters) => {
    if (!meters || meters === 0) return '0 m';
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${meters.toFixed(1)} m`;
  };

  const formatArea = (sqMeters) => {
    if (!sqMeters || sqMeters === 0) return '0 m²';
    if (sqMeters >= 10000) {
      const ha = (sqMeters / 10000).toFixed(2);
      return `${ha} ha (${Math.round(sqMeters).toLocaleString('es-ES')} m²)`;
    }
    return `${Math.round(sqMeters).toLocaleString('es-ES')} m²`;
  };

  // HTML del visor Leaflet con Capas IGN, Esri, Medición y WMS Catastro
  const leafletHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body, html, #map { width: 100%; height: 100%; margin: 0; padding: 0; background-color: #e5e3df; }
        .leaflet-control-attribution { font-size: 8px; background: rgba(255,255,255,0.7) !important; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { 
          zoomControl: false, 
          maxZoom: 24, 
          minZoom: 5 
        }).setView([40.4168, -3.7038], 16);
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        // --- Definición de Capas Base con Sobremuestreo Suave hasta Zoom 24 ---
        var baseLayers = {
          'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxNativeZoom: 19,
            maxZoom: 24,
            attribution: '© OpenStreetMap'
          }),
          'ign_base': L.tileLayer('https://www.ign.es/wmts/ign-base?service=WMTS&request=GetTile&version=1.0.0&layer=IGNBaseTodo&style=default&format=image/jpeg&TileMatrixSet=EPSG:3857&TileMatrix={z}&TileRow={y}&TileCol={x}', {
            maxNativeZoom: 19,
            maxZoom: 24,
            attribution: '© IGN España'
          }),
          'ign_pnoa': L.tileLayer('https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&layer=OI.OrthoimageCoverage&style=default&format=image/jpeg&TileMatrixSet=EPSG:3857&TileMatrix={z}&TileRow={y}&TileCol={x}', {
            maxNativeZoom: 20,
            maxZoom: 24,
            attribution: '© IGN - PNOA'
          }),
          'esri_sat': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxNativeZoom: 19,
            maxZoom: 24,
            attribution: '© Esri Satellite'
          })
        };

        var currentBaseKey = 'osm';
        baseLayers[currentBaseKey].addTo(map);

        // Capa de Rotulación IGN (Toponimia / Calles)
        var ignLabelsLayer = L.tileLayer('https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&layer=Rotulacion&style=default&format=image/png&TileMatrixSet=EPSG:3857&TileMatrix={z}&TileRow={y}&TileCol={x}', {
          maxNativeZoom: 20,
          maxZoom: 24,
          transparent: true
        });

        // --- Capa WMS Catastral Unificada (Nacional / Navarra) ---
        var currentWMSUrl = 'https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx';
        var currentWMSLayers = 'catastro';
        var catastroVisible = true;
        var catastroOpacity = 0.85;

        var catastroWMS = L.tileLayer.wms(currentWMSUrl, {
          layers: currentWMSLayers,
          format: 'image/png',
          transparent: true,
          version: '1.1.1',
          maxZoom: 24,
          opacity: catastroOpacity
        }).addTo(map);

        function refreshCatastroLayer() {
          if (catastroWMS) map.removeLayer(catastroWMS);
          if (catastroVisible) {
            catastroWMS = L.tileLayer.wms(currentWMSUrl, {
              layers: currentWMSLayers,
              format: 'image/png',
              transparent: true,
              version: '1.1.1',
              maxZoom: 24,
              opacity: catastroOpacity
            }).addTo(map);
          }
        }

        var currentMarker = null;

        // --- Sistema de Medición y Ajuste Magnético (Snapping) ---
        var measureMode = null; // null | 'distance' | 'area'
        var snapEnabled = true;
        var cachedParcelVertices = []; // Array of L.latLng
        var measurePoints = [];
        var measureMarkers = [];
        var measureLineOrPolygon = null;

        function addCachedVertices(verts) {
          if (!Array.isArray(verts)) return;
          var addedCount = 0;
          for (var i = 0; i < verts.length; i++) {
            var v = verts[i];
            var lat = Array.isArray(v) ? v[0] : (v.lat || v.latitude);
            var lon = Array.isArray(v) ? v[1] : (v.lng || v.lon || v.longitude);
            if (typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon)) {
              var ll = L.latLng(lat, lon);
              var exists = false;
              for (var j = 0; j < cachedParcelVertices.length; j++) {
                if (cachedParcelVertices[j].distanceTo(ll) < 0.25) {
                  exists = true;
                  break;
                }
              }
              if (!exists) {
                cachedParcelVertices.push(ll);
                addedCount++;
              }
            }
          }

          // Auto-ajuste inmediato del último punto si se acaba de recibir su geometría
          if (addedCount > 0 && measurePoints.length > 0 && snapEnabled) {
            var lastIdx = measurePoints.length - 1;
            var lastPt = measurePoints[lastIdx];
            var nearest = findNearestVertex(lastPt, 35);
            if (nearest && (nearest.lat !== lastPt.lat || nearest.lng !== lastPt.lng)) {
              measurePoints[lastIdx] = nearest;
              triggerSnapVisual(nearest);
              updateMeasureGraphics(true);
            }
          }
        }

        function findNearestVertex(clickLatLng, tolerancePixels) {
          if (!snapEnabled || cachedParcelVertices.length === 0) return null;
          var clickPt = map.latLngToContainerPoint(clickLatLng);
          var bestVertex = null;
          var minPixelDist = Infinity;
          var tol = tolerancePixels || 35;

          for (var i = 0; i < cachedParcelVertices.length; i++) {
            var vLL = cachedParcelVertices[i];
            var vPt = map.latLngToContainerPoint(vLL);
            var dPix = clickPt.distanceTo(vPt);
            var dMeters = clickLatLng.distanceTo(vLL);

            if (dPix <= tol && dMeters <= 50) {
              if (dPix < minPixelDist) {
                minPixelDist = dPix;
                bestVertex = vLL;
              }
            }
          }
          return bestVertex;
        }

        function triggerSnapVisual(latlng) {
          var snapRing = L.circleMarker(latlng, {
            radius: 14,
            color: '#10b981',
            weight: 3,
            fillColor: '#34d399',
            fillOpacity: 0.6
          }).addTo(map);
          setTimeout(function() {
            try { map.removeLayer(snapRing); } catch(e) {}
          }, 800);
        }

        function computePolygonArea(latlngs) {
          if (!latlngs || latlngs.length < 3) return 0;
          var radius = 6378137; // Radio WGS84 en metros
          var area = 0;
          var len = latlngs.length;
          for (var i = 0; i < len; i++) {
            var p1 = latlngs[i];
            var p2 = latlngs[(i + 1) % len];
            var dLambda = (p2.lng - p1.lng) * Math.PI / 180;
            var phi1 = p1.lat * Math.PI / 180;
            var phi2 = p2.lat * Math.PI / 180;
            area += dLambda * (2 + Math.sin(phi1) + Math.sin(phi2));
          }
          area = Math.abs(area * radius * radius / 4.0);
          return area;
        }

        function updateMeasureGraphics(wasSnapped) {
          // Limpiar marcadores y trazados anteriores
          measureMarkers.forEach(function(m) { map.removeLayer(m); });
          measureMarkers = [];
          if (measureLineOrPolygon) {
            map.removeLayer(measureLineOrPolygon);
            measureLineOrPolygon = null;
          }

          if (measurePoints.length === 0) {
            notifyRNMeasureUpdate(0, 0, 0, 0, false);
            return;
          }

          var totalDistance = 0;
          var totalArea = 0;
          var totalPerimeter = 0;

          // Dibujar vértices
          for (var i = 0; i < measurePoints.length; i++) {
            var pt = measurePoints[i];
            var isLast = (i === measurePoints.length - 1);
            var marker = L.circleMarker([pt.lat, pt.lng], {
              radius: isLast ? 7 : 5,
              color: '#ffffff',
              weight: 2,
              fillColor: measureMode === 'distance' ? '#e63946' : '#0066cc',
              fillOpacity: 1
            }).addTo(map);
            measureMarkers.push(marker);
          }

          if (measureMode === 'distance') {
            for (var j = 0; j < measurePoints.length - 1; j++) {
              totalDistance += measurePoints[j].distanceTo(measurePoints[j + 1]);
            }
            if (measurePoints.length >= 2) {
              measureLineOrPolygon = L.polyline(measurePoints, {
                color: '#e63946',
                weight: 3.5,
                dashArray: '6, 6',
                opacity: 0.95
              }).addTo(map);
            }
            notifyRNMeasureUpdate(totalDistance, 0, 0, measurePoints.length, wasSnapped);
          } else if (measureMode === 'area') {
            if (measurePoints.length >= 3) {
              totalArea = computePolygonArea(measurePoints);
              for (var k = 0; k < measurePoints.length; k++) {
                totalPerimeter += measurePoints[k].distanceTo(measurePoints[(k + 1) % measurePoints.length]);
              }
              measureLineOrPolygon = L.polygon(measurePoints, {
                color: '#0066cc',
                weight: 2.5,
                fillColor: '#0066cc',
                fillOpacity: 0.3,
                dashArray: '4, 4'
              }).addTo(map);
            } else if (measurePoints.length === 2) {
              totalPerimeter = measurePoints[0].distanceTo(measurePoints[1]);
              measureLineOrPolygon = L.polyline(measurePoints, {
                color: '#0066cc',
                weight: 2.5,
                dashArray: '4, 4',
                opacity: 0.8
              }).addTo(map);
            }
            notifyRNMeasureUpdate(totalPerimeter, totalArea, totalPerimeter, measurePoints.length, wasSnapped);
          }
        }

        function notifyRNMeasureUpdate(dist, area, perim, count, snapped) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'MEASURE_UPDATE',
              distance: dist,
              area: area,
              perimeter: perim,
              pointsCount: count,
              snapped: !!snapped
            }));
          } catch(e) {}
        }

        function clearAllMeasure() {
          measurePoints = [];
          updateMeasureGraphics(false);
        }

        // --- Manejador de Mensajes desde React Native ---
        function handleRNMessage(event) {
          try {
            var rawData = event.data;
            var data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            
            if (data.type === 'CHANGE_REGION') {
              currentWMSUrl = data.wmsUrl;
              currentWMSLayers = data.wmsLayers;
              refreshCatastroLayer();
            } else if (data.type === 'MOVE_TO') {
              map.setView([data.lat, data.lon], Math.min(Math.max(map.getZoom(), 19), 24));
              if (currentMarker) map.removeLayer(currentMarker);
              currentMarker = L.marker([data.lat, data.lon]).addTo(map);
              if (data.ref && data.ref !== 'Sin edificio en el centro de la calle') {
                currentMarker.bindPopup('<b>Ref. Catastral:</b><br>' + data.ref).openPopup();
              }
            } else if (data.type === 'SET_BASE_LAYER') {
              if (baseLayers[currentBaseKey]) map.removeLayer(baseLayers[currentBaseKey]);
              currentBaseKey = data.layer;
              if (baseLayers[currentBaseKey]) {
                baseLayers[currentBaseKey].addTo(map);
                baseLayers[currentBaseKey].bringToBack();
              }
            } else if (data.type === 'SET_CATASTRO_VISIBILITY') {
              catastroVisible = data.visible;
              refreshCatastroLayer();
            } else if (data.type === 'SET_CATASTRO_OPACITY') {
              catastroOpacity = data.opacity;
              if (catastroWMS) catastroWMS.setOpacity(catastroOpacity);
            } else if (data.type === 'SET_IGN_LABELS_VISIBILITY') {
              if (data.visible) {
                ignLabelsLayer.addTo(map);
              } else {
                map.removeLayer(ignLabelsLayer);
              }
            } else if (data.type === 'SET_MEASURE_MODE') {
              measureMode = data.mode;
              clearAllMeasure();
              if (data.mode) {
                var center = map.getCenter();
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'MEASURE_TAP_GEOQUERY',
                  lat: center.lat,
                  lon: center.lng
                }));
              }
            } else if (data.type === 'SET_SNAP_ENABLED') {
              snapEnabled = !!data.enabled;
            } else if (data.type === 'REGISTER_PARCEL_VERTICES') {
              addCachedVertices(data.vertices);
            } else if (data.type === 'CLEAR_PARCEL_VERTICES') {
              cachedParcelVertices = [];
            } else if (data.type === 'MEASURE_UNDO') {
              if (measurePoints.length > 0) {
                measurePoints.pop();
                updateMeasureGraphics(false);
              }
            } else if (data.type === 'MEASURE_CLEAR') {
              clearAllMeasure();
            }
          } catch(e) {}
        }

        window.addEventListener('message', handleRNMessage);
        document.addEventListener('message', handleRNMessage);

        map.on('moveend', function() {
          if (measureMode && snapEnabled) {
            var center = map.getCenter();
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'MEASURE_TAP_GEOQUERY',
              lat: center.lat,
              lon: center.lng
            }));
          }
        });

        map.on('click', function(e) {
          if (measureMode) {
            var targetPoint = e.latlng;
            var wasSnapped = false;
            if (snapEnabled) {
              var nearest = findNearestVertex(e.latlng, 35);
              if (nearest) {
                targetPoint = nearest;
                wasSnapped = true;
                triggerSnapVisual(nearest);
              }
            }
            measurePoints.push(targetPoint);
            updateMeasureGraphics(wasSnapped);

            // Consultar geometría de parcela en segundo plano para alimentar el imán
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'MEASURE_TAP_GEOQUERY',
              lat: e.latlng.lat,
              lon: e.latlng.lng
            }));
          } else {
            if (currentMarker) map.removeLayer(currentMarker);
            currentMarker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(map);
            
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'MAP_CLICK',
              lat: e.latlng.lat,
              lon: e.latlng.lng
            }));
          }
        });
      </script>
    </body>
    </html>
  `;

  // Abrir Ficha Oficial delegado a CadastreService
  const openOfficialFicha = async (item) => {
    // Para Estado necesitamos refCat (o ref20), delCode, munCode. 
    // Para Navarra necesitamos también parCode y subareaCode (si existe)
    const ref = item.ref20 || item.refCat;
    await cadastreService.openOfficialFicha(ref, item.del, item.mun, item.parCode, item.subareaCode, selectedRegion);
  };

  // Obtener datos de parcelas e inmuebles
  const fetchFullParcelDetails = async (refCat, lat, lon, regionOverride) => {
    setLoading(true);
    setSubparcels([]);
    setShowSubparcels(false);
    setSelectedSubparcel(null);
    cardAnimY.setValue(COLLAPSED_Y);
    isExpandedRef.current = false;
    const detectedRegion = (lat && lon) ? cadastreService.detectRegionFromCoords(lat, lon) : selectedRegion;
    const targetRegion = regionOverride || detectedRegion;

    if (targetRegion !== selectedRegion) {
      changeRegion(targetRegion);
    }

    try {
      const data = await cadastreService.fetchFullParcelDetails(refCat, lat, lon, targetRegion);
      setSubparcels(data.subparcels || []);
      setParcelDetails(data.parcelDetails);

      // Alimentar el sistema de imán con los vértices oficiales de la parcela
      cadastreService.fetchParcelGeometry(refCat, lat, lon, targetRegion)
        .then((verts) => {
          if (verts && verts.length > 0) {
            webViewRef.current?.postMessage(JSON.stringify({
              type: 'REGISTER_PARCEL_VERTICES',
              vertices: verts
            }));
          }
        })
        .catch(() => {});
    } catch (err) {
      setParcelDetails({
        refCat,
        ref20: refCat,
        lat,
        lon,
        address: 'Ubicación Seleccionada',
        count: 1
      });
    } finally {
      setLoading(false);
    }
  };

  // Clic en Coordenadas del Mapa con Sondeo Espacial de Radio
  const fetchParcelByCoords = async (lat, lon, regionOverride) => {
    setLoading(true);
    const detectedRegion = cadastreService.detectRegionFromCoords(lat, lon);
    const targetRegion = regionOverride || detectedRegion;

    if (targetRegion !== selectedRegion) {
      changeRegion(targetRegion);
    }

    webViewRef.current?.postMessage(JSON.stringify({
      type: 'MOVE_TO',
      lat,
      lon
    }));

    try {
      const result = await cadastreService.fetchParcelByCoords(lat, lon, targetRegion);

      if (result && result.found) {
        setSelectedParcel({ lat, lon, ref: result.ref });

        webViewRef.current?.postMessage(JSON.stringify({
          type: 'MOVE_TO',
          lat,
          lon,
          ref: result.ref
        }));

        await fetchFullParcelDetails(result.ref, lat, lon, targetRegion);
      } else {
        setParcelDetails({
          refCat: 'Sin edificio en el punto exacto',
          ref20: '',
          lat,
          lon,
          address: 'Ubicación alcanzada. Toca cualquier edificio en el mapa para ver sus datos.',
          count: 0,
          noExactBuilding: true
        });
      }
    } catch (err) {
      Alert.alert('Error', 'No se pudo conectar con el Catastro.');
    } finally {
      setLoading(false);
    }
  };

  // Buscador de Direcciones usando ArcGIS Cartociudad con outFields=* (extrae Pedanía / District)
  const handleSearchTextChange = (text) => {
    setQuery(text);
    setShowRecent(false);
    if (typingTimer.current) clearTimeout(typingTimer.current);

    if (text.length < 3) {
      setSuggestions([]);
      return;
    }

    const cleanText = text.trim().toUpperCase();

    // Detección segura de Referencia Catastral a partir de 13 caracteres sin espacios
    if (cleanText.length >= 13 && !cleanText.includes(' ') && /^[A-Z0-9]+$/.test(cleanText)) {
      setSuggestions([{
        place_id: 'rc_direct',
        display_name: `🔎 Buscar Referencia Catastral: ${cleanText}`,
        isRC: true,
        rc: cleanText
      }]);
      return;
    }
    typingTimer.current = setTimeout(async () => {
      try {
        const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(text)}&countryCode=ESP&maxLocations=6&outFields=*`;
        const response = await fetch(url);
        const data = await response.json();

        if (data?.candidates?.length > 0) {
          const mapped = data.candidates.map((c, idx) => {
            const attrs = c.attributes || {};
            const district = attrs.District || attrs.Neighborhood || '';
            const city = attrs.City || attrs.Subregion || '';

            let formattedTitle = c.address;
            if (district && !c.address.toLowerCase().includes(district.toLowerCase())) {
              const parts = c.address.split(',');
              if (parts.length >= 2) {
                formattedTitle = `${parts[0].trim()}, ${district} (${parts.slice(1).join(',').trim()})`;
              } else {
                formattedTitle = `${c.address}, ${district}`;
              }
            }

            const fullAddrText = `${formattedTitle} ${district} ${city}`;
            const region = cadastreService.detectRegionFromCoords(c.location.y, c.location.x, fullAddrText);

            return {
              place_id: `arcgis_${idx}`,
              display_name: formattedTitle,
              lat: c.location.y,
              lon: c.location.x,
              district,
              city,
              region
            };
          });
          setSuggestions(mapped);
        } else {
          // Intentar primero con la API suggest de ArcGIS para consultas de calle + número sin municipio
          const urlSuggest = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest?f=json&text=${encodeURIComponent(text)}&countryCode=ESP&maxSuggestions=6`;
          const resS = await fetch(urlSuggest);
          const dataS = await resS.json();

          if (dataS?.suggestions?.length > 0) {
            const mappedSuggestions = [];
            for (const s of dataS.suggestions) {
              if (s.magicKey) {
                try {
                  const urlKey = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&magicKey=${s.magicKey}&outFields=*`;
                  const resKey = await fetch(urlKey);
                  const dataKey = await resKey.json();
                  if (dataKey?.candidates?.[0]) {
                    const c = dataKey.candidates[0];
                    const attrs = c.attributes || {};
                    const district = attrs.District || attrs.Neighborhood || '';
                    const city = attrs.City || attrs.Subregion || '';

                    let formattedTitle = c.address;
                    if (district && !c.address.toLowerCase().includes(district.toLowerCase())) {
                      const parts = c.address.split(',');
                      if (parts.length >= 2) {
                        formattedTitle = `${parts[0].trim()}, ${district} (${parts.slice(1).join(',').trim()})`;
                      } else {
                        formattedTitle = `${c.address}, ${district}`;
                      }
                    }

                    const fullAddrText = `${formattedTitle} ${district} ${city}`;
                    const region = cadastreService.detectRegionFromCoords(c.location.y, c.location.x, fullAddrText);

                    mappedSuggestions.push({
                      place_id: `arcgis_sugg_${s.magicKey}`,
                      display_name: formattedTitle,
                      lat: c.location.y,
                      lon: c.location.x,
                      district,
                      city,
                      region
                    });
                  }
                } catch(e) {}
              }
            }
            if (mappedSuggestions.length > 0) {
              setSuggestions(mappedSuggestions);
              return;
            }
          }

          // Fallback final a Nominatim si no hay resultados en ArcGIS
          const fallbackUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&countrycodes=es&limit=5`;
          const resNom = await fetch(fallbackUrl, {
            headers: { 'User-Agent': 'CatastroGSM-App/1.0' }
          });
          if (resNom.ok) {
            const dataNom = await resNom.json();
            setSuggestions(dataNom);
          }
        }
      } catch (err) {
        console.error('Error buscando dirección:', err);
      }
    }, 350);
  };

  const executeSearch = () => {
    if (!query.trim()) return;
    Keyboard.dismiss();
    setShowRecent(false);

    saveRecentSearch(query);

    const clean = query.trim().toUpperCase();

    if (clean.length >= 13 && !clean.includes(' ') && /^[A-Z0-9]+$/.test(clean)) {
      onSelectSuggestion({ isRC: true, rc: clean });
      return;
    }

    const coordMatch = query.match(/^(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      setSuggestions([]);
      fetchParcelByCoords(lat, lon);
      return;
    }

    if (suggestions.length > 0) {
      onSelectSuggestion(suggestions[0]);
    } else {
      handleSearchTextChange(query);
    }
  };

  const changeRegion = (newRegion) => {
    if (newRegion !== selectedRegion) {
      setSelectedRegion(newRegion);
      webViewRef.current?.postMessage(JSON.stringify({
        type: 'CHANGE_REGION',
        wmsUrl: cadastreService.getWMSUrl(newRegion),
        wmsLayers: cadastreService.getWMSLayers(newRegion)
      }));
    }
  };

  const onSelectSuggestion = async (item) => {
    Keyboard.dismiss();
    setSuggestions([]);
    setShowRecent(false);

    if (item.isRC) {
      setQuery(item.rc);
      saveRecentSearch(item.rc);
      setLoading(true);
      try {
        const result = await cadastreService.getCoordsFromRC(item.rc, selectedRegion);
        
        if (result && result.found) {
          setSelectedParcel({ lat: result.lat, lon: result.lon, ref: item.rc });
          webViewRef.current?.postMessage(JSON.stringify({
            type: 'MOVE_TO',
            lat: result.lat,
            lon: result.lon,
            ref: item.rc
          }));

          await fetchFullParcelDetails(item.rc, result.lat, result.lon, selectedRegion);
        } else {
          Alert.alert('No encontrada', 'No se encontraron coordenadas para esa Referencia Catastral.');
        }
      } catch (err) {
        Alert.alert('Error', 'Fallo al consultar el Catastro.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Dirección normal
    setQuery(item.display_name);
    saveRecentSearch(item.display_name);

    if (item.region && item.region !== selectedRegion) {
      changeRegion(item.region);
    }

    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);

    webViewRef.current?.postMessage(JSON.stringify({
      type: 'MOVE_TO',
      lat,
      lon
    }));

    await fetchParcelByCoords(lat, lon, item.region);
  };

  const clearInputText = () => {
    setQuery('');
    setSuggestions([]);
    setShowRecent(recentSearches.length > 0);
  };

  const copyToClipboard = (text) => {
    Clipboard.setString(text);
    Alert.alert('Copiado', `Referencia copiada al portapapeles:\n${text}`);
  };

  const cleanQuery = query.trim().toUpperCase();
  const isRCInput = cleanQuery.length >= 13 && !cleanQuery.includes(' ') && /^[A-Z0-9]+$/.test(cleanQuery);

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. Barra Superior: Buscador Normal O Barra de Medición si está activa */}
      {!measureMode ? (
        <View style={styles.searchContainer}>
          <Text style={styles.appTitle}>🏛️ GeoCatastro</Text>
          
          <View style={styles.inputRow}>
            <View style={styles.inputBoxContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Dirección, Calle y Nº, Ref. Catastral..."
                placeholderTextColor="#888"
                value={query}
                onChangeText={handleSearchTextChange}
                onFocus={() => {
                  if (query.trim().length === 0 && recentSearches.length > 0) {
                    setShowRecent(true);
                  }
                }}
                onSubmitEditing={executeSearch}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity style={styles.clearIconBtn} onPress={clearInputText}>
                  <Text style={styles.clearIconText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity style={styles.searchButton} onPress={executeSearch}>
              <Text style={styles.searchButtonText}>Buscar</Text>
            </TouchableOpacity>
          </View>

          {isRCInput && (
            <View style={styles.regionSelectorRow}>
              <TouchableOpacity 
                style={[styles.regionBtn, selectedRegion === 'ES' && styles.regionBtnActive]}
                onPress={() => changeRegion('ES')}
              >
                <Text style={[styles.regionBtnText, selectedRegion === 'ES' && styles.regionBtnTextActive]}>🇪🇸 Estado</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.regionBtn, selectedRegion === 'NA' && styles.regionBtnActive]}
                onPress={() => changeRegion('NA')}
              >
                <Text style={[styles.regionBtnText, selectedRegion === 'NA' && styles.regionBtnTextActive]}>🔴 Navarra</Text>
              </TouchableOpacity>
            </View>
          )}

          {loading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#0066cc" />
              <Text style={styles.loadingText}> Consultando Sede del Catastro...</Text>
            </View>
          )}

          {/* Lista de Búsquedas Recientes */}
          {showRecent && recentSearches.length > 0 && (
            <View style={styles.recentContainer}>
              <View style={styles.recentHeaderRow}>
                <Text style={styles.recentHeaderText}>🕒 Búsquedas Recientes</Text>
                <TouchableOpacity onPress={clearAllRecent}>
                  <Text style={styles.recentClearAllText}>Borrar historial</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.recentScroll} keyboardShouldPersistTaps="handled">
                {recentSearches.map((item, idx) => (
                  <View key={idx} style={styles.recentRowItem}>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => {
                        setQuery(item);
                        setShowRecent(false);
                        handleSearchTextChange(item);
                      }}
                    >
                      <Text style={styles.recentItemText} numberOfLines={1}>🕒 {item}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ paddingLeft: 8 }}
                      onPress={() => removeRecentSearch(item)}
                    >
                      <Text style={styles.recentDeleteBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Lista de Sugerencias de Autocompletado */}
          {suggestions.length > 0 && (
            <FlatList
              data={suggestions}
              keyExtractor={(item, idx) => item.place_id ? item.place_id.toString() : idx.toString()}
              style={styles.suggestionsList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.suggestionItem} onPress={() => onSelectSuggestion(item)}>
                  <Text numberOfLines={2} style={item.isRC ? styles.rcSuggestionText : styles.suggestionText}>
                    {item.display_name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      ) : (
        /* Panel Contextual de Medición Activa */
        <View style={styles.measurePanel}>
          <View style={styles.measureTabsRow}>
            <TouchableOpacity
              style={[styles.measureTab, measureMode === 'distance' && styles.measureTabActive]}
              onPress={() => startMeasureMode('distance')}
            >
              <Text style={[styles.measureTabText, measureMode === 'distance' && styles.measureTabTextActive]}>
                📏 Distancia
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.measureTab, measureMode === 'area' && styles.measureTabActive]}
              onPress={() => startMeasureMode('area')}
            >
              <Text style={[styles.measureTabText, measureMode === 'area' && styles.measureTabTextActive]}>
                📐 Área y Perímetro
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.measureExitBtn} onPress={exitMeasureMode}>
              <Text style={styles.measureExitBtnText}>✕ Salir</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.measureDisplayBox}>
            {measureMode === 'distance' ? (
              <View>
                <Text style={styles.measureMainValue}>
                  📏 {formatDistance(measureStats.distance)}
                </Text>
                <Text style={styles.measureSubText}>
                  {measureStats.pointsCount === 0
                    ? 'Toca en el mapa para añadir puntos y medir'
                    : `${measureStats.pointsCount} vértice(s) trazado(s)`}
                </Text>
              </View>
            ) : (
              <View>
                <Text style={styles.measureMainValue}>
                  📐 {formatArea(measureStats.area)}
                </Text>
                <Text style={styles.measureSubText}>
                  {measureStats.pointsCount < 3
                    ? 'Toca al menos 3 puntos en el mapa para cerrar el polígono'
                    : `Perímetro: ${formatDistance(measureStats.perimeter)} | ${measureStats.pointsCount} vértices`}
                </Text>
              </View>
            )}

            {measureStats.snapped && (
              <View style={styles.snapBadge}>
                <Text style={styles.snapBadgeText}>🧲 Vértice ajustado a esquina oficial</Text>
              </View>
            )}
          </View>

          <View style={styles.measureActionsRow}>
            <TouchableOpacity
              style={[styles.measureActionBtn, measureStats.pointsCount === 0 && styles.btnDisabled]}
              onPress={undoMeasurePoint}
              disabled={measureStats.pointsCount === 0}
            >
              <Text style={styles.measureActionBtnText}>↩ Deshacer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.measureActionBtn, snapEnabled ? styles.measureActionBtnSnapActive : styles.measureActionBtnSnapInactive]}
              onPress={toggleSnap}
            >
              <Text style={[styles.measureActionBtnText, snapEnabled && { color: '#00875a', fontWeight: 'bold' }]}>
                {snapEnabled ? '🧲 Imán: SÍ' : '🧲 Imán: NO'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.measureActionBtn, styles.measureActionBtnDanger, measureStats.pointsCount === 0 && styles.btnDisabled]}
              onPress={clearMeasurePoints}
              disabled={measureStats.pointsCount === 0}
            >
              <Text style={[styles.measureActionBtnText, { color: '#cc0000' }]}>🗑 Limpiar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 2. Mapa Interactivo Leaflet + WMS Catastro / Capas IGN */}
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: leafletHTML }}
        style={styles.map}
        onMessage={(e) => {
          try {
            const data = JSON.parse(e.nativeEvent.data);
            if (data.type === 'MAP_CLICK') {
              fetchParcelByCoords(data.lat, data.lon);
            } else if (data.type === 'MEASURE_UPDATE') {
              setMeasureStats({
                distance: data.distance || 0,
                area: data.area || 0,
                perimeter: data.perimeter || 0,
                pointsCount: data.pointsCount || 0,
                snapped: !!data.snapped
              });
            } else if (data.type === 'MEASURE_TAP_GEOQUERY') {
              if (snapEnabled && data.lat && data.lon) {
                const region = cadastreService.detectRegionFromCoords(data.lat, data.lon);
                cadastreService.fetchParcelGeometry(null, data.lat, data.lon, region)
                  .then((vertices) => {
                    if (vertices && vertices.length > 0) {
                      webViewRef.current?.postMessage(JSON.stringify({
                        type: 'REGISTER_PARCEL_VERTICES',
                        vertices: vertices
                      }));
                    }
                  })
                  .catch(() => {});
              }
            }
          } catch (err) {}
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />

      {/* 3. Botonera Flotante Lateral Derecha (Capas, Medir, GPS) */}
      <View style={[styles.mapButtonsStack, parcelDetails && { bottom: SCREEN_HEIGHT * 0.38 }]}>
        <TouchableOpacity
          style={styles.floatingToolBtn}
          onPress={() => setShowLayersModal(true)}
        >
          <Text style={styles.floatingToolIcon}>🥞</Text>
          <Text style={styles.floatingToolLabel}>Capas</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.floatingToolBtn, measureMode && styles.floatingToolBtnActive]}
          onPress={() => {
            if (measureMode) exitMeasureMode();
            else startMeasureMode('distance');
          }}
        >
          <Text style={styles.floatingToolIcon}>📏</Text>
          <Text style={styles.floatingToolLabel}>{measureMode ? 'Midiendo' : 'Medir'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.floatingGpsBtn}
          onPress={() => getUserLocation(false)}
        >
          <Text style={styles.floatingGpsIcon}>🎯</Text>
          <Text style={styles.floatingGpsLabel}>Ubicación</Text>
        </TouchableOpacity>
      </View>

      {/* 4. Modal / Panel de Gestión de Capas */}
      <Modal
        visible={showLayersModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLayersModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.layersModalCard}>
            <View style={styles.layersModalHeader}>
              <Text style={styles.layersModalTitle}>🥞 Capas del Mapa</Text>
              <TouchableOpacity onPress={() => setShowLayersModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              {/* Sección 1: Mapa Base */}
              <Text style={styles.layersSectionTitle}>MAPA BASE</Text>
              <View style={styles.baseLayersGrid}>
                <TouchableOpacity
                  style={[styles.baseLayerCard, activeBaseLayer === 'osm' && styles.baseLayerCardActive]}
                  onPress={() => handleSelectBaseLayer('osm')}
                >
                  <Text style={styles.baseLayerIcon}>🗺️</Text>
                  <Text style={[styles.baseLayerText, activeBaseLayer === 'osm' && styles.baseLayerTextActive]}>
                    Callejero (OSM)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.baseLayerCard, activeBaseLayer === 'ign_base' && styles.baseLayerCardActive]}
                  onPress={() => handleSelectBaseLayer('ign_base')}
                >
                  <Text style={styles.baseLayerIcon}>🇪🇸</Text>
                  <Text style={[styles.baseLayerText, activeBaseLayer === 'ign_base' && styles.baseLayerTextActive]}>
                    Topográfico (IGN)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.baseLayerCard, activeBaseLayer === 'ign_pnoa' && styles.baseLayerCardActive]}
                  onPress={() => handleSelectBaseLayer('ign_pnoa')}
                >
                  <Text style={styles.baseLayerIcon}>🛰️</Text>
                  <Text style={[styles.baseLayerText, activeBaseLayer === 'ign_pnoa' && styles.baseLayerTextActive]}>
                    Ortofoto PNOA (IGN)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.baseLayerCard, activeBaseLayer === 'esri_sat' && styles.baseLayerCardActive]}
                  onPress={() => handleSelectBaseLayer('esri_sat')}
                >
                  <Text style={styles.baseLayerIcon}>🌍</Text>
                  <Text style={[styles.baseLayerText, activeBaseLayer === 'esri_sat' && styles.baseLayerTextActive]}>
                    Satélite (Esri)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Sección 2: Capas Superpuestas */}
              <Text style={[styles.layersSectionTitle, { marginTop: 16 }]}>CAPAS SUPERPUESTAS</Text>
              
              {/* Capa Catastro Unificada */}
              <View style={styles.overlayItemBox}>
                <View style={styles.overlayItemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.overlayItemTitle}>🏛️ Catastro</Text>
                    <Text style={styles.overlayItemSub}>Lindes y parcelas oficiales</Text>
                  </View>
                  <Switch
                    value={catastroVisible}
                    onValueChange={handleToggleCatastro}
                    trackColor={{ false: '#ccc', true: '#99c2ff' }}
                    thumbColor={catastroVisible ? '#0066cc' : '#f4f4f4'}
                  />
                </View>

                {catastroVisible && (
                  <View style={styles.opacityControlsContainer}>
                    <Text style={styles.opacityLabel}>Opacidad: {Math.round(catastroOpacity * 100)}%</Text>
                    <View style={styles.opacityPillsRow}>
                      {[0.25, 0.50, 0.75, 1.0].map((val) => (
                        <TouchableOpacity
                          key={val}
                          style={[styles.opacityPill, catastroOpacity === val && styles.opacityPillActive]}
                          onPress={() => handleSetCatastroOpacity(val)}
                        >
                          <Text style={[styles.opacityPillText, catastroOpacity === val && styles.opacityPillTextActive]}>
                            {Math.round(val * 100)}%
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              {/* Capa Rotulación IGN */}
              <View style={[styles.overlayItemBox, { marginTop: 10 }]}>
                <View style={styles.overlayItemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.overlayItemTitle}>🏷️ Rotulación de Calles (IGN)</Text>
                    <Text style={styles.overlayItemSub}>Toponimia y nombres sobre ortofotos</Text>
                  </View>
                  <Switch
                    value={ignLabelsVisible}
                    onValueChange={handleToggleIgnLabels}
                    trackColor={{ false: '#ccc', true: '#99c2ff' }}
                    thumbColor={ignLabelsVisible ? '#0066cc' : '#f4f4f4'}
                  />
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.modalAcceptBtn} onPress={() => setShowLayersModal(false)}>
              <Text style={styles.modalAcceptBtnText}>Aceptar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 5. Tarjeta Deslizante de Información Catastral */}
      {parcelDetails && !measureMode && (
        <Animated.View 
          style={[
            styles.detailsCard, 
            { transform: [{ translateY: cardAnimY }] }
          ]}
        >
          <View {...panResponder.panHandlers} style={styles.dragHandleContainer}>
            <View style={styles.dragHandleBar} />
          </View>

          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardAddress} numberOfLines={2}>{parcelDetails.address}</Text>

              {!parcelDetails.noExactBuilding && (
                <>
                  <Text style={styles.cardRefLabel}>Ref. Catastral Base (14 car.):</Text>
                  <TouchableOpacity onPress={() => copyToClipboard(parcelDetails.refCat)}>
                    <Text style={styles.cardRefValue}>{parcelDetails.refCat} 📋</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <TouchableOpacity 
              style={styles.closeCardBtn} 
              onPress={() => {
                setParcelDetails(null);
                resetCardPosition();
              }}
            >
              <Text style={styles.closeCardBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {!parcelDetails.noExactBuilding ? (
            <>
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>🏢 {parcelDetails.count} Inmueble(s) / Subparcelas</Text>
                </View>
              </View>

              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => {
                    const isSingle = parcelDetails.count === 1;
                    const refToOpen = isSingle 
                      ? (parcelDetails.ref20 || parcelDetails.refCat) 
                      : String(parcelDetails.refCat || '').trim().substring(0, 14);

                    openOfficialFicha({
                      refCat: refToOpen,
                      ref20: isSingle ? refToOpen : '',
                      del: parcelDetails.del,
                      mun: parcelDetails.mun,
                      parCode: parcelDetails.parCode,
                      subareaCode: ''
                    });
                  }}
                >
                  <Text style={styles.btnPrimaryText}>
                    {parcelDetails.count === 1 
                      ? '📄 Abrir Ficha del Inmueble' 
                      : (selectedRegion === 'NA' ? '📄 Abrir Ficha de Parcela' : '📄 Abrir Mapa de Parcela')
                    }
                  </Text>
                </TouchableOpacity>

                {subparcels.length > 1 && (
                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => {
                      const nextState = !showSubparcels;
                      setShowSubparcels(nextState);
                      if (nextState) expandCard();
                      else resetCardPosition();
                    }}
                  >
                    <Text style={styles.btnSecondaryText}>
                      {showSubparcels ? '▲ Ocultar Pisos / Locales' : '▼ Ver Lista de Pisos / Locales'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Lista Desplegable de Subparcelas / Pisos de 20 dígitos */}
              {showSubparcels && subparcels.length > 1 && (
                <View style={styles.subparcelsContainer}>
                  <Text style={styles.subparcelsHeader}>Selecciona un piso para abrir su Ficha:</Text>
                  
                  <TextInput
                    style={styles.subparcelFilterInput}
                    placeholder="Filtrar por portal, calle, planta..."
                    placeholderTextColor="#888"
                    value={subparcelFilter}
                    onChangeText={setSubparcelFilter}
                  />

                  <ScrollView style={styles.subparcelsScroll} nestedScrollEnabled={true}>
                    {subparcels.filter(sub => {
                      if (!subparcelFilter) return true;
                      const term = subparcelFilter.toLowerCase();
                      const addr = (sub.address || '').toLowerCase();
                      const int = (sub.interior || '').toLowerCase();
                      return addr.includes(term) || int.includes(term);
                    }).map((sub, idx) => {
                      const isSelected = selectedSubparcel?.id === sub.id;
                      return (
                        <View
                          key={sub.id + idx}
                          style={[styles.subparcelItem, isSelected && styles.subparcelItemSelected]}
                        >
                          <TouchableOpacity
                            style={{ flex: 1 }}
                            onPress={() => setSelectedSubparcel(sub)}
                          >
                            <Text style={styles.subparcelTitle}>{sub.interior}</Text>
                            <Text style={styles.subparcelRC}>{sub.ref20}</Text>
                          </TouchableOpacity>

                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              style={styles.btnMiniFicha}
                              onPress={() => openOfficialFicha(sub)}
                            >
                              <Text style={styles.btnMiniFichaText}>Ficha 🌐</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.copyBtnMini}
                              onPress={() => copyToClipboard(sub.ref20)}
                            >
                              <Text style={styles.copyBtnMiniText}>Copiar</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </>
          ) : (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.hintText}>💡 ¿No se detecta edificio o deseas consultar en otro Catastro?</Text>
              <TouchableOpacity
                style={[styles.btnSecondary, { marginTop: 8 }]}
                onPress={() => {
                  const targetRegion = selectedRegion === 'NA' ? 'ES' : 'NA';
                  changeRegion(targetRegion);
                  if (parcelDetails.lat && parcelDetails.lon) {
                    fetchParcelByCoords(parcelDetails.lat, parcelDetails.lon, targetRegion);
                  }
                }}
              >
                <Text style={styles.btnSecondaryText}>
                  {selectedRegion === 'NA' ? '🌐 Consultar en Catastro Estatal' : '🔴 Consultar en Catastro de Navarra'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  searchContainer: {
    position: 'absolute',
    top: 45,
    left: 14,
    right: 14,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 12,
    zIndex: 100,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  appTitle: { fontWeight: 'bold', fontSize: 15, marginBottom: 8, color: '#111' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  inputBoxContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', position: 'relative' },
  searchInput: {
    flex: 1,
    height: 42,
    borderColor: '#ccc',
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 34,
    borderRadius: 8,
    backgroundColor: '#fafafa',
    fontSize: 13,
    color: '#000'
  },
  clearIconBtn: { position: 'absolute', right: 8, padding: 6 },
  clearIconText: { fontSize: 14, color: '#888', fontWeight: 'bold' },
  searchButton: {
    backgroundColor: '#0066cc',
    paddingHorizontal: 14,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginLeft: 8,
  },
  searchButtonText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  loadingBox: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  loadingText: { color: '#0066cc', fontSize: 12, fontWeight: '500' },
  regionSelectorRow: { flexDirection: 'row', marginTop: 10, backgroundColor: '#f0f0f0', borderRadius: 8, padding: 2 },
  regionBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  regionBtnActive: { backgroundColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1, elevation: 2 },
  regionBtnText: { fontSize: 12, color: '#666', fontWeight: '600' },
  regionBtnTextActive: { color: '#0066cc', fontWeight: 'bold' },

  // Estilos del Panel de Medición
  measurePanel: {
    position: 'absolute',
    top: 45,
    left: 14,
    right: 14,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 14,
    zIndex: 100,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  measureTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6
  },
  measureTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center'
  },
  measureTabActive: {
    backgroundColor: '#e6f2ff',
    borderWidth: 1,
    borderColor: '#0066cc'
  },
  measureTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666'
  },
  measureTabTextActive: {
    color: '#0066cc',
    fontWeight: 'bold'
  },
  measureExitBtn: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: '#fee',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fcc'
  },
  measureExitBtnText: {
    color: '#cc0000',
    fontWeight: 'bold',
    fontSize: 12
  },
  measureDisplayBox: {
    backgroundColor: '#f9fbfd',
    borderWidth: 1,
    borderColor: '#e1ecf7',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginVertical: 4
  },
  measureMainValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0066cc',
    textAlign: 'center'
  },
  measureSubText: {
    fontSize: 11,
    color: '#666',
    marginTop: 3,
    textAlign: 'center'
  },
  measureActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6
  },
  measureActionBtn: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d5e0ea'
  },
  measureActionBtnDanger: {
    backgroundColor: '#fff5f5',
    borderColor: '#f0d0d0'
  },
  measureActionBtnSnapActive: {
    backgroundColor: '#e6f7ef',
    borderColor: '#10b981',
    borderWidth: 1.5
  },
  measureActionBtnSnapInactive: {
    backgroundColor: '#f8f8f8',
    borderColor: '#ddd'
  },
  snapBadge: {
    marginTop: 6,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#a7f3d0'
  },
  snapBadgeText: {
    fontSize: 10.5,
    color: '#047857',
    fontWeight: 'bold'
  },
  measureActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333'
  },
  btnDisabled: {
    opacity: 0.4
  },

  // Botonera Flotante Lateral Derecha
  mapButtonsStack: {
    position: 'absolute',
    right: 14,
    bottom: 30,
    zIndex: 95,
    gap: 10,
    alignItems: 'center'
  },
  floatingToolBtn: {
    backgroundColor: 'white',
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  floatingToolBtnActive: {
    backgroundColor: '#e6f2ff',
    borderWidth: 2,
    borderColor: '#0066cc'
  },
  floatingToolIcon: {
    fontSize: 18
  },
  floatingToolLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 1
  },
  floatingGpsBtn: {
    backgroundColor: '#0066cc',
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  floatingGpsIcon: {
    fontSize: 18,
    color: 'white'
  },
  floatingGpsLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 1
  },

  // Estilos del Modal de Capas
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  layersModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  layersModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  layersModalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111'
  },
  modalCloseBtn: {
    padding: 4
  },
  modalCloseBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#888'
  },
  layersSectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 8,
    letterSpacing: 0.5
  },
  baseLayersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  baseLayerCard: {
    width: '48%',
    backgroundColor: '#f8f9fa',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center'
  },
  baseLayerCardActive: {
    backgroundColor: '#e6f2ff',
    borderColor: '#0066cc'
  },
  baseLayerIcon: {
    fontSize: 22,
    marginBottom: 4
  },
  baseLayerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#444',
    textAlign: 'center'
  },
  baseLayerTextActive: {
    color: '#0066cc',
    fontWeight: 'bold'
  },
  overlayItemBox: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12
  },
  overlayItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  overlayItemTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#222'
  },
  overlayItemSub: {
    fontSize: 11,
    color: '#777',
    marginTop: 2
  },
  opacityControlsContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee'
  },
  opacityLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6
  },
  opacityPillsRow: {
    flexDirection: 'row',
    gap: 6
  },
  opacityPill: {
    flex: 1,
    paddingVertical: 5,
    backgroundColor: '#eef2f6',
    borderRadius: 6,
    alignItems: 'center'
  },
  opacityPillActive: {
    backgroundColor: '#0066cc'
  },
  opacityPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555'
  },
  opacityPillTextActive: {
    color: 'white',
    fontWeight: 'bold'
  },
  modalAcceptBtn: {
    backgroundColor: '#0066cc',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 14
  },
  modalAcceptBtnText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 13
  },

  // Búsquedas recientes
  recentContainer: {
    marginTop: 8,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 8,
  },
  recentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  recentHeaderText: { fontSize: 11, fontWeight: 'bold', color: '#555' },
  recentClearAllText: { fontSize: 11, color: '#cc0000', fontWeight: '600' },
  recentScroll: { maxHeight: 160 },
  recentRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  recentItemText: { fontSize: 12, color: '#333' },
  recentDeleteBtn: { fontSize: 13, color: '#999', paddingHorizontal: 4, fontWeight: 'bold' },

  dragHandleContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 6,
    marginTop: -8,
    marginBottom: 4,
  },
  dragHandleBar: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#ccc',
  },

  subparcelsContainer: {
    maxHeight: SCREEN_HEIGHT * 0.45,
    marginTop: 10,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 8
  },
  subparcelsScroll: { maxHeight: SCREEN_HEIGHT * 0.35 },
  subparcelFilterInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    marginBottom: 8,
    color: '#333'
  },

  suggestionsList: {
    maxHeight: 210,
    marginTop: 8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  suggestionText: { fontSize: 13, color: '#333' },
  rcSuggestionText: { fontSize: 13, color: '#0066cc', fontWeight: 'bold' },
  map: { flex: 1, zIndex: 1 },
  detailsCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.75,
    backgroundColor: 'white',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 15,
    zIndex: 100,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardAddress: { fontWeight: 'bold', fontSize: 14, color: '#222' },
  cardRefLabel: { fontSize: 11, color: '#666', marginTop: 4 },
  cardRefValue: { fontSize: 16, fontWeight: 'bold', color: '#0066cc', marginTop: 2 },
  closeCardBtn: { padding: 4, paddingLeft: 10 },
  closeCardBtnText: { fontSize: 18, color: '#888', fontWeight: 'bold' },
  badgeRow: { flexDirection: 'row', marginVertical: 8 },
  badge: { backgroundColor: '#e6f2ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#0066cc', fontSize: 12, fontWeight: '600' },
  hintText: { fontSize: 12, color: '#666', marginTop: 8, fontStyle: 'italic' },
  actionButtonsRow: { flexDirection: 'column', gap: 6, marginTop: 4 },
  btnPrimary: {
    backgroundColor: '#0066cc',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimaryText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  btnSecondary: {
    backgroundColor: '#f0f4f8',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d0e0f0'
  },
  btnSecondaryText: { color: '#0055aa', fontWeight: '600', fontSize: 12 },
  subparcelsHeader: { fontWeight: 'bold', fontSize: 12, color: '#444', marginBottom: 6 },
  subparcelItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    borderRadius: 6
  },
  subparcelItemSelected: { backgroundColor: '#e6f2ff' },
  subparcelTitle: { fontSize: 12, color: '#222', fontWeight: '500' },
  subparcelRC: { fontSize: 11, color: '#0066cc', fontFamily: 'monospace' },
  btnMiniFicha: { backgroundColor: '#0066cc', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  btnMiniFichaText: { fontSize: 10, color: 'white', fontWeight: 'bold' },
  copyBtnMini: { backgroundColor: '#eef', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  copyBtnMiniText: { fontSize: 10, color: '#0066cc', fontWeight: 'bold' },
});

