import React, { useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Platform,
  Linking
} from 'react-native';
import { WebView } from 'react-native-webview';

const FichaWebViewModal = ({
  visible,
  onClose,
  title,
  url,
  injectedJs,
  pdfUrl,
  pdfDataUrl,
  onSharePdf,
  onMessage
}) => {
  const webViewRef = useRef(null);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#cc0000" translucent={true} />
        
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title || 'Ficha Catastral'}
          </Text>

          <View style={styles.headerButtonsRow}>
            {(pdfDataUrl || pdfUrl) && (
              <TouchableOpacity
                onPress={onSharePdf}
                style={styles.btnShare}
              >
                <Text style={styles.btnShareText}>📤 Guardar / Compartir</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={onClose}
              style={styles.btnClose}
            >
              <Text style={styles.btnCloseText}>Cerrar ✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.webViewContainer}>
          {visible && (
            <WebView
              ref={webViewRef}
              source={{ uri: url }}
              injectedJavaScript={injectedJs}
              onMessage={onMessage}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              allowFileAccess={true}
              allowFileAccessFromFileURLs={true}
              allowUniversalAccessFromFileURLs={true}
              setSupportMultipleWindows={false}
              javaScriptCanOpenWindowsAutomatically={true}
              startInLoadingState={true}
              scalesPageToFit={true}
              originWhitelist={['*']}
              mixedContentMode="always"
              onShouldStartLoadWithRequest={(request) => {
                if (
                  request.url.endsWith('.pdf') ||
                  request.url.includes('blob:') ||
                  request.url.startsWith('intent:') ||
                  request.url.startsWith('market:')
                ) {
                  Linking.openURL(request.url).catch(() => {});
                  return false;
                }
                return true;
              }}
              renderLoading={() => (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#cc0000" />
                  <Text style={styles.loadingText}>Cargando y autorrellenando Ficha...</Text>
                </View>
              )}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#cc0000',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#cc0000',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    flex: 1,
  },
  headerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnShare: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  btnShareText: {
    color: '#cc0000',
    fontWeight: 'bold',
    fontSize: 12,
  },
  btnClose: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnCloseText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  webViewContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontWeight: '600',
  },
});

export default FichaWebViewModal;
