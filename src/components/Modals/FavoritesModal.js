import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Clipboard
} from 'react-native';
import { getFavorites, removeFavorite } from '../../services/storage/favoritesStorage';
import { formatDate } from '../../utils/formatters';

const FavoritesModal = ({
  visible,
  onClose,
  onSelectFavorite
}) => {
  const [favorites, setFavorites] = useState([]);
  const [filterText, setFilterText] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getFavorites();
      setFavorites(data);
    } catch (e) {
      console.error('Error cargando favoritos:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (item) => {
    Alert.alert(
      'Eliminar Favorito',
      `¿Deseas eliminar "${item.customName}" de tus favoritos?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = await removeFavorite(item.id);
              setFavorites(updated);
            } catch (e) {
              Alert.alert('Error', 'No se pudo eliminar el favorito.');
            }
          }
        }
      ]
    );
  };

  const handleCopyRc = (rc) => {
    Clipboard.setString(rc);
    Alert.alert('Copiado', `Referencia Catastral copiada:\n${rc}`);
  };

  const filtered = favorites.filter(f => {
    if (!filterText.trim()) return true;
    const term = filterText.toLowerCase();
    const nameMatch = (f.customName || '').toLowerCase().includes(term);
    const addrMatch = (f.address || '').toLowerCase().includes(term);
    const rcMatch = (f.refCat || f.ref20 || '').toLowerCase().includes(term);
    const notesMatch = (f.notes || '').toLowerCase().includes(term);
    return nameMatch || addrMatch || rcMatch || notesMatch;
  });

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <Text style={styles.title}>⭐ Mis Fincas y Parcelas Favoritas</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.searchInput}
            placeholder="Filtrar por nombre, dirección o notas..."
            placeholderTextColor="#888"
            value={filterText}
            onChangeText={setFilterText}
          />

          <ScrollView style={styles.listScroll}>
            {filtered.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>⭐</Text>
                <Text style={styles.emptyText}>No tienes parcelas guardadas en favoritos.</Text>
                <Text style={styles.emptySubText}>
                  Toca cualquier parcela en el mapa y pulsa el botón ⭐ en su ficha para guardarla aquí con tus notas.
                </Text>
              </View>
            ) : (
              filtered.map((item) => {
                const targetRef = item.ref20 || item.refCat;
                return (
                  <View key={item.id} style={styles.itemCard}>
                    <View style={styles.itemHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>⭐ {item.customName}</Text>
                        <Text style={styles.itemAddress} numberOfLines={2}>📍 {item.address}</Text>
                        <Text style={styles.itemRef}>Ref: {targetRef}</Text>
                        {item.savedAt ? (
                          <Text style={styles.itemDate}>Guardado: {formatDate(item.savedAt)}</Text>
                        ) : null}
                      </View>
                    </View>

                    {item.notes ? (
                      <Text style={styles.itemNotes} numberOfLines={3}>
                        📝 {item.notes}
                      </Text>
                    ) : null}

                    <View style={styles.itemActionsRow}>
                      <TouchableOpacity
                        style={styles.btnOpen}
                        onPress={() => {
                          onClose();
                          onSelectFavorite(item);
                        }}
                      >
                        <Text style={styles.btnOpenText}>🗺️ Ver en Mapa</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.btnCopy}
                        onPress={() => handleCopyRc(targetRef)}
                      >
                        <Text style={styles.btnCopyText}>📋 Copiar RC</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.btnDelete}
                        onPress={() => handleDelete(item)}
                      >
                        <Text style={styles.btnDeleteText}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          <TouchableOpacity style={styles.btnCloseFooter} onPress={onClose}>
            <Text style={styles.btnCloseFooterText}>Cerrar</Text>
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
    padding: 16,
  },
  modalCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    padding: 18,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
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
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: '#fafafa',
    marginBottom: 12,
    color: '#111',
  },
  listScroll: {
    maxHeight: 400,
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#555',
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  itemCard: {
    backgroundColor: '#fffcf0',
    borderWidth: 1,
    borderColor: '#ffe58f',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#874d00',
  },
  itemAddress: {
    fontSize: 12,
    color: '#555',
    marginTop: 3,
  },
  itemRef: {
    fontSize: 11,
    color: '#ad6800',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  itemDate: {
    fontSize: 10,
    color: '#999',
    marginTop: 3,
  },
  itemNotes: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#fff',
    padding: 6,
    borderRadius: 6,
    marginTop: 6,
    fontStyle: 'italic',
    borderWidth: 1,
    borderColor: '#fff1b8',
  },
  itemActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  btnOpen: {
    flex: 2,
    backgroundColor: '#faad14',
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnOpenText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  btnCopy: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ffd591',
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnCopyText: {
    color: '#d46b08',
    fontSize: 12,
    fontWeight: 'bold',
  },
  btnDelete: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#fee',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fcc',
  },
  btnDeleteText: {
    color: '#cc0000',
    fontSize: 12,
  },
  btnCloseFooter: {
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: '#eee',
    borderRadius: 8,
    alignItems: 'center',
  },
  btnCloseFooterText: {
    color: '#555',
    fontWeight: 'bold',
    fontSize: 13,
  },
});

export default FavoritesModal;
