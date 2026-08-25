# 🗺️ GeoCatastro

[![GitHub Release](https://img.shields.io/github/v/release/TheSorian/GeoCatastro?color=0066cc&label=Última%20Versión)](https://github.com/TheSorian/GeoCatastro/releases)
[![React Native](https://img.shields.io/badge/React%20Native-Expo-000000?logo=react&logoColor=61DAFB)](https://expo.dev/)
[![Licencia](https://img.shields.io/badge/Licencia-MIT-green.svg)](LICENSE)

**GeoCatastro** es una aplicación móvil nativa para Android diseñada para consultar, localizar e inspeccionar parcelas, fincas e inmuebles de la **Sede Electrónica del Catastro de España** directamente sobre un mapa interactivo.

---

## 🌟 Características Principales

* 🗺️ **Visor de Mapas y Catastro:**
  - Mapas base: Satélite (IGN PNOA, Esri), Topográfico y Callejero.
  - Capa catastral interactiva (Sede Electrónica, Navarra, Bizkaia).
  - Zoom ultra-detallado sin cortes.
* 📏 **Herramientas de Medición:**
  - Cálculo en tiempo real de distancias, áreas y perímetros.
  - Ajuste magnético inteligente (*Snapping*) a los vértices oficiales de las parcelas.
* 🔎 **Buscador Multi-Criterio:**
  - Búsqueda por dirección, calle, número, o nombre de pueblo/pedanía.
  - Búsqueda directa por Referencia Catastral.
  - Búsqueda por coordenadas GPS.
* 📄 **Fichas e Inmuebles:**
  - Listado de subparcelas y división horizontal (pisos, locales, trasteros).
  - Apertura directa de la **Ficha Informativa Oficial** del inmueble.
  - **Generación y descarga de la Ficha en PDF nativo** para compartir (incluyendo soporte especial para Bizkaia).
* ⚙️ **Otras Utilidades:**
  - Historial persistente de búsquedas recientes.
  - Guardado de DNI/NIF para autocompletar rápidamente el acceso a consultas protegidas.
  - Actualizaciones automáticas (In-App) desde GitHub Releases.

---

## 📱 Descarga e Instalación

Puedes descargar la última versión compilada y firmada para Android directamente desde la sección de lanzamientos:

👉 **[Descargar GeoCatastro APK (Releases)](https://github.com/TheSorian/GeoCatastro/releases)**

1. Descarga el archivo **`app-release.apk`** en tu móvil Android.
2. Ábrelo en tu teléfono e instálalo.
3. *(Si tenías una versión de prueba muy antigua, desinstálala primero por el cambio de firma).*

---

## 🛠️ Tecnologías Utilizadas

* **Framework:** React Native / Expo
* **Mapas:** Leaflet.js + WMS Sede Electrónica del Catastro España
* **APIs Catastrales:** OVCCallejero, OVCCoordenadas (`Consulta_DNPRC`, `Consulta_CPMRC`, `Consulta_RCCOOR`)
* **Geocodificación:** ArcGIS World Geocoding + Nominatim OpenStreetMap
* **Parseador XML:** `fast-xml-parser` (configurado en modo estricto de preservación de ceros iniciales)
* **Persistencia:** `@react-native-async-storage/async-storage`
* **CI/CD:** GitHub Actions + Gradle Android Release Signing

---

## 💻 Desarrollo Local

Si deseas clonar el proyecto y ejecutarlo localmente con Expo:

```bash
# Clonar el repositorio
git clone https://github.com/TheSorian/GeoCatastro.git

# Entrar en la carpeta
cd CatastroGSM

# Instalar dependencias
npm install

# Iniciar el servidor de desarrollo
npm start
```

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo `LICENSE` para más detalles.
