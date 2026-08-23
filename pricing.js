(function initializeMvpluxPricing(global) {
  const DEFAULT_PRICE_SETTINGS = Object.freeze({
    twoFootPrice: 35.00,
    threeFootPrice: 50.00,
    fullHeight: 78,
    defaultMerchandiseHeight: 78,
    fullPrice: 129.99,
    extraInchPrice: 2.00
  });

  function parseHeight(value) {
    if (value === null || value === undefined || value === '') return null;
    const raw = String(value).trim().toLowerCase();
    const feetInchesMatch = raw.match(/^(\d+)\s*'\s*(\d+)?\s*"?$/);

    if (feetInchesMatch) {
      const feet = parseInt(feetInchesMatch[1], 10);
      const inches = parseInt(feetInchesMatch[2] || '0', 10);
      return inches < 12 ? (feet * 12) + inches : null;
    }

    if (/^\d+(?:\.\d+)?$/.test(raw)) {
      const number = Number(raw);
      if (number >= 2 && number <= 8) return number * 12;
      if (number >= 24) return number;
    }

    return null;
  }

  function positiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function normalizePriceSettings(settings = {}) {
    return {
      twoFootPrice: positiveNumber(settings.twoFootPrice, DEFAULT_PRICE_SETTINGS.twoFootPrice),
      threeFootPrice: positiveNumber(settings.threeFootPrice, DEFAULT_PRICE_SETTINGS.threeFootPrice),
      fullHeight: parseHeight(settings.fullHeight) || DEFAULT_PRICE_SETTINGS.fullHeight,
      defaultMerchandiseHeight: parseHeight(settings.defaultMerchandiseHeight) || DEFAULT_PRICE_SETTINGS.defaultMerchandiseHeight,
      fullPrice: positiveNumber(settings.fullPrice, DEFAULT_PRICE_SETTINGS.fullPrice),
      extraInchPrice: positiveNumber(settings.extraInchPrice, DEFAULT_PRICE_SETTINGS.extraInchPrice)
    };
  }

  function resolveMerchandiseHeight(value, settings = {}) {
    return parseHeight(value) || normalizePriceSettings(settings).defaultMerchandiseHeight;
  }

  function calculateHeightPrice(height, settings = {}) {
    const inches = parseHeight(height);
    if (!inches || inches < 24) return null;

    const prices = normalizePriceSettings(settings);
    if (inches <= 36) {
      return prices.twoFootPrice
        + ((inches - 24) * ((prices.threeFootPrice - prices.twoFootPrice) / 12));
    }

    if (inches <= prices.fullHeight) {
      const span = Math.max(1, prices.fullHeight - 36);
      return prices.threeFootPrice
        + ((inches - 36) * ((prices.fullPrice - prices.threeFootPrice) / span));
    }

    return prices.fullPrice + ((inches - prices.fullHeight) * prices.extraInchPrice);
  }

  global.MVPLUX_PRICING = Object.freeze({
    DEFAULT_PRICE_SETTINGS,
    parseHeight,
    normalizePriceSettings,
    resolveMerchandiseHeight,
    calculateHeightPrice
  });
})(window);
