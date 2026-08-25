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

const SaveFavoriteModal = ({
  visible,
  onClose,
  parcel,
  onSave
}) => {
  const [customName, setCustomName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (visible && parcel) {
      setCustomName(parcel.customName || parcel.address || 'Mi Parcela');
      setNotes(parcel.notes || '');
    }
  }, [visible, parcel]);

  const handleSave = () => {
    if (!customName.trim()) {
      Alert.alert('Nombre requerido', 'Por favor asigna un nombre para identificar este favorito.');
      return;
    }
    onSave(parcel, customName.trim(), notes.trim());
    onClose();
  };

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
            <Text style={styles.title}>⭐ Guardar en Favoritos</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
            <View style={styles.parcelInfoBox}>
              <Text style={styles.infoAddress} numberOfLines={2}>{parcel?.address || 'Ubicación'}</Text>
              <Text style={styles.infoRef}>Ref: {parcel?.ref20 || parcel?.refCat || '-'}</Text>
            </View>

            <Text style={styles.fieldLabel}>Nombre Personalizado</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Casa del pueblo, Parcela olivar..."
              placeholderTextColor="#999"
              value={customName}
              onChangeText={setCustomName}
            />

            <Text style={styles.fieldLabel}>Notas Privadas (Opcional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Añade observaciones, contacto del dueño, tasación..."
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
    color: '#d48806',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#888',
    fontWeight: 'bold',
  },
  parcelInfoBox: {
    backgroundColor: '#fffbe6',
    borderWidth: 1,
    borderColor: '#ffe58f',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  infoAddress: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#874d00',
  },
  infoRef: {
    fontSize: 12,
    color: '#ad6800',
    marginTop: 3,
    fontFamily: 'monospace',
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
    backgroundColor: '#faad14',
    borderRadius: 8,
    alignItems: 'center',
  },
  btnSaveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
});

export default SaveFavoriteModal;
