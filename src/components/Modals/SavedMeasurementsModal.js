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
import { getSavedMeasurements, removeMeasurement } from '../../services/storage/measurementsStorage';
import { exportMeasurementToKml } from '../../services/export/kmlExporter';
import { formatArea, formatDistance, formatDate } from '../../utils/formatters';

const SavedMeasurementsModal = ({
  visible,
  onClose,
  onLoadMeasurement
}) => {
  const [measurements, setMeasurements] = useState([]);
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
      const data = await getSavedMeasurements();
      setMeasurements(data);
    } catch (e) {
      console.error('Error cargando mediciones:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (item) => {
    Alert.alert(
      'Eliminar Medición',
      `¿Deseas eliminar la medición "${item.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = await removeMeasurement(item.id);
              setMeasurements(updated);
            } catch (e) {
              Alert.alert('Error', 'No se pudo eliminar la medición.');
            }
          }
        }
      ]
    );
  };

  const handleExportKml = async (item) => {
    await exportMeasurementToKml(item);
  };

  const filtered = measurements.filter(m => {
    if (!filterText.trim()) return true;
    const term = filterText.toLowerCase();
    const nameMatch = (m.name || '').toLowerCase().includes(term);
    const notesMatch = (m.notes || '').toLowerCase().includes(term);
    return nameMatch || notesMatch;
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
            <Text style={styles.title}>📂 Mis Mediciones Guardadas</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.searchInput}
            placeholder="Filtrar por nombre o notas..."
            placeholderTextColor="#888"
            value={filterText}
            onChangeText={setFilterText}
          />

          <ScrollView style={styles.listScroll}>
            {filtered.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📐</Text>
                <Text style={styles.emptyText}>No tienes mediciones guardadas aún.</Text>
                <Text style={styles.emptySubText}>
                  Usa la herramienta de medir en el mapa y pulsa "Guardar" para conservarlas aquí.
                </Text>
              </View>
            ) : (
              filtered.map((item) => {
                const isArea = item.mode === 'area';
                const stats = item.stats || {};
                return (
                  <View key={item.id} style={styles.itemCard}>
                    <View style={styles.itemHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>{item.name}</Text>
                        <Text style={styles.itemDate}>🕒 {formatDate(item.createdAt)}</Text>
                      </View>
                      <View style={[styles.typeBadge, isArea ? styles.typeBadgeArea : styles.typeBadgeDistance]}>
                        <Text style={[styles.typeBadgeText, isArea ? styles.typeBadgeTextArea : styles.typeBadgeTextDistance]}>
                          {isArea ? '📐 Área' : '📏 Distancia'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.statsRow}>
                      {isArea ? (
                        <>
                          <Text style={styles.statChip}>Área: <Text style={styles.bold}>{formatArea(stats.area)}</Text></Text>
                          <Text style={styles.statChip}>Perím.: <Text style={styles.bold}>{formatDistance(stats.perimeter)}</Text></Text>
                        </>
                      ) : (
                        <Text style={styles.statChip}>Distancia: <Text style={styles.bold}>{formatDistance(stats.distance)}</Text></Text>
                      )}
                      <Text style={styles.statChip}>Puntos: <Text style={styles.bold}>{item.points?.length || stats.pointsCount || 0}</Text></Text>
                    </View>

                    {item.notes ? (
                      <Text style={styles.itemNotes} numberOfLines={2}>
                        📝 {item.notes}
                      </Text>
                    ) : null}

                    <View style={styles.itemActionsRow}>
                      <TouchableOpacity
                        style={styles.btnLoad}
                        onPress={() => {
                          onClose();
                          onLoadMeasurement(item);
                        }}
                      >
                        <Text style={styles.btnLoadText}>🗺️ Cargar en Mapa</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.btnExport}
                        onPress={() => handleExportKml(item)}
                      >
                        <Text style={styles.btnExportText}>📤 KML</Text>
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
    backgroundColor: '#f9fbfd',
    borderWidth: 1,
    borderColor: '#e1edf8',
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
    color: '#004080',
  },
  itemDate: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeArea: {
    backgroundColor: '#e6f2ff',
  },
  typeBadgeDistance: {
    backgroundColor: '#fef2f2',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  typeBadgeTextArea: {
    color: '#0066cc',
  },
  typeBadgeTextDistance: {
    color: '#cc0000',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  statChip: {
    fontSize: 11,
    color: '#555',
    backgroundColor: '#fff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  bold: {
    fontWeight: 'bold',
    color: '#222',
  },
  itemNotes: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#fff',
    padding: 6,
    borderRadius: 6,
    marginTop: 6,
    fontStyle: 'italic',
  },
  itemActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  btnLoad: {
    flex: 2,
    backgroundColor: '#0066cc',
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnLoadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  btnExport: {
    flex: 1,
    backgroundColor: '#eef4fb',
    borderWidth: 1,
    borderColor: '#cce0ff',
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnExportText: {
    color: '#0055b3',
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

export default SavedMeasurementsModal;
