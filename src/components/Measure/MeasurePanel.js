import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity
} from 'react-native';
import { formatDistance, formatArea } from '../../utils/formatters';

const MeasurePanel = ({
  measureMode,
  startMeasureMode,
  exitMeasureMode,
  measureStats,
  snapEnabled,
  toggleSnap,
  undoMeasurePoint,
  clearMeasurePoints,
  onOpenSaveModal,
  onOpenSavedModal,
  onExportKml,
  onImportKml
}) => {
  const hasPoints = (measureStats?.pointsCount || 0) > 0;

  return (
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

      {/* Fila 1 de Acciones: Edición y Ajuste */}
      <View style={styles.measureActionsRow}>
        <TouchableOpacity
          style={[styles.measureActionBtn, !hasPoints && styles.btnDisabled]}
          onPress={undoMeasurePoint}
          disabled={!hasPoints}
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
          style={[styles.measureActionBtn, styles.measureActionBtnDanger, !hasPoints && styles.btnDisabled]}
          onPress={clearMeasurePoints}
          disabled={!hasPoints}
        >
          <Text style={[styles.measureActionBtnText, { color: '#cc0000' }]}>🗑 Limpiar</Text>
        </TouchableOpacity>
      </View>

      {/* Fila 2 de Acciones: Guardar, Historial, KML */}
      <View style={[styles.measureActionsRow, { marginTop: 6 }]}>
        <TouchableOpacity
          style={[styles.measureToolBtn, styles.measureToolBtnPrimary, !hasPoints && styles.btnDisabled]}
          onPress={onOpenSaveModal}
          disabled={!hasPoints}
        >
          <Text style={styles.measureToolBtnTextPrimary}>💾 Guardar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.measureToolBtn}
          onPress={onOpenSavedModal}
        >
          <Text style={styles.measureToolBtnText}>📂 Historial</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.measureToolBtn, !hasPoints && styles.btnDisabled]}
          onPress={onExportKml}
          disabled={!hasPoints}
        >
          <Text style={styles.measureToolBtnText}>📤 KML</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.measureToolBtn}
          onPress={onImportKml}
        >
          <Text style={styles.measureToolBtnText}>📥 Importar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
    gap: 6,
  },
  measureTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  measureTabActive: {
    backgroundColor: '#e6f2ff',
    borderWidth: 1,
    borderColor: '#0066cc',
  },
  measureTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  measureTabTextActive: {
    color: '#0066cc',
    fontWeight: 'bold',
  },
  measureExitBtn: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: '#fee',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fcc',
  },
  measureExitBtnText: {
    color: '#cc0000',
    fontWeight: 'bold',
    fontSize: 12,
  },
  measureDisplayBox: {
    backgroundColor: '#f9fbfd',
    borderWidth: 1,
    borderColor: '#e1ecf7',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginVertical: 4,
  },
  measureMainValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0066cc',
    textAlign: 'center',
  },
  measureSubText: {
    fontSize: 11,
    color: '#666',
    marginTop: 3,
    textAlign: 'center',
  },
  snapBadge: {
    marginTop: 6,
    backgroundColor: '#e6fffa',
    borderColor: '#38b2ac',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  snapBadgeText: {
    fontSize: 10,
    color: '#234e52',
    fontWeight: 'bold',
  },
  measureActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  measureActionBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  measureActionBtnSnapActive: {
    backgroundColor: '#e6fffa',
    borderColor: '#38b2ac',
  },
  measureActionBtnSnapInactive: {
    backgroundColor: '#f5f5f5',
  },
  measureActionBtnDanger: {
    backgroundColor: '#fff5f5',
    borderColor: '#feb2b2',
  },
  measureActionBtnText: {
    fontSize: 11,
    color: '#333',
    fontWeight: '600',
  },
  measureToolBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#f0f4f8',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d0dce5',
  },
  measureToolBtnPrimary: {
    backgroundColor: '#0066cc',
    borderColor: '#0055b3',
  },
  measureToolBtnText: {
    fontSize: 11,
    color: '#004080',
    fontWeight: 'bold',
  },
  measureToolBtnTextPrimary: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  btnDisabled: {
    opacity: 0.4,
  },
});

export default MeasurePanel;
