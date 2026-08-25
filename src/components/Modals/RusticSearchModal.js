import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { cadastreService } from '../../../services/cadastre/CadastreService';

const RusticSearchModal = ({
  visible,
  onClose,
  onSelectParcel,
  selectedRegion = 'ES'
}) => {
  const [provincia, setProvincia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [poligono, setPoligono] = useState('');
  const [parcela, setParcela] = useState('');
  const [loading, setLoading] = useState(false);

  const [provincesList, setProvincesList] = useState([]);
  const [filteredProvinces, setFilteredProvinces] = useState([]);
  const [showProvList, setShowProvList] = useState(false);

  const [municipalitiesList, setMunicipalitiesList] = useState([]);
  const [filteredMunicipalities, setFilteredMunicipalities] = useState([]);
  const [showMuniList, setShowMuniList] = useState(false);

  useEffect(() => {
    if (visible && provincesList.length === 0) {
      cadastreService.getProvincias(selectedRegion)
        .then((list) => {
          setProvincesList(list || []);
        })
        .catch(() => {});
    }
  }, [visible]);

  // Cargar lista de municipios cuando cambia la provincia
  useEffect(() => {
    if (provincia.trim().length >= 3) {
      cadastreService.getMunicipios(provincia.trim().toUpperCase(), selectedRegion)
        .then((list) => {
          setMunicipalitiesList(list || []);
        })
        .catch(() => {});
    } else {
      setMunicipalitiesList([]);
    }
  }, [provincia]);

  const handleProvinciaChange = (text) => {
    setProvincia(text);
    if (text.trim().length > 0) {
      const filtered = provincesList.filter(p =>
        p.name.toLowerCase().includes(text.toLowerCase())
      );
      setFilteredProvinces(filtered);
      setShowProvList(filtered.length > 0);
    } else {
      setShowProvList(false);
    }
  };

  const selectProvinceItem = (provItem) => {
    setProvincia(provItem.name);
    setShowProvList(false);
    // Cargar municipios de inmediato
    cadastreService.getMunicipios(provItem.name, selectedRegion)
      .then((list) => {
        setMunicipalitiesList(list || []);
      })
      .catch(() => {});
  };

  const handleMunicipioChange = (text) => {
    setMunicipio(text);
    if (text.trim().length > 0 && municipalitiesList.length > 0) {
      const filtered = municipalitiesList.filter(m =>
        m.name.toLowerCase().includes(text.toLowerCase())
      );
      setFilteredMunicipalities(filtered);
      setShowMuniList(filtered.length > 0);
    } else {
      setShowMuniList(false);
    }
  };

  const selectMunicipalityItem = (muniItem) => {
    setMunicipio(muniItem.name);
    setShowMuniList(false);
  };

  const handleSearch = async () => {
    if (!provincia.trim() || !municipio.trim() || !poligono.trim() || !parcela.trim()) {
      Alert.alert('Campos incompletos', 'Por favor rellena Provincia, Municipio, Polígono y Parcela.');
      return;
    }

    setLoading(true);
    setShowProvList(false);
    setShowMuniList(false);

    try {
      const result = await cadastreService.fetchParcelByRustic(
        provincia.trim().toUpperCase(),
        municipio.trim().toUpperCase(),
        poligono.trim(),
        parcela.trim(),
        selectedRegion
      );

      if (result && result.found) {
        onClose();
        onSelectParcel({
          lat: result.lat,
          lon: result.lon,
          ref: result.ref,
          address: result.address
        });
      } else {
        Alert.alert(
          'Finca no encontrada',
          `No se encontró ninguna parcela rústica con Polígono ${poligono} y Parcela ${parcela} en ${municipio} (${provincia}). Comprueba que los datos coincidan exactamente con la sede catastral.`
        );
      }
    } catch (e) {
      Alert.alert('Error', 'Fallo al consultar la sede catastral: ' + (e.message || e.toString()));
    } finally {
      setLoading(false);
    }
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
            <Text style={styles.title}>🌾 Búsqueda Rústica</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Localiza fincas rústicas mediante sus datos oficiales de polígono y parcela.
          </Text>

          <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Provincia</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: SORIA, MADRID, TOLEDO..."
              placeholderTextColor="#999"
              value={provincia}
              onChangeText={handleProvinciaChange}
              autoCapitalize="characters"
            />

            {showProvList && (
              <View style={styles.dropdownList}>
                {filteredProvinces.slice(0, 6).map((p, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.dropdownItem}
                    onPress={() => selectProvinceItem(p)}
                  >
                    <Text style={styles.dropdownItemText}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.fieldLabel}>Municipio</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: CIDONES, COLMENAR VIEJO..."
              placeholderTextColor="#999"
              value={municipio}
              onChangeText={handleMunicipioChange}
              autoCapitalize="characters"
            />

            {showMuniList && (
              <View style={styles.dropdownList}>
                {filteredMunicipalities.slice(0, 6).map((m, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.dropdownItem}
                    onPress={() => selectMunicipalityItem(m)}
                  >
                    <Text style={styles.dropdownItemText}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.rowTwoCols}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Polígono</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: 23"
                  placeholderTextColor="#999"
                  value={poligono}
                  onChangeText={setPoligono}
                  keyboardType="numeric"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Parcela</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: 5051"
                  placeholderTextColor="#999"
                  value={parcela}
                  onChangeText={setParcela}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </ScrollView>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.btnCancel} onPress={onClose} disabled={loading}>
              <Text style={styles.btnCancelText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnSearch} onPress={handleSearch} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnSearchText}>Buscar Finca</Text>
              )}
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
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
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 16,
    lineHeight: 16,
  },
  formScroll: {
    maxHeight: 360,
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
  rowTwoCols: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  dropdownList: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#0066cc',
    borderRadius: 6,
    marginTop: 2,
    maxHeight: 160,
    elevation: 4,
  },
  dropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#333',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
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
  btnSearch: {
    flex: 2,
    paddingVertical: 12,
    backgroundColor: '#0066cc',
    borderRadius: 8,
    alignItems: 'center',
  },
  btnSearchText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
});

export default RusticSearchModal;
