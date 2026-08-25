import React from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator
} from 'react-native';

const SearchBar = ({
  query,
  setQuery,
  onSearchTextChange,
  onExecuteSearch,
  onClearInput,
  suggestions,
  onSelectSuggestion,
  recentSearches,
  showRecent,
  setShowRecent,
  onRemoveRecentSearch,
  onClearAllRecent,
  loading,
  selectedRegion,
  onChangeRegion,
  onOpenRusticModal,
  onOpenFavoritesModal
}) => {
  const cleanQuery = (query || '').trim().toUpperCase();
  const isRCInput = cleanQuery.length >= 13 && !cleanQuery.includes(' ') && /^[A-Z0-9]+$/.test(cleanQuery);

  return (
    <View style={styles.searchContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.appTitle}>🏛️ GeoCatastro</Text>
        
        <View style={styles.headerButtonsRow}>
          <TouchableOpacity style={styles.headerSmallBtn} onPress={onOpenRusticModal}>
            <Text style={styles.headerSmallBtnText}>🌾 Rústica</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.headerSmallBtn, styles.headerFavBtn]} onPress={onOpenFavoritesModal}>
            <Text style={[styles.headerSmallBtnText, styles.headerFavBtnText]}>⭐ Favoritos</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.inputRow}>
        <View style={styles.inputBoxContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Dirección, Calle y Nº, Ref. Catastral..."
            placeholderTextColor="#888"
            value={query}
            onChangeText={onSearchTextChange}
            onFocus={() => {
              if (query.trim().length === 0 && recentSearches.length > 0) {
                setShowRecent(true);
              }
            }}
            onSubmitEditing={onExecuteSearch}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity style={styles.clearIconBtn} onPress={onClearInput}>
              <Text style={styles.clearIconText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.searchButton} onPress={onExecuteSearch}>
          <Text style={styles.searchButtonText}>Buscar</Text>
        </TouchableOpacity>
      </View>

      {isRCInput && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.regionSelectorRow}>
          <TouchableOpacity 
            style={[styles.regionBtn, selectedRegion === 'ES' && styles.regionBtnActive]}
            onPress={() => onChangeRegion('ES')}
          >
            <Text style={[styles.regionBtnText, selectedRegion === 'ES' && styles.regionBtnTextActive]}>🇪🇸 Estado</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.regionBtn, selectedRegion === 'NA' && styles.regionBtnActive]}
            onPress={() => onChangeRegion('NA')}
          >
            <Text style={[styles.regionBtnText, selectedRegion === 'NA' && styles.regionBtnTextActive]}>🔴 Navarra</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.regionBtn, selectedRegion === 'VI' && styles.regionBtnActive]}
            onPress={() => onChangeRegion('VI')}
          >
            <Text style={[styles.regionBtnText, selectedRegion === 'VI' && styles.regionBtnTextActive]}>🟣 Álava</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.regionBtn, selectedRegion === 'BI' && styles.regionBtnActive]}
            onPress={() => onChangeRegion('BI')}
          >
            <Text style={[styles.regionBtnText, selectedRegion === 'BI' && styles.regionBtnTextActive]}>🔴 Bizkaia</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.regionBtn, selectedRegion === 'SS' && styles.regionBtnActive]}
            onPress={() => onChangeRegion('SS')}
          >
            <Text style={[styles.regionBtnText, selectedRegion === 'SS' && styles.regionBtnTextActive]}>🔵 Gipuzkoa</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#0066cc" />
          <Text style={styles.loadingText}> Consultando Sede del Catastro...</Text>
        </View>
      )}

      {/* Lista de Búsquedas Recientes */}
      {showRecent && recentSearches.length > 0 && (
        <View style={styles.recentContainer}>
          <View style={styles.recentHeaderRow}>
            <Text style={styles.recentHeaderText}>🕒 Búsquedas Recientes</Text>
            <TouchableOpacity onPress={onClearAllRecent}>
              <Text style={styles.recentClearAllText}>Borrar historial</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.recentScroll} keyboardShouldPersistTaps="handled">
            {recentSearches.map((item, idx) => (
              <View key={idx} style={styles.recentRowItem}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => {
                    setQuery(item);
                    setShowRecent(false);
                    onSearchTextChange(item);
                  }}
                >
                  <Text style={styles.recentItemText} numberOfLines={1}>🕒 {item}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ paddingLeft: 8 }}
                  onPress={() => onRemoveRecentSearch(item)}
                >
                  <Text style={styles.recentDeleteBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Lista de Sugerencias de Autocompletado */}
      {suggestions.length > 0 && (
        <FlatList
          data={suggestions}
          keyExtractor={(item, idx) => item.place_id ? item.place_id.toString() : idx.toString()}
          style={styles.suggestionsList}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.suggestionItem} onPress={() => onSelectSuggestion(item)}>
              <Text numberOfLines={2} style={item.isRC ? styles.rcSuggestionText : styles.suggestionText}>
                {item.display_name}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  searchContainer: {
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  appTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#111',
  },
  headerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerSmallBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#eef4fb',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cce0ff',
  },
  headerSmallBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0055b3',
  },
  headerFavBtn: {
    backgroundColor: '#fff8e6',
    borderColor: '#ffd666',
  },
  headerFavBtnText: {
    color: '#d48806',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputBoxContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  searchInput: {
    flex: 1,
    height: 42,
    borderColor: '#ccc',
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 34,
    borderRadius: 8,
    backgroundColor: '#fafafa',
    fontSize: 13,
    color: '#000',
  },
  clearIconBtn: {
    position: 'absolute',
    right: 8,
    padding: 6,
  },
  clearIconText: {
    fontSize: 14,
    color: '#888',
    fontWeight: 'bold',
  },
  searchButton: {
    backgroundColor: '#0066cc',
    paddingHorizontal: 14,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginLeft: 8,
  },
  searchButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 13,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  loadingText: {
    color: '#0066cc',
    fontSize: 12,
    fontWeight: '500',
  },
  regionSelectorRow: {
    flexDirection: 'row',
    marginTop: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 2,
  },
  regionBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  regionBtnActive: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 2,
  },
  regionBtnText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  regionBtnTextActive: {
    color: '#0066cc',
    fontWeight: 'bold',
  },
  recentContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 8,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  recentHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
  },
  recentClearAllText: {
    fontSize: 11,
    color: '#cc0000',
    fontWeight: '600',
  },
  recentScroll: {
    maxHeight: 180,
  },
  recentRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  recentItemText: {
    fontSize: 13,
    color: '#333',
  },
  recentDeleteBtn: {
    color: '#999',
    fontSize: 14,
    padding: 4,
  },
  suggestionsList: {
    maxHeight: 220,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  suggestionItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionText: {
    fontSize: 13,
    color: '#333',
  },
  rcSuggestionText: {
    fontSize: 13,
    color: '#0066cc',
    fontWeight: 'bold',
  },
});

export default SearchBar;
