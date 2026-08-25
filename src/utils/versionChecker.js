import { Alert, Linking } from 'react-native';

export const isVersionNewer = (current, latest) => {
  const pCurrent = String(current).split('.').map(Number);
  const pLatest = String(latest).split('.').map(Number);
  for (let i = 0; i < Math.max(pCurrent.length, pLatest.length); i++) {
    const c = pCurrent[i] || 0;
    const l = pLatest[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
};

export const checkAppUpdate = async (currentVersion) => {
  try {
    const response = await fetch('https://api.github.com/repos/TheSorian/GeoCatastro/releases/latest');
    if (!response.ok) return;

    const data = await response.json();
    const latestTag = data?.tag_name || '';
    const cleanLatest = latestTag.replace(/^v/, '').trim();

    if (cleanLatest && isVersionNewer(currentVersion, cleanLatest)) {
      const downloadUrl = data?.assets?.[0]?.browser_download_url || data?.html_url;

      Alert.alert(
        '🚀 Nueva Actualización Disponible',
        `Existe una nueva versión de GeoCatastro (${latestTag}). ¿Deseas descargar e instalar la actualización ahora?`,
        [
          { text: 'Más tarde', style: 'cancel' },
          {
            text: '📲 Actualizar Ahora',
            onPress: async () => {
              try {
                if (downloadUrl) {
                  await Linking.openURL(downloadUrl);
                } else if (data?.html_url) {
                  await Linking.openURL(data.html_url);
                }
              } catch (err) {
                if (data?.html_url) {
                  await Linking.openURL(data.html_url);
                }
              }
            }
          }
        ]
      );
    }
  } catch (e) {}
};
