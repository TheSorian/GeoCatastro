import { StateProvider } from './providers/StateProvider';
import { NavarraProvider } from './providers/NavarraProvider';

class CadastreService {
  constructor() {
    this.providers = {
      'ES': new StateProvider(),
      'NA': new NavarraProvider()
    };
  }

  getProvider(region) {
    return this.providers[region] || this.providers['ES'];
  }

  async fetchFullParcelDetails(refCat, lat, lon, region = 'ES') {
    return this.getProvider(region).fetchFullParcelDetails(refCat, lat, lon);
  }

  async fetchParcelByCoords(lat, lon, region = 'ES') {
    return this.getProvider(region).fetchParcelByCoords(lat, lon);
  }

  async getCoordsFromRC(rc, region = 'ES') {
    return this.getProvider(region).getCoordsFromRC(rc);
  }

  async openOfficialFicha(refCat, delCode, munCode, parCode, subareaCode, region = 'ES') {
    return this.getProvider(region).openOfficialFicha(refCat, delCode, munCode, parCode, subareaCode);
  }

  getWMSUrl(region = 'ES') {
    return this.getProvider(region).getWMSUrl();
  }

  getWMSLayers(region = 'ES') {
    return this.getProvider(region).getWMSLayers();
  }
}

export const cadastreService = new CadastreService();
