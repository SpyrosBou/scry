const fs = require('fs');
const { SITES_DIR, getSiteConfigPath } = require('./site-inventory');
const { assertValidSiteConfig } = require('./site-config-validator');

class SiteLoader {
  static loadSite(siteName) {
    const sitePath = getSiteConfigPath(siteName);

    if (!fs.existsSync(sitePath)) {
      throw new Error(`Site configuration not found: ${siteName}.json`);
    }

    try {
      const siteData = fs.readFileSync(sitePath, 'utf8');
      const parsedConfig = JSON.parse(siteData);
      SiteLoader.validateSiteConfig(parsedConfig, {
        contextLabel: `Site configuration ${siteName}.json`,
      });
      return parsedConfig;
    } catch (error) {
      throw new Error(`Error loading site configuration ${siteName}: ${error.message}`);
    }
  }

  static listAvailableSites() {
    if (!fs.existsSync(SITES_DIR)) {
      return [];
    }

    return fs
      .readdirSync(SITES_DIR)
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace('.json', ''));
  }

  static validateSiteConfig(config, options = {}) {
    return assertValidSiteConfig(config, options);
  }
}

module.exports = SiteLoader;
