import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import PhotoViewerModal from './PhotoViewerModal';

const SaveFavoriteModal = ({
  visible,
  onClose,
  parcel,
  onSave
}) => {
  const [customName, setCustomName] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const [previewPhotoUri, setPreviewPhotoUri] = useState(null);
  const [showPickerChoice, setShowPickerChoice] = useState(false);

  useEffect(() => {
    if (visible && parcel) {
      setCustomName(parcel.customName || parcel.address || 'Mi Parcela');
      setNotes(parcel.notes || '');
      setPhotos(parcel.photos || []);
    }
  }, [visible, parcel]);

  const handlePickFromDocumentPicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'image/webp', 'image/*'],
        copyToCacheDirectory: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const newPhoto = {
          uri: file.uri,
          name: file.name || 'foto.jpg',
          size: file.size,
          timestamp: Date.now()
        };
        setPhotos(prev => [...prev, newPhoto]);
      }
    } catch (err) {
      Alert.alert('Error', 'No se pudo seleccionar la imagen.');
    }
  };

  const handleTakePhoto = async () => {
    setShowPickerChoice(false);
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permiso de Cámara', 'Se necesita permiso de cámara para tomar fotos directamente.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const newPhoto = {
          uri: asset.uri,
          name: asset.fileName || 'foto_camara.jpg',
          size: asset.fileSize,
          timestamp: Date.now()
        };
        setPhotos(prev => [...prev, newPhoto]);
      }
    } catch (e) {
      // Fallback a DocumentPicker si ImagePicker falla en entorno no soportado
      handlePickFromDocumentPicker();
    }
  };

  const handlePickFromGallery = async () => {
    setShowPickerChoice(false);
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        return handlePickFromDocumentPicker();
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newItems = result.assets.map(asset => ({
          uri: asset.uri,
          name: asset.fileName || 'foto.jpg',
          size: asset.fileSize,
          timestamp: Date.now()
        }));
        setPhotos(prev => [...prev, ...newItems]);
      }
    } catch (e) {
      handlePickFromDocumentPicker();
    }
  };

  const handleOpenPhotoOptions = () => {
    Alert.alert(
      '📸 Añadir Foto a la Finca',
      'Elige el origen de la fotografía:',
      [
        {
          text: '📷 Tomar Foto con Cámara',
          onPress: handleTakePhoto
        },
        {
          text: '🖼️ Elegir de la Galería',
          onPress: handlePickFromGallery
        },
        {
          text: '📂 Explorador de Archivos',
          onPress: handlePickFromDocumentPicker
        },
        {
          text: 'Cancelar',
          style: 'cancel'
        }
      ]
    );
  };

  const handleRemovePhoto = (indexToRemove) => {
    setPhotos(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSave = () => {
    if (!customName.trim()) {
      Alert.alert('Nombre requerido', 'Por favor asigna un nombre para identificar este favorito.');
      return;
    }
    onSave(parcel, customName.trim(), notes.trim(), photos);
    onClose();
  };

  return (
    <>
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

            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
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
                placeholder="Añade observaciones, contacto del dueño, mojones, tasación..."
                placeholderTextColor="#999"
                value={notes}
                onChangeText={setNotes}
                multiline={true}
                numberOfLines={3}
              />

              {/* Sección de Fotos Adjuntas */}
              <View style={styles.photosHeaderRow}>
                <Text style={styles.fieldLabel}>📸 Fotos de la Finca ({photos.length})</Text>
                <TouchableOpacity style={styles.btnAddPhoto} onPress={handleOpenPhotoOptions}>
                  <Text style={styles.btnAddPhotoText}>➕ Añadir Foto</Text>
                </TouchableOpacity>
              </View>

              {photos.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
                  {photos.map((item, idx) => (
                    <View key={idx} style={styles.photoThumbContainer}>
                      <TouchableOpacity onPress={() => setPreviewPhotoUri(item.uri)}>
                        <Image source={{ uri: item.uri }} style={styles.photoThumb} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.photoDeleteBtn}
                        onPress={() => handleRemovePhoto(idx)}
                      >
                        <Text style={styles.photoDeleteBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.noPhotosText}>No hay fotos adjuntas a esta finca todavía.</Text>
              )}
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

      <PhotoViewerModal
        visible={!!previewPhotoUri}
        photoUri={previewPhotoUri}
        photoTitle={customName || 'Foto de la Finca'}
        onClose={() => setPreviewPhotoUri(null)}
      />
    </>
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
    height: 60,
    textAlignVertical: 'top',
  },
  photosHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 6,
  },
  btnAddPhoto: {
    backgroundColor: '#e6f7ff',
    borderWidth: 1,
    borderColor: '#91d5ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  btnAddPhotoText: {
    fontSize: 11,
    color: '#0050b3',
    fontWeight: 'bold',
  },
  photosScroll: {
    marginVertical: 6,
  },
  photoThumbContainer: {
    position: 'relative',
    marginRight: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  photoDeleteBtn: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: 'rgba(255, 77, 79, 0.9)',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoDeleteBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  noPhotosText: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 8,
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
