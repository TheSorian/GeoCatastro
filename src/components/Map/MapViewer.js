import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { getLeafletHtml } from './mapTemplate';

const MapViewer = forwardRef(({
  onMapClick,
  onMapMoved,
  onMeasureUpdate,
  onMeasureTapGeoquery,
  style
}, ref) => {
  const webViewRef = useRef(null);

  useImperativeHandle(ref, () => ({
    postMessage: (message) => {
      const msgStr = typeof message === 'string' ? message : JSON.stringify(message);
      webViewRef.current?.postMessage(msgStr);
    }
  }));

  const handleMessage = (e) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'MAP_CLICK') {
        onMapClick?.(data.lat, data.lon);
      } else if (data.type === 'MAP_MOVED') {
        onMapMoved?.(data.lat, data.lon);
      } else if (data.type === 'MEASURE_UPDATE') {
        onMeasureUpdate?.(data);
      } else if (data.type === 'MEASURE_TAP_GEOQUERY') {
        onMeasureTapGeoquery?.(data.lat, data.lon);
      }
    } catch (err) {
      console.warn('Error parseando mensaje de MapViewer:', err);
    }
  };

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: getLeafletHtml() }}
        style={styles.webView}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mixedContentMode="always"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: '#e5e3df',
  }
});

export default MapViewer;
