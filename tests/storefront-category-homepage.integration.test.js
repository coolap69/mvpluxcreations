function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadHomepageCategoryRecords() {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const start = source.indexOf('function homepageCategoryRecords');
  const end = source.indexOf('\n\nfunction renderNormalizedHomepageCategoryCards', start);
  assert(start >= 0 && end > start, 'homepage Category selector must exist');
  return new Function(`${source.slice(start, end)}\nreturn homepageCategoryRecords;`)();
}

const publishedCategories = {
  sports: {
    key: 'sports',
    title: 'Sport Legends',
    description: 'Sports displays',
    visible: true,
    homepageVisible: true,
    order: 3,
    card: { image: 'images/sports.png', backgroundImage: 'images/stage.png', visible: false },
    displaySettings: { standeeSizePercent: 89, standeeLeftPercent: 14 }
  },
  music: {
    key: 'music',
    title: 'Music Artists',
    visible: true,
    homepageVisible: true,
    order: 1,
    card: { image: 'images/music.png' },
    displaySettings: { titleAlign: 'left' }
  },
  holiday: {
    key: 'holiday',
    title: 'Holiday',
    visible: true,
    homepageVisible: false,
    order: 2
  },
  hidden: {
    key: 'hidden',
    title: 'Hidden Category',
    visible: false,
    homepageVisible: true,
    order: 0
  },
  basketball: {
    key: 'basketball',
    title: 'Basketball',
    parentKey: 'sports',
    visible: true,
    homepageVisible: true,
    order: 0
  }
};

Deno.test('published visible Homepage Shown Main Categories render generically in published order', async () => {
  const select = await loadHomepageCategoryRecords();
  const result = select(publishedCategories);
  assert(result.map((category) => category.key).join(',') === 'music,sports', 'only eligible Main Categories must render in published order');
});

Deno.test('Homepage Hidden remains a published visible Category but is excluded from homepage cards', async () => {
  const select = await loadHomepageCategoryRecords();
  const result = select(publishedCategories);
  assert(publishedCategories.holiday.visible === true, 'fixture Category must remain available outside the homepage');
  assert(!result.some((category) => category.key === 'holiday'), 'homepageVisible:false must exclude only the homepage card');
});

Deno.test('hidden Categories and Child Groups never render as homepage Main Categories', async () => {
  const select = await loadHomepageCategoryRecords();
  const result = select(publishedCategories);
  assert(!result.some((category) => category.key === 'hidden'), 'visible:false must exclude the Category');
  assert(!result.some((category) => category.key === 'basketball'), 'parentKey records must not create homepage cards');
});

Deno.test('homepage cards retain authoritative published title, image, background, and display settings', async () => {
  const select = await loadHomepageCategoryRecords();
  const sports = select(publishedCategories).find((category) => category.key === 'sports');
  assert(sports.title === 'Sport Legends', 'published normalized title must remain authoritative');
  assert(sports.card.image === 'images/sports.png' && sports.card.backgroundImage === 'images/stage.png', 'published Category image references must be preserved');
  assert(sports.displaySettings.standeeSizePercent === 89 && sports.displaySettings.standeeLeftPercent === 14, 'published display settings must be preserved');
  assert(sports.card.visible === false, 'legacy card.visible may remain for compatibility data');
});

Deno.test('homepage Category rendering begins before private Admin state reads', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const init = source.slice(source.indexOf('document.addEventListener(\'DOMContentLoaded\''));
  const publishedLoad = init.indexOf('await loadPublishedAdminSettings()');
  const firstRender = init.indexOf('renderNormalizedHomepageCategoryCards()', publishedLoad);
  const privateLoad = init.indexOf('await loadLiveAdminSettings()', publishedLoad);
  assert(publishedLoad >= 0 && firstRender > publishedLoad && privateLoad > firstRender, 'published homepage cards must render before private Supabase/Admin reads');
});

Deno.test('homepage renderer clears stale cards when no Categories remain eligible', async () => {
  const source = await Deno.readTextFile(new URL('../script.js', import.meta.url));
  const start = source.indexOf('function renderNormalizedHomepageCategoryCards');
  const end = source.indexOf('\n\nfunction managedCategoryCardMarkup', start);
  const renderer = source.slice(start, end);
  assert(renderer.indexOf('grid.replaceChildren()') < renderer.indexOf('if (!categories.length)'), 'renderer must clear the authoritative mount before returning for an empty eligible set');
  assert(renderer.includes('grid.hidden = true'), 'an empty Category mount must not retain a stale visible card');
});
