# 🗺️ GeoCatastro

[![Última Versión](https://img.shields.io/badge/Última_Versión-v1.0.1-0066cc.svg)](https://github.com/TheSorian/CatastroGSM/releases)
[![React Native](https://img.shields.io/badge/React%20Native-Expo-000000?logo=react&logoColor=61DAFB)](https://expo.dev/)
[![Licencia](https://img.shields.io/badge/Licencia-MIT-green.svg)](LICENSE)

**GeoCatastro** es una aplicación móvil nativa para Android diseñada para consultar, localizar e inspeccionar parcelas, fincas e inmuebles de la **Sede Electrónica del Catastro de España** directamente sobre un mapa interactivo.

---

## 🌟 Características Principales

* 🗺️ **Mapa Interactivo WMS:** Capas oficiales de la Sede Electrónica del Catastro sobre mapas vectoriales de alta precisión.
* 🔎 **Buscador Inteligente Multi-Criterio:**
  - Búsqueda por **Dirección, Calle y Número**.
  - Reconocimiento de **Pedanías, Barrios y Distritos** (ej: *Ocenilla, Cidones*).
  - Búsqueda directa por **Referencia Catastral** (14 y 20 dígitos) preservando ceros iniciales.
  - Búsqueda por **Coordenadas GPS** (Latitud, Longitud).
* 🏢 **Inspector de Fincas y Subparcelas:**
  - Soporte para **Edificios con División Horizontal** (muestra la lista completa de pisos, locales y trasteros de 20 dígitos).
  - Soporte para **Fincas Únicas / Chalets / Naves**.
* 📄 **Acceso Directo a Fichas Oficiales:**
  - Apertura inmediata de la **Ficha Informativa Oficial del Inmueble** (`OVCConCiud.aspx`) con m² construidos, año y uso.
  - Vista cartográfica de la **Parcela Base** (`mapa.aspx`).
* 🕒 **Historial de Búsquedas Recientes:**
  - Persistencia local mediante `AsyncStorage` con opción de borrado individual o completo.
* 🔐 **Compilación Automatizada y Firma Permanente:**
  - Integración Continua (CI/CD) con GitHub Actions para generar APKs firmados y actualizables sin necesidad de desinstalar.

---

## 📱 Descarga e Instalación

Puedes descargar la última versión compilada y firmada para Android directamente desde la sección de lanzamientos:

👉 **[Descargar GeoCatastro APK (Releases)](https://github.com/TheSorian/CatastroGSM/releases)**

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
git clone https://github.com/TheSorian/CatastroGSM.git

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
