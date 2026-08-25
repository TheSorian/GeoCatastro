import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity
} from 'react-native';

const DniModal = ({
  visible,
  onClose,
  dniInput,
  setDniInput,
  onSaveDni
}) => {
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
            <Text style={styles.title}>🆔 NIF / DNI Solicitante</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            La Sede Oficial de Bizkaia requiere el NIF del solicitante para generar y descargar fichas catastrales oficiales.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Ej: 12345678Z"
            placeholderTextColor="#999"
            value={dniInput}
            onChangeText={setDniInput}
            autoCapitalize="characters"
            maxLength={9}
          />

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.btnCancel}
              onPress={onClose}
            >
              <Text style={styles.btnCancelText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnSave}
              onPress={() => onSaveDni(dniInput)}
            >
              <Text style={styles.btnSaveText}>Guardar y Abrir</Text>
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
    maxWidth: 400,
    padding: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#888',
    fontWeight: 'bold',
  },
  description: {
    fontSize: 13,
    color: '#555',
    marginVertical: 10,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#0066cc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'center',
    backgroundColor: '#f8fafd',
    color: '#111',
    marginVertical: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#888',
    borderRadius: 8,
    alignItems: 'center',
  },
  btnCancelText: {
    color: 'white',
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
    color: 'white',
    fontWeight: 'bold',
    fontSize: 13,
  },
});

export default DniModal;
