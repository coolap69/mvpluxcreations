(function installCategoryPresentation(root) {
  const clampNumber = (value, fallback, minimum, maximum) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  };
  const alignment = (value) => ['left', 'center', 'right'].includes(String(value)) ? String(value) : 'center';

  function resolveCategoryPresentation(category = {}, options = {}) {
    const globalDisplay = options.globalDisplaySettings && typeof options.globalDisplaySettings === 'object'
      ? options.globalDisplaySettings : {};
    const display = { ...globalDisplay, ...(category.displaySettings || {}) };
    const inheritedImageSize = clampNumber(globalDisplay.standeeSizePercent, 63, 10, 250);
    const resolvedDisplay = {
      ...display,
      backgroundPosition: String(display.backgroundPosition || 'center bottom'),
      backgroundSizePercent: clampNumber(display.backgroundSizePercent, 100, 50, 300),
      standeeSizePercent: clampNumber(display.standeeSizePercent, inheritedImageSize, 10, 250),
      standeeLeftPercent: clampNumber(display.standeeLeftPercent, 0, -50, 50),
      standeeVerticalPercent: clampNumber(display.standeeVerticalPercent, 0, -50, 50),
      titleLeftPercent: clampNumber(display.titleLeftPercent, 0, -50, 50),
      titleVerticalPercent: clampNumber(display.titleVerticalPercent, 0, -50, 50),
      titleAlign: alignment(display.titleAlign),
      titleSizePercent: clampNumber(display.titleSizePercent, 100, 70, 180),
      descriptionLeftPercent: clampNumber(display.descriptionLeftPercent, 0, -50, 50),
      descriptionVerticalPercent: clampNumber(display.descriptionVerticalPercent, 0, -50, 50),
      descriptionAlign: alignment(display.descriptionAlign),
      descriptionSizePercent: clampNumber(display.descriptionSizePercent, 100, 70, 180)
    };
    return {
      key: String(category.key || ''),
      mode: options.mode === 'draft' ? 'draft' : 'published',
      title: String(category.title || category.card?.title || category.key || ''),
      description: String(category.description || category.card?.description || ''),
      funFact: String(category.funFact || ''),
      image: String(category.card?.image || ''),
      background: String(category.card?.backgroundImage || category.displaySettings?.backgroundImage || options.defaultBackground || ''),
      page: String(category.page || ''),
      visible: category.visible !== false,
      homepageVisible: !category.parentKey && category.homepageVisible !== false,
      order: Number.isFinite(Number(category.order)) ? Number(category.order) : 0,
      parentKey: String(category.parentKey || ''),
      display: resolvedDisplay
    };
  }

  function resolveCategoryCardLayout(presentation = {}) {
    const display = presentation.display || {};
    return {
      imageLeftPercent: 50 + clampNumber(display.standeeLeftPercent, 0, -50, 50),
      imageBottomPercent: 2 - clampNumber(display.standeeVerticalPercent, 0, -50, 50),
      imageSizePercent: clampNumber(display.standeeSizePercent, 63, 10, 250),
      backgroundPosition: String(display.backgroundPosition || 'center bottom'),
      backgroundScale: clampNumber(display.backgroundSizePercent, 100, 50, 300) / 100,
      titleTransform: `translate(${clampNumber(display.titleLeftPercent, 0, -50, 50)}%,${clampNumber(display.titleVerticalPercent, 0, -50, 50)}px)`,
      titleAlign: alignment(display.titleAlign),
      titleFontSizePx: 19 * clampNumber(display.titleSizePercent, 100, 70, 180) / 100,
      descriptionTransform: `translate(${clampNumber(display.descriptionLeftPercent, 0, -50, 50)}%,${clampNumber(display.descriptionVerticalPercent, 0, -50, 50)}px)`,
      descriptionAlign: alignment(display.descriptionAlign),
      descriptionFontSizePx: 14 * clampNumber(display.descriptionSizePercent, 100, 70, 180) / 100
    };
  }

  root.MVPLUX_CATEGORY_PRESENTATION = Object.freeze({ resolveCategoryPresentation, resolveCategoryCardLayout });
})(window);
