import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Animated,
  Dimensions
} from 'react-native';
import { openGpsNavigation } from '../../utils/navigationLauncher';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const ParcelDetailsSheet = ({
  parcelDetails,
  subparcels,
  showSubparcels,
  setShowSubparcels,
  selectedSubparcel,
  setSelectedSubparcel,
  subparcelFilter,
  setSubparcelFilter,
  selectedRegion,
  onChangeRegion,
  cardAnimY,
  panResponder,
  onClose,
  onOpenOfficialFicha,
  onOpenSaveFavoriteModal,
  onCopyToClipboard,
  onExpandCard,
  onResetCardPosition
}) => {
  if (!parcelDetails) return null;

  return (
    <Animated.View 
      style={[
        styles.detailsCard, 
        { transform: [{ translateY: cardAnimY }] }
      ]}
    >
      <View {...panResponder.panHandlers} style={styles.dragHandleContainer}>
        <View style={styles.dragHandleBar} />
      </View>

      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardAddress} numberOfLines={2}>{parcelDetails.address}</Text>

          {!parcelDetails.noExactBuilding && (
            <View style={{ marginTop: 4 }}>
              <Text style={styles.cardRefLabel}>Ref. Catastral Base (14 car.):</Text>
              <TouchableOpacity onPress={() => onCopyToClipboard(parcelDetails.refCat)}>
                <Text style={styles.cardRefValue}>{parcelDetails.refCat} 📋</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.headerRightActions}>
          <TouchableOpacity 
            style={styles.favHeaderBtn}
            onPress={() => onOpenSaveFavoriteModal(parcelDetails)}
          >
            <Text style={styles.favHeaderIcon}>⭐</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.closeCardBtn} 
            onPress={onClose}
          >
            <Text style={styles.closeCardBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!parcelDetails.noExactBuilding ? (
        <>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🏢 {parcelDetails.count} Inmueble(s)</Text>
            </View>
          </View>

          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => {
                const isSingle = parcelDetails.count === 1;
                const refToOpen = isSingle 
                  ? (parcelDetails.ref20 || parcelDetails.refCat) 
                  : String(parcelDetails.refCat || '').trim().substring(0, 14);

                onOpenOfficialFicha({
                  refCat: refToOpen,
                  ref20: isSingle ? refToOpen : '',
                  del: parcelDetails.del,
                  mun: parcelDetails.mun,
                  polCode: parcelDetails.polCode,
                  parCode: parcelDetails.parCode,
                  subareaCode: ''
                });
              }}
            >
              <Text style={styles.btnPrimaryText}>
                {parcelDetails.count === 1 
                  ? '📄 Ficha Inmueble' 
                  : (selectedRegion === 'NA' || selectedRegion === 'VI' || selectedRegion === 'BI' || selectedRegion === 'SS' ? '📄 Ficha Parcela' : '📄 Mapa Parcela')
                }
              </Text>
            </TouchableOpacity>

            {subparcels.length > 1 && (
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => {
                  const nextState = !showSubparcels;
                  setShowSubparcels(nextState);
                  if (nextState) onExpandCard();
                  else onResetCardPosition();
                }}
              >
                <Text style={styles.btnSecondaryText}>
                  {showSubparcels ? '▲ Inmuebles' : '▼ Inmuebles'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.btnNavigate}
              onPress={() => openGpsNavigation(parcelDetails.lat, parcelDetails.lon, parcelDetails.address || 'Parcela')}
            >
              <Text style={styles.btnNavigateText}>📍</Text>
            </TouchableOpacity>
          </View>

          {/* Lista Desplegable de Subparcelas / Pisos de 20 dígitos */}
          {showSubparcels && subparcels.length > 1 && (
            <View style={styles.subparcelsContainer}>
              <Text style={styles.subparcelsHeader}>Selecciona un inmueble para abrir su Ficha:</Text>
              
              <TextInput
                style={styles.subparcelFilterInput}
                placeholder="Filtrar por portal, calle, planta..."
                placeholderTextColor="#888"
                value={subparcelFilter}
                onChangeText={setSubparcelFilter}
              />

              <ScrollView style={styles.subparcelsScroll} nestedScrollEnabled={true}>
                {subparcels.filter(sub => {
                  if (!subparcelFilter) return true;
                  const term = subparcelFilter.toLowerCase();
                  const addr = (sub.address || '').toLowerCase();
                  const int = (sub.interior || '').toLowerCase();
                  return addr.includes(term) || int.includes(term);
                }).map((sub, idx) => {
                  const isSelected = selectedSubparcel?.id === sub.id;
                  return (
                    <View
                      key={sub.id + idx}
                      style={[styles.subparcelItem, isSelected && styles.subparcelItemSelected]}
                    >
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() => setSelectedSubparcel(sub)}
                      >
                        <Text style={styles.subparcelTitle}>{sub.interior}</Text>
                        <Text style={styles.subparcelRC}>{sub.ref20}</Text>
                      </TouchableOpacity>

                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={styles.btnMiniFicha}
                          onPress={() => onOpenOfficialFicha(sub)}
                        >
                          <Text style={styles.btnMiniFichaText}>Ficha 🌐</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.copyBtnMini}
                          onPress={() => onCopyToClipboard(sub.ref20)}
                        >
                          <Text style={styles.copyBtnMiniText}>Copiar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </>
      ) : (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.hintText}>💡 ¿No se detecta edificio o deseas consultar en otro Catastro?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {selectedRegion !== 'ES' && (
              <TouchableOpacity
                style={[styles.btnSecondary, { paddingHorizontal: 12, marginRight: 6 }]}
                onPress={() => onChangeRegion('ES')}
              >
                <Text style={styles.btnSecondaryText}>🇪🇸 Estado</Text>
              </TouchableOpacity>
            )}
            {selectedRegion !== 'NA' && (
              <TouchableOpacity
                style={[styles.btnSecondary, { paddingHorizontal: 12, marginRight: 6 }]}
                onPress={() => onChangeRegion('NA')}
              >
                <Text style={styles.btnSecondaryText}>🔴 Navarra</Text>
              </TouchableOpacity>
            )}
            {selectedRegion !== 'VI' && (
              <TouchableOpacity
                style={[styles.btnSecondary, { paddingHorizontal: 12, marginRight: 6 }]}
                onPress={() => onChangeRegion('VI')}
              >
                <Text style={styles.btnSecondaryText}>🟣 Álava</Text>
              </TouchableOpacity>
            )}
            {selectedRegion !== 'BI' && (
              <TouchableOpacity
                style={[styles.btnSecondary, { paddingHorizontal: 12, marginRight: 6 }]}
                onPress={() => onChangeRegion('BI')}
              >
                <Text style={styles.btnSecondaryText}>🔴 Bizkaia</Text>
              </TouchableOpacity>
            )}
            {selectedRegion !== 'SS' && (
              <TouchableOpacity
                style={[styles.btnSecondary, { paddingHorizontal: 12, marginRight: 6 }]}
                onPress={() => onChangeRegion('SS')}
              >
                <Text style={styles.btnSecondaryText}>🔵 Gipuzkoa</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  detailsCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_HEIGHT * 0.75,
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 20,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    zIndex: 150,
  },
  dragHandleContainer: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#ccc',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cardAddress: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111',
    lineHeight: 20,
  },
  cardRefLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 3,
  },
  cardRefValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0066cc',
    fontFamily: 'monospace',
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  favHeaderBtn: {
    padding: 6,
    backgroundColor: '#fffbe6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ffd666',
  },
  favHeaderIcon: {
    fontSize: 14,
  },
  closeCardBtn: {
    padding: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
  },
  closeCardBtnText: {
    fontSize: 13,
    color: '#666',
    fontWeight: 'bold',
  },
  badgeRow: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 4,
  },
  badge: {
    backgroundColor: '#e6f2ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: '#0066cc',
    fontSize: 11,
    fontWeight: 'bold',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  btnPrimary: {
    flex: 2,
    backgroundColor: '#0066cc',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 13,
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d0dce5',
  },
  btnSecondaryText: {
    color: '#0066cc',
    fontWeight: 'bold',
    fontSize: 12,
  },
  btnNavigate: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#a5d6a7',
  },
  btnNavigateText: {
    fontSize: 16,
  },
  subparcelsContainer: {
    marginTop: 10,
    flex: 1,
  },
  subparcelsHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
  },
  subparcelFilterInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    backgroundColor: '#fafafa',
    marginBottom: 8,
    color: '#111',
  },
  subparcelsScroll: {
    flex: 1,
  },
  subparcelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    borderRadius: 6,
  },
  subparcelItemSelected: {
    backgroundColor: '#e6f2ff',
  },
  subparcelTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#222',
  },
  subparcelRC: {
    fontSize: 11,
    color: '#666',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  btnMiniFicha: {
    backgroundColor: '#e6f2ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#99c2ff',
  },
  btnMiniFichaText: {
    fontSize: 11,
    color: '#0066cc',
    fontWeight: 'bold',
  },
  copyBtnMini: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  copyBtnMiniText: {
    fontSize: 11,
    color: '#666',
  },
  hintText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
});

export default ParcelDetailsSheet;
