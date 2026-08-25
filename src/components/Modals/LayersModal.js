import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch
} from 'react-native';

const LayersModal = ({
  visible,
  onClose,
  activeBaseLayer,
  onSelectBaseLayer,
  catastroVisible,
  onToggleCatastro,
  catastroOpacity,
  onSetCatastroOpacity,
  ignLabelsVisible,
  onToggleIgnLabels
}) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.layersModalCard}>
          <View style={styles.layersModalHeader}>
            <Text style={styles.layersModalTitle}>🥞 Capas del Mapa</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }}>
            {/* Sección 1: Mapa Base */}
            <Text style={styles.layersSectionTitle}>MAPA BASE</Text>
            <View style={styles.baseLayersGrid}>
              <TouchableOpacity
                style={[styles.baseLayerCard, activeBaseLayer === 'osm' && styles.baseLayerCardActive]}
                onPress={() => onSelectBaseLayer('osm')}
              >
                <Text style={styles.baseLayerIcon}>🗺️</Text>
                <Text style={[styles.baseLayerText, activeBaseLayer === 'osm' && styles.baseLayerTextActive]}>
                  Callejero (OSM)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.baseLayerCard, activeBaseLayer === 'ign_base' && styles.baseLayerCardActive]}
                onPress={() => onSelectBaseLayer('ign_base')}
              >
                <Text style={styles.baseLayerIcon}>🇪🇸</Text>
                <Text style={[styles.baseLayerText, activeBaseLayer === 'ign_base' && styles.baseLayerTextActive]}>
                  Topográfico (IGN)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.baseLayerCard, activeBaseLayer === 'ign_pnoa' && styles.baseLayerCardActive]}
                onPress={() => onSelectBaseLayer('ign_pnoa')}
              >
                <Text style={styles.baseLayerIcon}>🛰️</Text>
                <Text style={[styles.baseLayerText, activeBaseLayer === 'ign_pnoa' && styles.baseLayerTextActive]}>
                  Ortofoto PNOA (IGN)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.baseLayerCard, activeBaseLayer === 'esri_sat' && styles.baseLayerCardActive]}
                onPress={() => onSelectBaseLayer('esri_sat')}
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
                  onValueChange={onToggleCatastro}
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
                        onPress={() => onSetCatastroOpacity(val)}
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
                  onValueChange={onToggleIgnLabels}
                  trackColor={{ false: '#ccc', true: '#99c2ff' }}
                  thumbColor={ignLabelsVisible ? '#0066cc' : '#f4f4f4'}
                />
              </View>
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.modalAcceptBtn} onPress={onClose}>
            <Text style={styles.modalAcceptBtnText}>Aceptar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  layersModalCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '100%',
    maxWidth: 420,
    padding: 18,
    elevation: 10,
  },
  layersModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  layersModalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseBtnText: {
    fontSize: 16,
    color: '#888',
    fontWeight: 'bold',
  },
  layersSectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#888',
    letterSpacing: 1,
    marginBottom: 8,
  },
  baseLayersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  baseLayerCard: {
    width: '48%',
    backgroundColor: '#f8f9fa',
    borderWidth: 1.5,
    borderColor: '#e9ecef',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  baseLayerCardActive: {
    borderColor: '#0066cc',
    backgroundColor: '#e6f2ff',
  },
  baseLayerIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  baseLayerText: {
    fontSize: 11,
    color: '#555',
    textAlign: 'center',
    fontWeight: '500',
  },
  baseLayerTextActive: {
    color: '#0066cc',
    fontWeight: 'bold',
  },
  overlayItemBox: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 10,
    padding: 12,
  },
  overlayItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overlayItemTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
  overlayItemSub: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  opacityControlsContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  opacityLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 6,
    fontWeight: '600',
  },
  opacityPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  opacityPill: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#eee',
    alignItems: 'center',
  },
  opacityPillActive: {
    backgroundColor: '#0066cc',
  },
  opacityPillText: {
    fontSize: 11,
    color: '#555',
    fontWeight: '600',
  },
  opacityPillTextActive: {
    color: 'white',
    fontWeight: 'bold',
  },
  modalAcceptBtn: {
    marginTop: 16,
    backgroundColor: '#0066cc',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalAcceptBtnText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 13,
  },
});

export default LayersModal;
