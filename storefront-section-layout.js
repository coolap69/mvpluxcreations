(function initializeStorefrontSectionLayouts(global) {
  'use strict';

  const DEFINITIONS = Object.freeze({
    featuredCategories: Object.freeze({
      defaults: Object.freeze({
        sectionMaxWidthPx: 1400,
        horizontalPaddingPx: 34,
        verticalPaddingPx: 34,
        cardGapPx: 22,
        desktopColumns: 4,
        imageAreaMinHeightPx: 420,
        textBoxHeightPx: 74,
        titleFontSizePx: 19,
        titleFontWeight: 800,
        descriptionFontSizePx: 14,
        descriptionFontWeight: 400,
        titleLineHeightPercent: 120,
        descriptionLineHeightPercent: 140,
        textGapPx: 5,
        textPaddingPx: 10,
        titleFontFamily: 'inherit',
        descriptionFontFamily: 'inherit',
        textAlign: 'center'
      }),
      limits: Object.freeze({
        sectionMaxWidthPx: Object.freeze([900, 1800]),
        horizontalPaddingPx: Object.freeze([0, 80]),
        verticalPaddingPx: Object.freeze([0, 100]),
        cardGapPx: Object.freeze([8, 60]),
        desktopColumns: Object.freeze([2, 5]),
        imageAreaMinHeightPx: Object.freeze([240, 720]),
        textBoxHeightPx: Object.freeze([64, 150]),
        titleFontSizePx: Object.freeze([14, 34]),
        titleFontWeight: Object.freeze([400, 900]),
        descriptionFontSizePx: Object.freeze([10, 24]),
        descriptionFontWeight: Object.freeze([300, 900]),
        titleLineHeightPercent: Object.freeze([90, 180]),
        descriptionLineHeightPercent: Object.freeze([90, 200]),
        textGapPx: Object.freeze([0, 24]),
        textPaddingPx: Object.freeze([0, 30])
      }),
      choices: Object.freeze({
        titleFontFamily: Object.freeze(['inherit', 'Arial, sans-serif', 'Georgia, serif', 'Trebuchet MS, sans-serif']),
        descriptionFontFamily: Object.freeze(['inherit', 'Arial, sans-serif', 'Georgia, serif', 'Trebuchet MS, sans-serif']),
        textAlign: Object.freeze(['left', 'center', 'right'])
      }),
      cssVariables: Object.freeze({
        sectionMaxWidthPx: '--featured-categories-section-max-width',
        horizontalPaddingPx: '--featured-categories-horizontal-padding',
        verticalPaddingPx: '--featured-categories-vertical-padding',
        cardGapPx: '--featured-categories-card-gap',
        desktopColumns: '--featured-categories-desktop-columns',
        imageAreaMinHeightPx: '--featured-categories-image-area-min-height',
        textBoxHeightPx: '--featured-categories-text-box-height',
        titleFontSizePx: '--featured-categories-title-size',
        titleFontWeight: '--featured-categories-title-weight',
        descriptionFontSizePx: '--featured-categories-description-size',
        descriptionFontWeight: '--featured-categories-description-weight',
        titleLineHeightPercent: '--featured-categories-title-line-height',
        descriptionLineHeightPercent: '--featured-categories-description-line-height',
        textGapPx: '--featured-categories-text-gap',
        textPaddingPx: '--featured-categories-text-padding',
        titleFontFamily: '--featured-categories-title-font',
        descriptionFontFamily: '--featured-categories-description-font',
        textAlign: '--featured-categories-text-align'
      })
    })
  });

  function definition(sectionKey) {
    return DEFINITIONS[sectionKey] || null;
  }

  function boundedNumber(value, fallback, limits) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.round(Math.max(limits[0], Math.min(limits[1], numeric)));
  }

  function normalize(sectionKey, value = {}) {
    const configured = definition(sectionKey);
    if (!configured) return {};
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.entries(configured.defaults).map(([field, fallback]) => {
      if (typeof fallback === 'number') return [field, boundedNumber(source[field], fallback, configured.limits[field])];
      const choices = configured.choices?.[field] || [];
      const value = String(source[field] || fallback);
      return [field, choices.includes(value) ? value : fallback];
    }));
  }

  function fromGlobalDisplaySettings(sectionKey, globalDisplaySettings = {}) {
    return normalize(sectionKey, globalDisplaySettings?.sectionLayouts?.[sectionKey]);
  }

  function withSectionLayout(globalDisplaySettings = {}, sectionKey, value = {}) {
    return {
      ...(globalDisplaySettings || {}),
      sectionLayouts: {
        ...(globalDisplaySettings?.sectionLayouts || {}),
        [sectionKey]: normalize(sectionKey, value)
      }
    };
  }

  function apply(sectionKey, element, value = {}) {
    const configured = definition(sectionKey);
    if (!configured || !element?.style) return normalize(sectionKey, value);
    const normalized = normalize(sectionKey, value);
    Object.entries(configured.cssVariables).forEach(([field, variable]) => {
      const unit = typeof normalized[field] !== 'number' || field === 'desktopColumns' || field.endsWith('Weight') ? '' : (field.endsWith('Percent') ? '%' : 'px');
      element.style.setProperty(variable, `${normalized[field]}${unit}`);
    });
    return normalized;
  }

  function previewWidthPercent(sectionKey, value = {}) {
    const configured = definition(sectionKey);
    if (!configured) return 100;
    const normalized = normalize(sectionKey, value);
    const [minimum, maximum] = configured.limits.sectionMaxWidthPx;
    return Math.round(58 + ((normalized.sectionMaxWidthPx - minimum) / (maximum - minimum)) * 42);
  }

  global.MVPLUX_STOREFRONT_SECTION_LAYOUT = Object.freeze({
    definitions: DEFINITIONS,
    normalize,
    fromGlobalDisplaySettings,
    withSectionLayout,
    apply,
    previewWidthPercent
  });
})(window);
