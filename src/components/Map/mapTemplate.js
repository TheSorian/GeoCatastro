/**
 * Plantilla HTML/CSS/JavaScript completa de Leaflet para el Visor de Mapas
 */
export const getLeafletHtml = () => `
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

    /* Estilos del Punto Azul con Cono de Rumbo estilo Google Maps */
    .user-location-wrapper {
      position: relative;
      width: 64px;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    .user-pulse-ring {
      position: absolute;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background-color: rgba(26, 115, 232, 0.35);
      animation: pulse-ring 2s infinite ease-out;
      z-index: 1;
    }

    .user-heading-cone {
      position: absolute;
      width: 64px;
      height: 64px;
      top: 0;
      left: 0;
      transform-origin: 32px 32px;
      transition: transform 0.1s linear;
      z-index: 2;
      pointer-events: none;
    }

    .user-dot-core {
      position: absolute;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background-color: #1a73e8;
      border: 3px solid #ffffff;
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.45);
      z-index: 3;
    }

    @keyframes pulse-ring {
      0% { transform: scale(0.5); opacity: 1; }
      70% { transform: scale(1.5); opacity: 0.15; }
      100% { transform: scale(1.7); opacity: 0; }
    }
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

    // --- Capas Base ---
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

    // --- Capa Catastral Unificada ---
    var currentWMSUrl = 'https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx';
    var currentWMSLayers = 'catastro';
    var currentLayerType = 'wms';
    var catastroVisible = true;
    var catastroOpacity = 0.85;

    var ArcGISExportLayer = L.GridLayer.extend({
      options: { tileSize: 256, opacity: 0.85, zIndex: 10, maxZoom: 24 },
      createTile: function(coords, done) {
        var tile = document.createElement('img');
        var tileSize = this.getTileSize().x;
        var R = 20037508.342789244;
        var n = Math.pow(2, coords.z);
        var ts = 2 * R / n;
        var minX = coords.x * ts - R;
        var maxX = (coords.x + 1) * ts - R;
        var maxY = R - coords.y * ts;
        var minY = R - (coords.y + 1) * ts;
        var bbox = minX + ',' + minY + ',' + maxX + ',' + maxY;
        var baseUrl = currentWMSUrl;
        tile.src = baseUrl + '?bbox=' + bbox + '&bboxSR=3857&layers=show%3A38,39,40,42&size=' + tileSize + ',' + tileSize + '&imageSR=3857&format=png8&transparent=true&f=image&dpi=96';
        tile.onload = function() { done(null, tile); };
        tile.onerror = function(e) { done(e, tile); };
        tile.style.opacity = catastroOpacity;
        return tile;
      }
    });

    var catastroWMS = null;

    function buildWMSLayer() {
      return L.tileLayer.wms(currentWMSUrl, {
        layers: currentWMSLayers,
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        maxZoom: 24,
        opacity: catastroOpacity,
        zIndex: 10
      });
    }

    function buildExportLayer() {
      return new ArcGISExportLayer({ opacity: catastroOpacity, zIndex: 10 });
    }

    catastroWMS = buildWMSLayer().addTo(map);

    function refreshCatastroLayer() {
      if (catastroWMS) map.removeLayer(catastroWMS);
      if (catastroVisible) {
        catastroWMS = (currentLayerType === 'arcgis_export') ? buildExportLayer() : buildWMSLayer();
        catastroWMS.addTo(map);
        if (catastroWMS.bringToFront) catastroWMS.bringToFront();
      }
    }

    var currentMarker = null;

    // --- Marcador de Ubicación del Usuario con Brújula / Rumbo ---
    var userLocationMarker = null;

    function buildUserIconHtml(heading, showHeading) {
      var rot = (heading !== undefined && heading !== null && !isNaN(heading)) ? heading : 0;
      var isVisible = !!showHeading;
      return '<div class="user-location-wrapper">' +
        '<div class="user-pulse-ring"></div>' +
        '<div class="user-heading-cone" id="userHeadingCone" style="display: ' + (isVisible ? 'block' : 'none') + '; transform: rotate(' + rot + 'deg);">' +
          '<svg width="64" height="64" viewBox="0 0 64 64" style="display:block; overflow:visible;">' +
            '<defs>' +
              '<radialGradient id="beamGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">' +
                '<stop offset="0%" stop-color="#1a73e8" stop-opacity="0.8"/>' +
                '<stop offset="55%" stop-color="#4285f4" stop-opacity="0.32"/>' +
                '<stop offset="100%" stop-color="#4285f4" stop-opacity="0.0"/>' +
              '</radialGradient>' +
            '</defs>' +
            '<path d="M 32 32 L 8 2 A 34 34 0 0 1 56 2 Z" fill="url(#beamGradient)" />' +
          '</svg>' +
        '</div>' +
        '<div class="user-dot-core"></div>' +
      '</div>';
    }

    function updateUserLocationMarker(lat, lon, heading, showHeading) {
      if (!lat || !lon) return;
      var ll = [lat, lon];
      var rot = (heading !== undefined && heading !== null && !isNaN(heading)) ? heading : 0;
      var isVisible = !!showHeading;

      if (!userLocationMarker) {
        var userIcon = L.divIcon({
          className: 'user-location-div-icon',
          html: buildUserIconHtml(rot, isVisible),
          iconSize: [64, 64],
          iconAnchor: [32, 32]
        });
        userLocationMarker = L.marker(ll, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
      } else {
        userLocationMarker.setLatLng(ll);
        var coneEl = document.getElementById('userHeadingCone');
        if (coneEl) {
          coneEl.style.display = isVisible ? 'block' : 'none';
          if (isVisible) {
            coneEl.style.transform = 'rotate(' + rot + 'deg)';
          }
        }
      }
    }

    // --- Sistema de Medición y Ajuste Magnético (Snapping) ---
    var measureMode = null; // null | 'distance' | 'area'
    var snapEnabled = true;
    var cachedParcelVertices = [];
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

    function computePolygonArea(coords) {
      if (!coords || coords.length < 3) return 0;
      var len = coords.length;
      var avgLat = 0;
      for (var i = 0; i < len; i++) {
        var pt = coords[i];
        avgLat += (pt.lat !== undefined ? pt.lat : pt[0]);
      }
      avgLat = (avgLat / len) * (Math.PI / 180);
      
      var kx = 111319.49079327357 * Math.cos(avgLat);
      var ky = 111132.954;
      
      var area = 0;
      for (var j = 0; j < len; j++) {
        var c1 = coords[j];
        var c2 = coords[(j + 1) % len];
        var lat1 = c1.lat !== undefined ? c1.lat : c1[0];
        var lng1 = c1.lng !== undefined ? c1.lng : (c1.lon !== undefined ? c1.lon : c1[1]);
        var lat2 = c2.lat !== undefined ? c2.lat : c2[0];
        var lng2 = c2.lng !== undefined ? c2.lng : (c2.lon !== undefined ? c2.lon : c2[1]);
        
        var x1 = lng1 * kx;
        var y1 = lat1 * ky;
        var x2 = lng2 * kx;
        var y2 = lat2 * ky;
        area += (x1 * y2 - x2 * y1);
      }
      return Math.abs(area / 2.0);
    }

    function updateMeasureGraphics(wasSnapped) {
      measureMarkers.forEach(function(m) { map.removeLayer(m); });
      measureMarkers = [];
      if (measureLineOrPolygon) {
        map.removeLayer(measureLineOrPolygon);
        measureLineOrPolygon = null;
      }

      if (measurePoints.length === 0) {
        notifyRNMeasureUpdate(0, 0, 0, 0, false, []);
        return;
      }

      var totalDistance = 0;
      var totalArea = 0;
      var totalPerimeter = 0;

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
          totalDistance += L.latLng(measurePoints[j]).distanceTo(L.latLng(measurePoints[j + 1]));
        }
        if (measurePoints.length >= 2) {
          measureLineOrPolygon = L.polyline(measurePoints, {
            color: '#e63946',
            weight: 3.5,
            dashArray: '6, 6',
            opacity: 0.95
          }).addTo(map);
        }
        notifyRNMeasureUpdate(totalDistance, 0, 0, measurePoints.length, wasSnapped, measurePoints);
      } else if (measureMode === 'area') {
        if (measurePoints.length >= 3) {
          totalArea = computePolygonArea(measurePoints);
          for (var k = 0; k < measurePoints.length; k++) {
            totalPerimeter += L.latLng(measurePoints[k]).distanceTo(L.latLng(measurePoints[(k + 1) % measurePoints.length]));
          }
          measureLineOrPolygon = L.polygon(measurePoints, {
            color: '#0066cc',
            weight: 2.5,
            fillColor: '#0066cc',
            fillOpacity: 0.3,
            dashArray: '4, 4'
          }).addTo(map);
        } else if (measurePoints.length === 2) {
          totalPerimeter = L.latLng(measurePoints[0]).distanceTo(L.latLng(measurePoints[1]));
          measureLineOrPolygon = L.polyline(measurePoints, {
            color: '#0066cc',
            weight: 2.5,
            dashArray: '4, 4',
            opacity: 0.8
          }).addTo(map);
        }
        notifyRNMeasureUpdate(totalPerimeter, totalArea, totalPerimeter, measurePoints.length, wasSnapped, measurePoints);
      }
    }

    function notifyRNMeasureUpdate(dist, area, perim, count, snapped, points) {
      try {
        var cleanPoints = (points || []).map(function(p) {
          return { lat: p.lat, lng: p.lng };
        });
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'MEASURE_UPDATE',
          distance: dist,
          area: area,
          perimeter: perim,
          pointsCount: count,
          snapped: !!snapped,
          points: cleanPoints
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
          currentWMSLayers = data.wmsLayers || 'catastro';
          currentLayerType = data.layerType || 'wms';
          refreshCatastroLayer();
        } else if (data.type === 'MOVE_TO') {
          var targetZoom = data.zoom || Math.min(Math.max(map.getZoom(), 19), 24);
          map.setView([data.lat, data.lon], targetZoom);
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
        } else if (data.type === 'APPEND_MEASURE_POINT') {
          if (!measureMode) measureMode = data.mode || 'distance';
          var newLL = L.latLng(data.lat, data.lon);
          measurePoints.push(newLL);
          updateMeasureGraphics(false);
          if (data.follow) {
            map.panTo(newLL);
          }
        } else if (data.type === 'UPDATE_USER_LOCATION') {
          updateUserLocationMarker(data.lat, data.lon, data.heading, data.showHeading);
          if (data.follow) {
            map.setView([data.lat, data.lon], Math.max(map.getZoom(), 18));
          }
        } else if (data.type === 'LOAD_GEOMETRY') {
          // Carga una medición externa o importada de KML
          measureMode = data.mode || (data.points.length >= 3 ? 'area' : 'distance');
          measurePoints = [];
          for (var p = 0; p < data.points.length; p++) {
            var ptObj = data.points[p];
            measurePoints.push(L.latLng(ptObj.lat, ptObj.lng || ptObj.lon));
          }
          updateMeasureGraphics(false);
          if (measurePoints.length > 0) {
            var bounds = L.latLngBounds(measurePoints);
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 20 });
          }
        }
      } catch(e) {}
    }

    window.addEventListener('message', handleRNMessage);
    document.addEventListener('message', handleRNMessage);

    map.on('moveend', function() {
      var center = map.getCenter();
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'MAP_MOVED',
        lat: center.lat,
        lon: center.lng
      }));
      if (measureMode && snapEnabled) {
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
