import type { MediaFolder } from '../types';

const BASE_TIME = 1794600000000;

export const DEFAULT_MEDIA_FOLDERS: MediaFolder[] = [
  {
    id: 'folder-honey-sweeteners',
    name: 'Honey & Natural Sweeteners',
    createdAt: BASE_TIME,
    images: [
      { id: 'img-pure-honey', name: 'Pure Honey (White Bg Bottle)', url: '/assets/aistudio/1_7a3bf903.png', createdAt: BASE_TIME },
      { id: 'img-pure-honey-kitchen', name: 'Pure Honey (Kitchen Pour)', url: '/assets/aistudio/2_32470c6e.png', createdAt: BASE_TIME },
      { id: 'img-pure-honey-podium', name: 'Pure Honey (Gold Podium)', url: '/assets/aistudio/3_25265580.png', createdAt: BASE_TIME },
      { id: 'img-natural-honey-jar', name: 'Natural Honey Jar (Magarantha Thean)', url: '/images/natural_honey_jar.jpg', createdAt: BASE_TIME },
      { id: 'img-forest-honey-podium', name: 'Forest Honey Podium Shot', url: '/assets/aistudio/1_99cf5a09.webp', createdAt: BASE_TIME },
      { id: 'img-malai-thean', name: 'Malai Thean Mountain Bottle', url: '/images/malai_thean_bottle.jpg', createdAt: BASE_TIME },
      { id: 'img-mixed-nuts', name: 'Honey Mixed Nuts Jar', url: '/assets/aistudio/2_6b73aea0.png', createdAt: BASE_TIME },
      { id: 'img-mixed-nuts-alt', name: 'Honey Mixed Nuts Detail', url: '/assets/aistudio/3_de51924a.png', createdAt: BASE_TIME },
      { id: 'img-honey-amla', name: 'Honey Amla Jar', url: '/images/banaya_amla.webp', createdAt: BASE_TIME },
      { id: 'img-amla-side', name: 'Honey Amla Packaging', url: '/assets/aistudio/amla_bade78da.webp', createdAt: BASE_TIME },
      { id: 'img-amla-detail', name: 'Honey Amla Infusion Shot', url: '/assets/aistudio/3_1f3dbf7a.png', createdAt: BASE_TIME },
      { id: 'img-rose-gulkand', name: 'Rose Gulkand Jar', url: '/assets/aistudio/3_6493340b.png', createdAt: BASE_TIME },
      { id: 'img-rose-gulkand-orig', name: 'Rose Gulkand Close-Up', url: '/images/banaya_rose_gulkand.jpg', createdAt: BASE_TIME }
    ]
  },
  {
    id: 'folder-uploaded-honey-sets',
    name: 'Pure & Wyldflower Honey Sets',
    createdAt: BASE_TIME + 500,
    images: [
      { id: 'img-up-pure-1', name: '1 Pure Honey (White Bg)', url: '/uploads/1-1794672134980-526233.png', createdAt: BASE_TIME + 500 },
      { id: 'img-up-pure-2', name: '2 Pure Honey (Kitchen Pour)', url: '/uploads/2-1794672135727-7bdca2.webp', createdAt: BASE_TIME + 500 },
      { id: 'img-up-pure-3', name: '3 Pure Honey (Gold Podium)', url: '/uploads/3-1794672136223-466f66.webp', createdAt: BASE_TIME + 500 },
      { id: 'img-up-wyld-1', name: '1 Wyldflower Honey (White Bg)', url: '/uploads/1-1794672278429-f6e5da.webp', createdAt: BASE_TIME + 500 },
      { id: 'img-up-wyld-2', name: '2 Wyldflower Honey (Pancakes)', url: '/uploads/2-1794672279215-4c2ce1.webp', createdAt: BASE_TIME + 500 },
      { id: 'img-up-wyld-3', name: '3 Wyldflower Honey (Gold Podium)', url: '/uploads/3-1794672279774-7f2a7c.webp', createdAt: BASE_TIME + 500 }
    ]
  },
  {
    id: 'folder-malts-kanji',
    name: 'Malts & Traditional Kanji',
    createdAt: BASE_TIME + 1000,
    images: [
      { id: 'img-abc-front', name: 'ABC Malt (Front Pouch)', url: '/images/abc_malt_front.jpg', createdAt: BASE_TIME },
      { id: 'img-abc-back', name: 'ABC Malt (Back Label)', url: '/images/abc_malt_back.jpg', createdAt: BASE_TIME },
      { id: 'img-abc-pouch', name: 'ABC Malt Standee Pouch', url: '/images/abc_malt_pouch.jpg', createdAt: BASE_TIME },
      { id: 'img-abc-lifestyle', name: 'ABC Malt Lifestyle Glass', url: '/assets/aistudio/3_7c33f12c.png', createdAt: BASE_TIME },
      { id: 'img-abc-poster', name: 'ABC Malt Infographic', url: '/images/abc_malt_poster.jpg', createdAt: BASE_TIME },
      { id: 'img-kanji-front', name: 'Karuppu Kavuni Kanji (Front)', url: '/images/karuppu_kavuni_kanji_front.jpg', createdAt: BASE_TIME },
      { id: 'img-kanji-back', name: 'Karuppu Kavuni Kanji (Back)', url: '/images/karuppu_kavuni_kanji_back.jpg', createdAt: BASE_TIME },
      { id: 'img-kanji-detail', name: 'Karuppu Kavuni Kanji Bowl', url: '/assets/aistudio/2_a1d23cb5.png', createdAt: BASE_TIME }
    ]
  },
  {
    id: 'folder-herbal-soap-ghee',
    name: 'Soups, Powders, Soap & Ghee',
    createdAt: BASE_TIME + 2000,
    images: [
      { id: 'img-mudavatukal-front', name: 'Mudavattukkal Soup (Front)', url: '/images/mudavatukal_soup_front.jpeg', createdAt: BASE_TIME },
      { id: 'img-mudavatukal-back', name: 'Mudavattukkal Soup (Back)', url: '/images/mudavatukal_soup_back.jpeg', createdAt: BASE_TIME },
      { id: 'img-mudavatukal-detail', name: 'Mudavattukkal Soup Bowl', url: '/assets/aistudio/2_80fb4fd9.png', createdAt: BASE_TIME },
      { id: 'img-murungai-front', name: 'Murungai Leaf Powder (Front)', url: '/images/murungai_pouch_front.jpg', createdAt: BASE_TIME },
      { id: 'img-murungai-side', name: 'Murungai Leaf Powder (Side)', url: '/images/murungai_leaf_powder.jpg', createdAt: BASE_TIME },
      { id: 'img-murungai-detail', name: 'Murungai Leaves Lifestyle', url: '/assets/aistudio/2_30f571b8.png', createdAt: BASE_TIME },
      { id: 'img-curry-front', name: 'Curry Leaf Powder (Front)', url: '/images/curry_leaf_pouch_front.jpg', createdAt: BASE_TIME },
      { id: 'img-curry-back', name: 'Curry Leaf Powder (Back)', url: '/images/curry_leaf_powder.jpg', createdAt: BASE_TIME },
      { id: 'img-natural-soap', name: 'Natural Herbal Soap', url: '/assets/aistudio/3_2e9e6c51.png', createdAt: BASE_TIME },
      { id: 'img-natural-soap-alt', name: 'Natural Herbal Soap Bar', url: '/assets/aistudio/2_b23bdfca.png', createdAt: BASE_TIME },
      { id: 'img-nalangu-pouch', name: 'Nalangu Maavu Pouch', url: '/images/nalangu_maavu_girls_pouch.jpg', createdAt: BASE_TIME },
      { id: 'img-desi-ghee', name: 'Pure Cow Ghee Jar', url: '/assets/aistudio/2_4b4979ee.png', createdAt: BASE_TIME }
    ]
  }
];
