import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  SafeAreaView,
  Alert,
  Keyboard,
  Clipboard,
  Dimensions,
  Animated,
  PanResponder,
  TouchableOpacity,
  Text,
  Share
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';

import appConfig from './app.json';
import { cadastreService } from './services/cadastre/CadastreService';
import { getGipuzkoaInjectedJs, getBizkaiaInjectedJs } from './src/services/cadastre/injectedScripts';
import { saveFavorite } from './src/services/storage/favoritesStorage';
import { saveMeasurement } from './src/services/storage/measurementsStorage';
import { exportMeasurementToKml } from './src/services/export/kmlExporter';
import { importKmlFile } from './src/services/export/kmlImporter';
import { headingTracker } from './src/services/location/headingTracker';
import { checkAppUpdate } from './src/utils/versionChecker';

// Componentes modulares
import MapViewer from './src/components/Map/MapViewer';
import SearchBar from './src/components/Search/SearchBar';
import MeasurePanel from './src/components/Measure/MeasurePanel';
import ParcelDetailsSheet from './src/components/Cards/ParcelDetailsSheet';

// Modales
import LayersModal from './src/components/Modals/LayersModal';
import RusticSearchModal from './src/components/Modals/RusticSearchModal';
import FavoritesModal from './src/components/Modals/FavoritesModal';
import SaveFavoriteModal from './src/components/Modals/SaveFavoriteModal';
import SaveMeasurementModal from './src/components/Modals/SaveMeasurementModal';
import SavedMeasurementsModal from './src/components/Modals/SavedMeasurementsModal';
import DniModal from './src/components/Modals/DniModal';
import FichaWebViewModal from './src/components/Modals/FichaWebViewModal';

SplashScreen.preventAutoHideAsync().catch(() => {});

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const RECENT_SEARCHES_STORAGE_KEY = '@catastro_recent_searches_v1';

