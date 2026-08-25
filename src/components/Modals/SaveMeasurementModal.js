import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert
} from 'react-native';
import { formatArea, formatDistance } from '../../utils/formatters';

const SaveMeasurementModal = ({
  visible,
  onClose,
  measurementData,
  onSave
}) => {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (visible && measurementData) {
      const mode = measurementData.mode;
      const stats = measurementData.stats || {};
      const defaultName = mode === 'area'
        ? `Polígono ${formatArea(stats.area || 0)}`
        : `Línea ${formatDistance(stats.distance || 0)}`;
      setName(measurementData.name || defaultName);
      setNotes(measurementData.notes || '');
    }
  }, [visible, measurementData]);

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Nombre requerido', 'Por favor introduce un nombre para la medición.');
      return;
    }
    onSave({
      ...measurementData,
      name: name.trim(),
      notes: notes.trim()
    });
    onClose();
  };

  const stats = measurementData?.stats || {};
  const isArea = measurementData?.mode === 'area';

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <Text style={styles.title}>💾 Guardar Medición</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            <View style={styles.statsSummaryBox}>
              {isArea ? (
                <>
                  <Text style={styles.summaryItem}>📐 <Text style={styles.boldText}>Área:</Text> {formatArea(stats.area || 0)}</Text>
                  <Text style={styles.summaryItem}>📏 <Text style={styles.boldText}>Perímetro:</Text> {formatDistance(stats.perimeter || 0)}</Text>
                </>
              ) : (
                <Text style={styles.summaryItem}>📏 <Text style={styles.boldText}>Distancia Total:</Text> {formatDistance(stats.distance || 0)}</Text>
              )}
              <Text style={styles.summaryItem}>📍 <Text style={styles.boldText}>Vértices:</Text> {stats.pointsCount || measurementData?.points?.length || 0}</Text>
            </View>

            <Text style={styles.fieldLabel}>Nombre de la Medición</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Vallado finca norte, Zona huerto..."
              placeholderTextColor="#999"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.fieldLabel}>Notas Privadas (Opcional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Añade observaciones, metros de alambre, tipo de terreno..."
              placeholderTextColor="#999"
              value={notes}
              onChangeText={setNotes}
              multiline={true}
              numberOfLines={3}
            />
          </ScrollView>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.btnCancel} onPress={onClose}>
              <Text style={styles.btnCancelText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnSave} onPress={handleSave}>
              <Text style={styles.btnSaveText}>Guardar</Text>
            </TouchableOpacity>
          </View>
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
  modalCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '100%',
    maxWidth: 420,
    padding: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0066cc',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#888',
    fontWeight: 'bold',
  },
  statsSummaryBox: {
    backgroundColor: '#f0f7ff',
    borderWidth: 1,
    borderColor: '#cce3ff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  summaryItem: {
    fontSize: 13,
    color: '#004080',
    marginVertical: 2,
  },
  boldText: {
    fontWeight: 'bold',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    backgroundColor: '#fafafa',
    color: '#111',
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#eee',
    borderRadius: 8,
    alignItems: 'center',
  },
  btnCancelText: {
    color: '#666',
    fontWeight: 'bold',
    fontSize: 13,
  },
  btnSave: {
    flex: 2,
    paddingVertical: 12,
    backgroundColor: '#0066cc',
    borderRadius: 8,
    alignItems: 'center',
  },
  btnSaveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
});

export default SaveMeasurementModal;
