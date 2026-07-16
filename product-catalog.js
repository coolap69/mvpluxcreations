(function () {
  const stage = 'images/FrontPageWeb/FanBackgrounds-top-favorite-stage-scifi.jpg';

  window.MVPLUX_PRODUCT_CATEGORIES = [
    { key: 'sports', label: 'Sports', page: 'sports-legends.html' },
    { key: 'movie-characters', label: 'Movie Characters', page: 'movie-inspired.html' },
    { key: 'people-public-figures', label: 'People / Public Figures', page: 'people-public-figures.html' },
    { key: 'music-artists', label: 'Music Artists', page: 'music-artists.html' },
    { key: 'faith-celebration', label: 'Faith / Celebration', page: 'religious-cutouts.html' },
    { key: 'holiday', label: 'Holiday', page: 'holiday-cutouts.html' },
    { key: 'dinosaur-animal', label: 'Dinosaur / Animal', page: 'dinosaur-cutouts.html' },
    { key: 'fan-requests', label: 'Fan Requests', page: 'fan-inspired.html' },
    { key: 'video-game-fantasy', label: 'Video Game / Fantasy', page: 'videogame-cutouts.html' },
    {
      key: 'custom-other',
      label: 'Custom / Other',
      pages: ['custom-photo-cutouts.html', 'small-cutout-party-packs.html']
    }
  ];

  const product = (slug, title, cutoutImage, originalHeight, categories, order, description) => ({
    slug,
    title,
    description: description || `Preview ${title} with its available size and display options.`,
    cutoutImage,
    backgroundImage: stage,
    originalHeight,
    categories,
    visible: true,
    categoryOrder: Object.fromEntries(categories.map((category) => [category, order]))
  });

  window.MVPLUX_PRODUCT_CATALOG = [
    product('kobe-bryant', 'Kobe Bryant', 'images/SportLegendStandees/Kobe/KB1nobackground.png', 78, ['sports'], 0),
    product('shaq', "Shaquille O'Neal", 'images/SportLegendStandees/Shaq/shaqNEW.png', 85, ['sports'], 1),
    { ...product('basketball-center', 'Basketball Center Standee', 'images/SportLegendStandees/Shaq/shaqNEW.png', 85, [], 0), visible: false },
    { ...product('alternate-sports-pose', 'Alternate Sports Pose Standee', 'images/SportLegendStandees/Shaq/shaqDarker.png', 85, [], 0), visible: false },
    product('michael-jordan', 'Michael Jordan', 'images/SportLegendStandees/MJordan/MJLAYUP1/Jordanemptybackground.png', 78, ['sports'], 2),
    product('michael-jordan-layup', 'Michael Jordan Layup', 'images/SportLegendStandees/MJordan/MJLAYUP/Jordantofixlblueightlowres.png', 78, ['sports'], 3),
    product('lionel-messi', 'Lionel Messi', 'images/SportLegendStandees/Messi/Messi2nobackground.png', 67, ['sports'], 4),
    product('lionel-messi-classic', 'Lionel Messi Classic', 'images/SportLegendStandees/Messi/Messinnone.png', 67, ['sports'], 5),
    product('tom-brady', 'Tom Brady', 'images/SportLegendStandees/TomBrady/TB12Nobackground.png', 76, ['sports'], 6),

    product('endoskeleton-dark', 'Endoskeleton Dark', 'images/MovieCharacterStandees/Endorskeleton/Endordarkinsideshouldercutout.png', 78, ['movie-characters'], 0),
    product('endoskeleton-white', 'Endoskeleton White', 'images/MovieCharacterStandees/Endorskeleton/Endorwhiteinsideshouldercutout.png', 78, ['movie-characters'], 1),
    product('classic-horror-host', 'Classic Horror Host', 'images/MovieCharacterStandees/Elvira/elviranew.png', 67, ['movie-characters'], 2),

    product('public-figure-clean-cutout', 'Public Figure Clean Cutout', 'images/PeoplePublicFigureStandees/President/Nobackgroubd.png', 78, ['people-public-figures'], 0),
    product('public-figure-stage-look', 'Public Figure Stage Look', 'images/PeoplePublicFigureStandees/President/lasrT2.png', 78, ['people-public-figures'], 1),
    product('public-figure-white-look', 'Public Figure White Look', 'images/PeoplePublicFigureStandees/President/lasrT2white.png', 78, ['people-public-figures'], 2),

    product('red-jacket-performer', 'Red Jacket Performer', 'images/MusicArtistStandees/MichaelJackson/MJacksonTriller/MJTR/MJTR.png', 69, ['music-artists'], 0),
    product('zombie-dance-look', 'Zombie Dance Look', 'images/MusicArtistStandees/MichaelJackson/MJacksonTriller/MJTR2/MJzombie.png', 69, ['music-artists'], 1),
    product('pop-star-look', 'Pop Star Look', 'images/MusicArtistStandees/TaylorSwift/TSfinal.png', 71, ['music-artists'], 2),

    {
      ...product('celebration-display', 'Celebration Display', 'images/FaithCelebrationStandees/Jesus1/J13D.png', 72, ['faith-celebration'], 0),
      imageChoices: [
        { label: 'Light', image: 'images/FaithCelebrationStandees/Jesus1/J13LN.png', stage: 'images/FanBackgrounds/top-favorite-stage-premium.png' },
        { label: 'Print', image: 'images/FaithCelebrationStandees/Jesus3/JesusPrint.png', stage: 'images/FanBackgrounds/gallery-poster-premium.png' }
      ]
    },

    product('holiday-display', 'Holiday Display', 'images/FrontPageWeb/Herobackgroundparts-hero8T.png', 78, ['holiday'], 0),
    product('seasonal-display', 'Seasonal Display', 'images/Herobackgroundparts/hero8T.png', 78, ['holiday'], 1),
    product('holiday-event-display', 'Event Display', 'images/Herobackgroundparts/hero10E.png', 78, ['holiday'], 2),

    product('t-rex', 'T-Rex', 'images/DinosaurCreatureStandees/JPRex.png', 72, ['dinosaur-animal'], 0),
    product('dinosaur-group', 'Dinosaur Group', 'images/DinosaurCreatureStandees/JPall.png', 78, ['dinosaur-animal'], 1),
    product('clean-t-rex', 'Clean T-Rex', 'images/FrontPageWeb/Dinosaurs-JPRex-clean.png', 78, ['dinosaur-animal'], 2),

    product('dance-request', 'Dance Request', 'images/MusicArtistStandees/MichaelJackson/MJacksonTriller/MJTR2/MJzombie.png', 69, ['fan-requests'], 0),
    { ...product('fan-hero', 'Fan Hero', 'images/Herobackgroundparts/hero4JB.png', 78, [], 0), visible: false },
    { ...product('guest-request', 'Guest Request', 'images/PeoplePublicFigureStandees/President/lasrT2.png', 78, [], 0), visible: false },

    product('fantasy-hero', 'Fantasy Hero', 'images/Herobackgroundparts/hero10E.png', 78, ['video-game-fantasy'], 0),
    product('arcade-hero', 'Arcade Hero', 'images/Herobackgroundparts/hero7T.png', 78, ['video-game-fantasy'], 1),
    product('adventure-hero', 'Adventure Hero', 'images/Herobackgroundparts/hero8T.png', 78, ['video-game-fantasy'], 2),

    product('single-person', 'Single Person', 'images/Herobackgroundparts/hero7T.png', 78, ['custom-other'], 0),
    product('group-moment', 'Group Moment', 'images/Herobackgroundparts/hero-left.png', 78, ['custom-other'], 1),
    product('custom-photo-event-display', 'Event Display', 'images/Herobackgroundparts/hero-right.png', 78, ['custom-other'], 2),
    product('three-foot-starter', '3ft Starter', 'images/Herobackgroundparts/hero8T.png', 36, ['custom-other'], 3),
    product('table-display', 'Table Display', 'images/Herobackgroundparts/hero7T.png', 36, ['custom-other'], 4),
    product('party-bundle', 'Party Bundle', 'images/Herobackgroundparts/hero10E.png', 36, ['custom-other'], 5)
  ];
})();