export default function App() {
  // --- Estados de Búsqueda ---
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [showRecent, setShowRecent] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- Estados de Parcela e Inmuebles ---
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [parcelDetails, setParcelDetails] = useState(null);
  const [subparcels, setSubparcels] = useState([]);
  const [showSubparcels, setShowSubparcels] = useState(false);
  const [selectedSubparcel, setSelectedSubparcel] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState('ES');
  const [subparcelFilter, setSubparcelFilter] = useState('');

  // --- Estados de Capas ---
  const [showLayersModal, setShowLayersModal] = useState(false);
  const [activeBaseLayer, setActiveBaseLayer] = useState('osm');
  const [catastroVisible, setCatastroVisible] = useState(true);
  const [catastroOpacity, setCatastroOpacity] = useState(0.85);
  const [ignLabelsVisible, setIgnLabelsVisible] = useState(false);

  // --- Estados de Medición ---
  const [measureMode, setMeasureMode] = useState(null); // null | 'distance' | 'area'
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [measureStats, setMeasureStats] = useState({
    distance: 0,
    area: 0,
    perimeter: 0,
    pointsCount: 0,
    snapped: false
  });
  const [currentMeasurePoints, setCurrentMeasurePoints] = useState([]);

  // --- Modales de Mediciones y Favoritos ---
  const [saveMeasureModalVisible, setSaveMeasureModalVisible] = useState(false);
  const [savedMeasuresModalVisible, setSavedMeasuresModalVisible] = useState(false);
  const [saveFavModalVisible, setSaveFavModalVisible] = useState(false);
  const [favModalVisible, setFavModalVisible] = useState(false);
  const [favModalParcel, setFavModalParcel] = useState(null);
  const [rusticModalVisible, setRusticModalVisible] = useState(false);

  // --- Estados de DNI y Visor de Ficha Oficial In-App ---
  const [savedDni, setSavedDni] = useState('');
  const [dniModalVisible, setDniModalVisible] = useState(false);
  const [dniInput, setDniInput] = useState('');
  const [pendingFichaItem, setPendingFichaItem] = useState(null);

  const [fichaWebViewVisible, setFichaWebViewVisible] = useState(false);
  const [fichaWebViewUrl, setFichaWebViewUrl] = useState('');
  const [fichaInjectedJs, setFichaInjectedJs] = useState('');
  const [fichaTitle, setFichaTitle] = useState('Ficha Catastral');
  const [fichaPdfUrl, setFichaPdfUrl] = useState(null);
  const [fichaPdfDataUrl, setFichaPdfDataUrl] = useState(null);

  // --- Estados de Geolocalización y Brújula en Vivo ---
  const [isLiveTracking, setIsLiveTracking] = useState(false);

  const mapViewerRef = useRef(null);
  const typingTimer = useRef(null);

  // --- Animaciones del Bottom Sheet ---
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
          if (gestureState.dy < -50) expandCard();
          else if (gestureState.dy > 80) dismissCard();
          else resetCardPosition();
        } else {
          if (gestureState.dy > 180) dismissCard();
          else if (gestureState.dy > 50) resetCardPosition();
          else expandCard();
        }
      }
    })
  ).current;

  const CURRENT_VERSION = appConfig.expo.version;

  // --- Inicialización ---
  useEffect(() => {
    loadRecentSearches();
    checkAppUpdate(CURRENT_VERSION);
    getUserLocationInitial();
    AsyncStorage.getItem('@catastro_user_dni').then(val => {
      if (val) {
        setSavedDni(val);
        setDniInput(val);
      }
    }).catch(() => {});
    SplashScreen.hideAsync().catch(() => {});

    return () => {
      headingTracker.stopTracking();
    };
  }, []);

  const getUserLocationInitial = async () => {
    try {
      const coords = await headingTracker.getCurrentPosition();
      if (coords) {
        const { latitude: lat, longitude: lon } = coords;
        const region = cadastreService.detectRegionFromCoords(lat, lon);

        if (region !== selectedRegion) {
          setSelectedRegion(region);
          mapViewerRef.current?.postMessage({
            type: 'CHANGE_REGION',
            wmsUrl: cadastreService.getWMSUrl(region),
            wmsLayers: cadastreService.getWMSLayers(region),
            layerType: cadastreService.getWMSLayerType(region)
          });
        }

        mapViewerRef.current?.postMessage({
          type: 'MOVE_TO',
          lat,
          lon
        });

        if (!measureMode) {
          await fetchParcelByCoords(lat, lon, region);
        }
      }
    } catch (e) {}
  };

  // Toggle de seguimiento en vivo con punto azul y brújula
  const toggleLiveTracking = async () => {
    if (isLiveTracking) {
      headingTracker.stopTracking(handleLocationUpdate);
      setIsLiveTracking(false);
    } else {
      try {
        const hasPermission = await headingTracker.requestPermissions();
        if (!hasPermission) {
          Alert.alert('Permiso requerido', 'Se necesita permiso de ubicación para mostrar tu posición y orientación.');
          return;
        }

        setIsLiveTracking(true);
        headingTracker.startTracking(handleLocationUpdate);

        const current = await headingTracker.getCurrentPosition();
        if (current) {
          mapViewerRef.current?.postMessage({
            type: 'MOVE_TO',
            lat: current.latitude,
            lon: current.longitude
          });
        }
      } catch (e) {
        Alert.alert('Error', 'No se pudo iniciar el seguimiento de ubicación.');
        setIsLiveTracking(false);
      }
    }
  };

  const handleLocationUpdate = ({ lat, lon, heading }) => {
    mapViewerRef.current?.postMessage({
      type: 'UPDATE_USER_LOCATION',
      lat,
      lon,
      heading,
      follow: false
    });
  };

  // --- Manejo de Búsquedas Recientes ---
  const loadRecentSearches = async () => {
    try {
      const data = await AsyncStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
      if (data) setRecentSearches(JSON.parse(data));
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
      await AsyncStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(current));
    } catch (e) {}
  };

  const removeRecentSearch = async (textToRemove) => {
    try {
      const current = recentSearches.filter(item => item !== textToRemove);
      setRecentSearches(current);
      await AsyncStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(current));
    } catch (e) {}
  };

  const clearAllRecent = async () => {
    try {
      setRecentSearches([]);
      await AsyncStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    } catch (e) {}
  };

  // --- Control de Capas ---
  const handleSelectBaseLayer = (layerKey) => {
    setActiveBaseLayer(layerKey);
    mapViewerRef.current?.postMessage({ type: 'SET_BASE_LAYER', layer: layerKey });
  };

  const handleToggleCatastro = (value) => {
    setCatastroVisible(value);
    mapViewerRef.current?.postMessage({ type: 'SET_CATASTRO_VISIBILITY', visible: value });
  };

  const handleSetCatastroOpacity = (opacityVal) => {
    setCatastroOpacity(opacityVal);
    mapViewerRef.current?.postMessage({ type: 'SET_CATASTRO_OPACITY', opacity: opacityVal });
  };

  const handleToggleIgnLabels = (value) => {
    setIgnLabelsVisible(value);
    mapViewerRef.current?.postMessage({ type: 'SET_IGN_LABELS_VISIBILITY', visible: value });
  };

  // --- Herramientas de Medición ---
  const startMeasureMode = (mode) => {
    setParcelDetails(null);
    setMeasureMode(mode);
    setMeasureStats({ distance: 0, area: 0, perimeter: 0, pointsCount: 0, snapped: false });
    setCurrentMeasurePoints([]);
    mapViewerRef.current?.postMessage({ type: 'SET_MEASURE_MODE', mode });
  };

  const exitMeasureMode = () => {
    setMeasureMode(null);
    setMeasureStats({ distance: 0, area: 0, perimeter: 0, pointsCount: 0, snapped: false });
    setCurrentMeasurePoints([]);
    mapViewerRef.current?.postMessage({ type: 'SET_MEASURE_MODE', mode: null });
  };

  const toggleSnap = () => {
    const nextVal = !snapEnabled;
    setSnapEnabled(nextVal);
    mapViewerRef.current?.postMessage({ type: 'SET_SNAP_ENABLED', enabled: nextVal });
  };

  const undoMeasurePoint = () => {
    mapViewerRef.current?.postMessage({ type: 'MEASURE_UNDO' });
  };

  const clearMeasurePoints = () => {
    setMeasureStats({ distance: 0, area: 0, perimeter: 0, pointsCount: 0, snapped: false });
    setCurrentMeasurePoints([]);
    mapViewerRef.current?.postMessage({ type: 'MEASURE_CLEAR' });
  };

  // --- Exportación e Importación KML ---
  const handleExportKmlCurrent = async () => {
    if (currentMeasurePoints.length === 0) {
      Alert.alert('Sin puntos', 'Añade puntos en el mapa antes de exportar a KML.');
      return;
    }
    await exportMeasurementToKml({
      name: 'Medición GeoCatastro',
      mode: measureMode || 'area',
      points: currentMeasurePoints,
      stats: measureStats,
      notes: ''
    });
  };

  const handleImportKml = async () => {
    const imported = await importKmlFile();
    if (!imported) return;

    // Cargar en el mapa
    setParcelDetails(null);
    setMeasureMode(imported.mode);
    setMeasureStats(imported.stats);
    setCurrentMeasurePoints(imported.points);

    mapViewerRef.current?.postMessage({
      type: 'LOAD_GEOMETRY',
      mode: imported.mode,
      points: imported.points
    });

    Alert.alert(
      'KML Importado con Éxito',
      `Se ha cargado "${imported.name}" con ${imported.points.length} vértices.\n¿Deseas guardarla en tus mediciones?`,
      [
        { text: 'Solo ver en mapa', style: 'cancel' },
        {
          text: '💾 Guardar Medición',
          onPress: () => {
            saveMeasurement(imported, imported.name, imported.notes)
              .then(() => Alert.alert('Guardada', 'Medición guardada en tu historial.'))
              .catch(() => {});
          }
        }
      ]
    );
  };

  // --- Guardar y Cargar Mediciones ---
  const handleSaveActiveMeasurement = async (data) => {
    try {
      await saveMeasurement({
        ...data,
        mode: measureMode,
        points: currentMeasurePoints,
        stats: measureStats
      }, data.name, data.notes);
      Alert.alert('Éxito', 'Medición guardada en tu historial.');
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar la medición.');
    }
  };

  const handleLoadSavedMeasurement = (item) => {
    setParcelDetails(null);
    setMeasureMode(item.mode);
    setMeasureStats(item.stats || {});
    setCurrentMeasurePoints(item.points || []);

    mapViewerRef.current?.postMessage({
      type: 'LOAD_GEOMETRY',
      mode: item.mode,
      points: item.points
    });
  };

  // --- Favoritos ---
  const handleOpenSaveFavoriteModal = (parcel) => {
    setFavModalParcel(parcel);
    setSaveFavModalVisible(true);
  };

  const handleSaveFavoriteParcel = async (parcel, customName, notes) => {
    try {
      await saveFavorite(parcel, customName, notes);
      Alert.alert('Favorito Guardado', `"${customName}" se ha guardado en tus favoritos.`);
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar el favorito.');
    }
  };

  const handleSelectFavorite = async (item) => {
    const targetRef = item.ref20 || item.refCat;
    setQuery(item.customName || item.address);
    if (item.region && item.region !== selectedRegion) {
      changeRegion(item.region);
    }

    if (item.lat && item.lon) {
      mapViewerRef.current?.postMessage({
        type: 'MOVE_TO',
        lat: item.lat,
        lon: item.lon,
        ref: targetRef
      });
      await fetchFullParcelDetails(targetRef, item.lat, item.lon, item.region || selectedRegion);
    } else {
      // Buscar coordenadas por RC
      onSelectSuggestion({ isRC: true, rc: targetRef });
    }
  };

  // --- Búsqueda Rústica ---
  const handleSelectRusticParcel = async ({ lat, lon, ref, address }) => {
    setQuery(address || ref);
    saveRecentSearch(address || ref);

    mapViewerRef.current?.postMessage({
      type: 'MOVE_TO',
      lat,
      lon,
      ref
    });

    await fetchFullParcelDetails(ref, lat, lon, selectedRegion);
  };

  // --- Ficha Oficial y DNI ---
  const saveUserDni = async (dniToSave) => {
    const clean = String(dniToSave || '').trim().toUpperCase();
    setSavedDni(clean);
    setDniModalVisible(false);
    try {
      await AsyncStorage.setItem('@catastro_user_dni', clean);
    } catch (e) {}

    if (pendingFichaItem) {
      const itm = pendingFichaItem;
      setPendingFichaItem(null);
      executeOpenOfficialFicha(itm, clean);
    }
  };

  const openOfficialFicha = async (item) => {
    if (selectedRegion === 'BI' && !savedDni) {
      setPendingFichaItem(item);
      setDniModalVisible(true);
      return;
    }
    await executeOpenOfficialFicha(item, savedDni);
  };

  const executeOpenOfficialFicha = async (item, dni) => {
    const ref = item.ref20 || item.refCat;
    if (selectedRegion === 'BI') {
      const clean = String(ref || '').replace(/\s+/g, '');
      const isBienInmueble = clean.length === 20;
      let finalRef = clean;
      
      if (!isBienInmueble && clean.length >= 12) {
        finalRef = `${clean.substring(0, 3)} ${clean.substring(3, 7)} ${clean.substring(7, 12)}`;
      }

      let numFijo = '';
      if (item.interior) {
        const nfMatch = item.interior.match(/Nº\s*Fijo:\s*([A-Z0-9]+)/i);
        if (nfMatch) numFijo = nfMatch[1];
      }

      let door = '';
      if (item.interior) {
        door = item.interior.split('·')[0].trim();
      }

      const cargo = item.cargo || '';
      const title = door ? `Ficha · ${door}` : (item.address || 'Ficha Catastral · Bizkaia');

      setFichaTitle(title);
      setFichaInjectedJs(getBizkaiaInjectedJs(dni || '12345678Z', finalRef, isBienInmueble, numFijo, door, cargo));
      setFichaWebViewUrl('https://appsec.ebizkaia.eus/O4GC000C/vistas/fichaCatastral.xhtml?language=es');
      setFichaWebViewVisible(true);
      return;
    }
    
    if (selectedRegion === 'SS') {
      const clean = String(ref || '').replace(/\s+/g, '');
      const munCode = item.mun || '69';
      const fincaId = item.fincaId || '';
      const codDigito = item.codDigito || '';
      const targetRef = item.refCat || clean;
      const title = item.interior ? `Finca · ${item.interior.split('(')[0].trim()}` : (item.address || 'Ficha Catastral · Gipuzkoa');

      setFichaTitle(title);
      setFichaInjectedJs(getGipuzkoaInjectedJs(fincaId, codDigito));
      setFichaWebViewUrl(`https://ssl6.gipuzkoa.eus/Catastro/tooltip/urbana.aspx?id=${encodeURIComponent(targetRef)}&idioma=esp&aytoId=${encodeURIComponent(munCode)}&herr=1`);
      setFichaWebViewVisible(true);
      return;
    }

    if (item.subareaCode && item.ref20 && selectedRegion === 'VI') {
      try {
        Clipboard.setString(item.ref20);
        Alert.alert('Copiado', `Referencia copiada al portapapeles:\n${item.ref20}\n\nPuedes usar "Buscar" en la web para localizarla.`);
      } catch (e) {}
    }
    await cadastreService.openOfficialFicha(ref, item.del, item.mun, item.parCode, item.subareaCode, selectedRegion, item.polCode, dni);
  };

  const handleSharePdf = async () => {
    try {
      if (fichaPdfDataUrl) {
        const base64Data = fichaPdfDataUrl.split(',')[1] || fichaPdfDataUrl;
        const fileName = 'Ficha_Catastral_' + (fichaTitle || 'Bizkaia').replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';
        const fileUri = FileSystem.documentDirectory + fileName;

        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Guardar o Compartir Ficha Catastral'
          });
        }
      } else if (fichaPdfUrl) {
        await Share.share({
          title: 'Ficha Catastral Oficial',
          message: fichaPdfUrl,
          url: fichaPdfUrl
        });
      }
    } catch (error) {
      console.error('Error compartiendo PDF:', error);
    }
  };

  const handleFichaMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'PDF_BASE64') {
        setFichaPdfDataUrl(data.dataUrl);
        if (data.url) setFichaPdfUrl(data.url);
      } else if (data.type === 'PDF_READY' && data.url) {
        const urlLower = data.url.toLowerCase();
        if (!urlLower.includes('recaptcha') && !urlLower.includes('google.com') && !urlLower.includes('gstatic') && !urlLower.includes('about:blank')) {
          setFichaPdfUrl(data.url);
        }
      } else if (data.type === 'TRIGGER_SHARE') {
        handleSharePdf();
      }
    } catch (e) {}
  };

  // --- Consultas Catastrales ---
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
      const data = await cadastreService.fetchFullParcelDetails(refCat, lat, lon, targetRegion, savedDni);
      setSubparcels(data.subparcels || []);
      setParcelDetails(data.parcelDetails);

      cadastreService.fetchParcelGeometry(refCat, lat, lon, targetRegion)
        .then((verts) => {
          if (verts && verts.length > 0) {
            mapViewerRef.current?.postMessage({
              type: 'REGISTER_PARCEL_VERTICES',
              vertices: verts
            });
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

  const fetchParcelByCoords = async (lat, lon, regionOverride) => {
    setLoading(true);
    const detectedRegion = cadastreService.detectRegionFromCoords(lat, lon);
    const targetRegion = regionOverride || detectedRegion;

    if (targetRegion !== selectedRegion) {
      changeRegion(targetRegion);
    }

    mapViewerRef.current?.postMessage({
      type: 'MOVE_TO',
      lat,
      lon
    });

    try {
      const result = await cadastreService.fetchParcelByCoords(lat, lon, targetRegion);

      if (result && result.found) {
        setSelectedParcel({ lat, lon, ref: result.ref });

        mapViewerRef.current?.postMessage({
          type: 'MOVE_TO',
          lat,
          lon,
          ref: result.ref
        });

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

  // --- Buscador de Direcciones y Referencias ---
  const handleSearchTextChange = (text) => {
    setQuery(text);
    setShowRecent(false);
    if (typingTimer.current) clearTimeout(typingTimer.current);

    if (text.length < 3) {
      setSuggestions([]);
      return;
    }

    const cleanText = text.trim().toUpperCase();

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
          // Fallback a Nominatim
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
      mapViewerRef.current?.postMessage({
        type: 'CHANGE_REGION',
        wmsUrl: cadastreService.getWMSUrl(newRegion),
        wmsLayers: cadastreService.getWMSLayers(newRegion),
        layerType: cadastreService.getWMSLayerType(newRegion)
      });
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
          mapViewerRef.current?.postMessage({
            type: 'MOVE_TO',
            lat: result.lat,
            lon: result.lon,
            ref: item.rc
          });

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

    setQuery(item.display_name);
    saveRecentSearch(item.display_name);

    if (item.region && item.region !== selectedRegion) {
      changeRegion(item.region);
    }

    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);

    mapViewerRef.current?.postMessage({
      type: 'MOVE_TO',
      lat,
      lon
    });

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

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. Barra Superior: Buscador O Panel de Medición */}
      {!measureMode ? (
        <SearchBar
          query={query}
          setQuery={setQuery}
          onSearchTextChange={handleSearchTextChange}
          onExecuteSearch={executeSearch}
          onClearInput={clearInputText}
          suggestions={suggestions}
          onSelectSuggestion={onSelectSuggestion}
          recentSearches={recentSearches}
          showRecent={showRecent}
          setShowRecent={setShowRecent}
          onRemoveRecentSearch={removeRecentSearch}
          onClearAllRecent={clearAllRecent}
          loading={loading}
          selectedRegion={selectedRegion}
          onChangeRegion={changeRegion}
          onOpenRusticModal={() => setRusticModalVisible(true)}
          onOpenFavoritesModal={() => setFavModalVisible(true)}
        />
      ) : (
        <MeasurePanel
          measureMode={measureMode}
          startMeasureMode={startMeasureMode}
          exitMeasureMode={exitMeasureMode}
          measureStats={measureStats}
          snapEnabled={snapEnabled}
          toggleSnap={toggleSnap}
          undoMeasurePoint={undoMeasurePoint}
          clearMeasurePoints={clearMeasurePoints}
          onOpenSaveModal={() => setSaveMeasureModalVisible(true)}
          onOpenSavedModal={() => setSavedMeasuresModalVisible(true)}
          onExportKml={handleExportKmlCurrent}
          onImportKml={handleImportKml}
        />
      )}

      {/* 2. Visor de Mapas Leaflet + WMS Catastro */}
      <MapViewer
        ref={mapViewerRef}
        onMapClick={(lat, lon) => fetchParcelByCoords(lat, lon)}
        onMapMoved={(lat, lon) => {
          if (lat && lon) {
            const detected = cadastreService.detectRegionFromCoords(lat, lon);
            if (detected !== selectedRegion) {
              changeRegion(detected);
            }
          }
        }}
        onMeasureUpdate={(data) => {
          setMeasureStats({
            distance: data.distance || 0,
            area: data.area || 0,
            perimeter: data.perimeter || 0,
            pointsCount: data.pointsCount || 0,
            snapped: !!data.snapped
          });
          if (data.points) {
            setCurrentMeasurePoints(data.points);
          }
        }}
        onMeasureTapGeoquery={(lat, lon) => {
          if (snapEnabled && lat && lon) {
            const region = cadastreService.detectRegionFromCoords(lat, lon);
            cadastreService.fetchParcelGeometry(null, lat, lon, region)
              .then((vertices) => {
                if (vertices && vertices.length > 0) {
                  mapViewerRef.current?.postMessage({
                    type: 'REGISTER_PARCEL_VERTICES',
                    vertices: vertices
                  });
                }
              })
              .catch(() => {});
          }
        }}
      />

      {/* 3. Botonera Flotante Lateral Derecha */}
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
          style={[styles.floatingGpsBtn, isLiveTracking && styles.floatingGpsBtnActive]}
          onPress={toggleLiveTracking}
        >
          <Text style={styles.floatingGpsIcon}>{isLiveTracking ? '🧭' : '🎯'}</Text>
          <Text style={[styles.floatingGpsLabel, isLiveTracking && { color: '#0066cc', fontWeight: 'bold' }]}>
            {isLiveTracking ? 'En Vivo' : 'Ubicación'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 4. Modales de la Aplicación */}
      <LayersModal
        visible={showLayersModal}
        onClose={() => setShowLayersModal(false)}
        activeBaseLayer={activeBaseLayer}
        onSelectBaseLayer={handleSelectBaseLayer}
        catastroVisible={catastroVisible}
        onToggleCatastro={handleToggleCatastro}
        catastroOpacity={catastroOpacity}
        onSetCatastroOpacity={handleSetCatastroOpacity}
        ignLabelsVisible={ignLabelsVisible}
        onToggleIgnLabels={handleToggleIgnLabels}
      />

      <RusticSearchModal
        visible={rusticModalVisible}
        onClose={() => setRusticModalVisible(false)}
        onSelectParcel={handleSelectRusticParcel}
        selectedRegion={selectedRegion}
      />

      <FavoritesModal
        visible={favModalVisible}
        onClose={() => setFavModalVisible(false)}
        onSelectFavorite={handleSelectFavorite}
      />

      <SaveFavoriteModal
        visible={saveFavModalVisible}
        onClose={() => setSaveFavModalVisible(false)}
        parcel={favModalParcel}
        onSave={handleSaveFavoriteParcel}
      />

      <SaveMeasurementModal
        visible={saveMeasureModalVisible}
        onClose={() => setSaveMeasureModalVisible(false)}
        measurementData={{
          mode: measureMode,
          points: currentMeasurePoints,
          stats: measureStats
        }}
        onSave={handleSaveActiveMeasurement}
      />

      <SavedMeasurementsModal
        visible={savedMeasuresModalVisible}
        onClose={() => setSavedMeasuresModalVisible(false)}
        onLoadMeasurement={handleLoadSavedMeasurement}
      />

      <DniModal
        visible={dniModalVisible}
        onClose={() => setDniModalVisible(false)}
        dniInput={dniInput}
        setDniInput={setDniInput}
        onSaveDni={saveUserDni}
      />

      <FichaWebViewModal
        visible={fichaWebViewVisible}
        onClose={() => {
          setFichaWebViewVisible(false);
          setFichaPdfUrl(null);
          setFichaPdfDataUrl(null);
        }}
        title={fichaTitle}
        url={fichaWebViewUrl}
        injectedJs={fichaInjectedJs}
        pdfUrl={fichaPdfUrl}
        pdfDataUrl={fichaPdfDataUrl}
        onSharePdf={handleSharePdf}
        onMessage={handleFichaMessage}
      />

      {/* 5. Tarjeta Deslizante de Información Catastral */}
      <ParcelDetailsSheet
        parcelDetails={parcelDetails}
        subparcels={subparcels}
        showSubparcels={showSubparcels}
        setShowSubparcels={setShowSubparcels}
        selectedSubparcel={selectedSubparcel}
        setSelectedSubparcel={setSelectedSubparcel}
        subparcelFilter={subparcelFilter}
        setSubparcelFilter={setSubparcelFilter}
        selectedRegion={selectedRegion}
        onChangeRegion={changeRegion}
        cardAnimY={cardAnimY}
        panResponder={panResponder}
        onClose={() => {
          setParcelDetails(null);
          resetCardPosition();
        }}
        onOpenOfficialFicha={openOfficialFicha}
        onOpenSaveFavoriteModal={handleOpenSaveFavoriteModal}
        onCopyToClipboard={copyToClipboard}
        onExpandCard={expandCard}
        onResetCardPosition={resetCardPosition}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  mapButtonsStack: {
    position: 'absolute',
    right: 14,
    bottom: 30,
    zIndex: 90,
    gap: 10,
    alignItems: 'center',
  },
  floatingToolBtn: {
    backgroundColor: 'white',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  floatingToolBtnActive: {
    backgroundColor: '#e6f2ff',
    borderWidth: 1.5,
    borderColor: '#0066cc',
  },
  floatingToolIcon: {
    fontSize: 18,
  },
  floatingToolLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#333',
    marginTop: -2,
  },
  floatingGpsBtn: {
    backgroundColor: 'white',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  floatingGpsBtnActive: {
    backgroundColor: '#e6f2ff',
    borderWidth: 2,
    borderColor: '#0066cc',
  },
  floatingGpsIcon: {
    fontSize: 20,
  },
  floatingGpsLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#0066cc',
    marginTop: -2,
  },
});
