/**
 * Official / nationally recognized languages per world-map SVG path id.
 *
 * Each entry lists one or more languages. `code` is set when that language
 * is (or will be) a Wordaholic catalog language; favoriting still requires
 * the code to exist in the live `/data/languages.json` catalog.
 *
 * @typedef {{ name: string, code?: string }} OfficialLanguage
 * @typedef {{ country: string, languages: OfficialLanguage[] }} CountryInfo
 */

/** @type {Record<string, CountryInfo>} */
const BY_ID = Object.create(null);

/** @param {string} name @param {string} [code] @returns {OfficialLanguage} */
const L = (name, code) => (code ? { name, code } : { name });

/**
 * @param {string[]} ids
 * @param {string} country
 * @param {OfficialLanguage[]} languages
 */
function mapIds(ids, country, languages) {
  const meta = { country, languages };
  for (const id of ids) BY_ID[id] = meta;
}

/**
 * @param {string[]} ids
 * @param {Record<string, string>} labels  id → country display name
 * @param {OfficialLanguage[]} languages
 */
function mapLabeled(ids, labels, languages) {
  for (const id of ids) {
    BY_ID[id] = { country: labels[id] || id, languages };
  }
}

/* ── Wordaholic-supported language regions ── */

mapLabeled(
  [
    'usa', 'alaska', 'alaska-westcopy', 'hawaii', 'oahu', 'kauai', 'kahului',
    'adak', 'adak west', 'amchitka', 'amchitka west', 'attu', 'attu west',
    'umnak', 'umnak west', 'unalaska', 'unalaska west', 'another aleutian west',
    'st. lawrence island', 'st. lawrence island west', 'bering island', 'medny',
  ],
  {
    usa: 'United States', alaska: 'Alaska (USA)', 'alaska-westcopy': 'Alaska (USA)',
    hawaii: 'Hawaii (USA)', oahu: 'Hawaii (USA)', kauai: 'Hawaii (USA)', kahului: 'Hawaii (USA)',
  },
  [L('English', 'en')]
);

mapIds(['britain', 'ulster'], 'United Kingdom', [L('English', 'en'), L('Welsh'), L('Scottish Gaelic')]);
BY_ID.britain = { country: 'United Kingdom', languages: [L('English', 'en'), L('Welsh'), L('Scottish Gaelic')] };
BY_ID.ulster = { country: 'Northern Ireland', languages: [L('English', 'en'), L('Irish')] };

mapIds(['ireland'], 'Ireland', [L('Irish'), L('English', 'en')]);

mapLabeled(
  ['australia', 'tasmania'],
  { australia: 'Australia', tasmania: 'Tasmania (Australia)' },
  [L('English', 'en')]
);

mapLabeled(
  ['new zealand north island', 'new zealand south island'],
  {
    'new zealand north island': 'New Zealand',
    'new zealand south island': 'New Zealand',
  },
  [L('English', 'en'), L('Māori')]
);

mapLabeled(
  [
    'canada', 'newfoundland', 'vancouver', 'haida gwaii',
    'baffin', 'victoria', 'banks', 'devon', 'ellesmere', 'prince of wales',
    'prince patrick', 'southhampton', 'bylot', 'axel heiberg', 'ellef ringnes',
    'amund ringnes', 'mackenzie king', 'bathurst', 'cornwallis', 'prince george',
    'salisbury', 'prescott', 'eglinton', 'bell',
  ],
  {
    canada: 'Canada',
    newfoundland: 'Newfoundland (Canada)',
    vancouver: 'Vancouver Island (Canada)',
    'haida gwaii': 'Haida Gwaii (Canada)',
  },
  [L('English', 'en'), L('French', 'fr')]
);

mapIds(['jamaica'], 'Jamaica', [L('English', 'en')]);
mapIds(['trinidad'], 'Trinidad and Tobago', [L('English', 'en')]);
mapIds(['belize'], 'Belize', [L('English', 'en'), L('Spanish', 'es')]);
mapIds(['guyana'], 'Guyana', [L('English', 'en')]);
mapIds(['puerto rico'], 'Puerto Rico', [L('Spanish', 'es'), L('English', 'en')]);

mapLabeled(
  ['andros', 'grand bahama', 'eleuthera', 'inagua', 'bimini'],
  {
    andros: 'Bahamas', 'grand bahama': 'Bahamas', eleuthera: 'Bahamas',
    inagua: 'Bahamas', bimini: 'Bahamas',
  },
  [L('English', 'en')]
);

mapIds(['dominica'], 'Dominica', [L('English', 'en')]);
mapIds(['st. lucia'], 'Saint Lucia', [L('English', 'en')]);
mapIds(['st. vincent'], 'Saint Vincent', [L('English', 'en')]);
mapIds(['grenada'], 'Grenada', [L('English', 'en')]);

mapIds(['nigeria'], 'Nigeria', [L('English', 'en')]);
mapIds(['ghana'], 'Ghana', [L('English', 'en')]);
mapIds(['kenya'], 'Kenya', [L('Swahili'), L('English', 'en')]);
mapIds(['liberia'], 'Liberia', [L('English', 'en')]);
mapIds(['sierra leone'], 'Sierra Leone', [L('English', 'en')]);
mapIds(['gambia'], 'Gambia', [L('English', 'en')]);
mapIds(['botswana'], 'Botswana', [L('English', 'en'), L('Setswana')]);
mapIds(['zimbabwe'], 'Zimbabwe', [L('English', 'en'), L('Shona'), L('Ndebele')]);
mapIds(['zambia'], 'Zambia', [L('English', 'en')]);
mapIds(['malawi'], 'Malawi', [L('English', 'en'), L('Chichewa')]);
mapIds(['uganda'], 'Uganda', [L('English', 'en'), L('Swahili')]);
mapIds(['south africa'], 'South Africa', [
  L('English', 'en'), L('Afrikaans'), L('Zulu'), L('Xhosa'), L('Sotho'),
]);
mapIds(['namibia'], 'Namibia', [L('English', 'en'), L('Afrikaans'), L('German')]);
mapIds(['malta'], 'Malta', [L('Maltese'), L('English', 'en')]);
mapIds(['fiji'], 'Fiji', [L('English', 'en'), L('Fijian'), L('Fiji Hindi')]);
mapIds(['papua new guinea', 'new britain', 'new ireland', 'bougainville'], 'Papua New Guinea', [
  L('English', 'en'), L('Tok Pisin'), L('Hiri Motu'),
]);
BY_ID['new britain'] = { country: 'Papua New Guinea', languages: [L('English', 'en'), L('Tok Pisin')] };
BY_ID['new ireland'] = { country: 'Papua New Guinea', languages: [L('English', 'en'), L('Tok Pisin')] };
BY_ID.bougainville = { country: 'Papua New Guinea', languages: [L('English', 'en'), L('Tok Pisin')] };

mapLabeled(
  ['choiseul', 'santa isabel', 'malaita', 'new georgia', 'rennell', 'santa ana'],
  {
    choiseul: 'Solomon Islands', 'santa isabel': 'Solomon Islands', malaita: 'Solomon Islands',
    'new georgia': 'Solomon Islands', rennell: 'Solomon Islands', 'santa ana': 'Solomon Islands',
  },
  [L('English', 'en')]
);

mapLabeled(
  ['falklands east', 'falklands west'],
  { 'falklands east': 'Falkland Islands', 'falklands west': 'Falkland Islands' },
  [L('English', 'en')]
);

mapIds(['south_sudan'], 'South Sudan', [L('English', 'en')]);

/* Russian */
mapLabeled(
  [
    'russia', 'sakhalin', 'chukotka', 'wrangel', 'wrangel-w',
    'novaya zemlya north', 'novaya zemlya south', 'novaya sibir', 'kotelny',
    'lyakhovsky', 'komsomolets', 'october', 'bolshevik',
    'paramushir', 'onekotan', 'iturup', 'urup',
  ],
  {
    russia: 'Russia', sakhalin: 'Sakhalin (Russia)', chukotka: 'Chukotka (Russia)',
  },
  [L('Russian', 'ru')]
);
mapIds(['belarus'], 'Belarus', [L('Belarusian'), L('Russian', 'ru')]);

/* French (+ bilingual) */
mapLabeled(
  ['france', 'corsica', 'guyane', 'reunion', 'mayotte', 'martinique', 'guadeloupe'],
  {
    france: 'France', corsica: 'Corsica (France)', guyane: 'French Guiana',
    reunion: 'Réunion', mayotte: 'Mayotte', martinique: 'Martinique', guadeloupe: 'Guadeloupe',
  },
  [L('French', 'fr')]
);

mapIds(['haiti'], 'Haiti', [L('Haitian Creole'), L('French', 'fr')]);
mapIds(['senegal', 'casamance'], 'Senegal', [L('French', 'fr'), L('Wolof')]);
BY_ID.casamance = { country: 'Senegal', languages: [L('French', 'fr'), L('Wolof')] };
mapIds(['mali'], 'Mali', [L('French', 'fr'), L('Bambara')]);
mapIds(['niger'], 'Niger', [L('French', 'fr'), L('Hausa')]);
mapIds(['burkina'], 'Burkina Faso', [L('French', 'fr')]);
mapIds(['ivoire'], 'Côte d’Ivoire', [L('French', 'fr')]);
mapIds(['guinee'], 'Guinea', [L('French', 'fr')]);
mapIds(['benin'], 'Benin', [L('French', 'fr')]);
mapIds(['togo'], 'Togo', [L('French', 'fr')]);
mapIds(['congo'], 'Republic of the Congo', [L('French', 'fr')]);
mapIds(['drc'], 'DR Congo', [L('French', 'fr'), L('Lingala'), L('Swahili'), L('Kikongo')]);
mapIds(['gabon'], 'Gabon', [L('French', 'fr')]);
mapIds(['cameroon'], 'Cameroon', [L('French', 'fr'), L('English', 'en')]);
mapIds(['chad'], 'Chad', [L('French', 'fr'), L('Arabic')]);
mapIds(['centrafrique'], 'Central African Republic', [L('French', 'fr'), L('Sango')]);
mapIds(['rwanda'], 'Rwanda', [L('Kinyarwanda'), L('English', 'en'), L('French', 'fr')]);
mapIds(['burundi'], 'Burundi', [L('Kirundi'), L('French', 'fr'), L('English', 'en')]);
mapIds(['madagascar'], 'Madagascar', [L('Malagasy'), L('French', 'fr')]);
mapIds(['mauritius'], 'Mauritius', [L('English', 'en'), L('French', 'fr'), L('Mauritian Creole')]);
mapIds(['luxembourg'], 'Luxembourg', [L('Luxembourgish'), L('French', 'fr'), L('German')]);
mapIds(['monaco'], 'Monaco', [L('French', 'fr')]);
mapIds(['new caledonia'], 'New Caledonia', [L('French', 'fr')]);
mapLabeled(
  ['tahiti', 'raiatea'],
  { tahiti: 'French Polynesia', raiatea: 'French Polynesia' },
  [L('French', 'fr'), L('Tahitian')]
);
mapLabeled(
  ['mahe', 'praslin', 'aldabra'],
  { mahe: 'Seychelles', praslin: 'Seychelles', aldabra: 'Seychelles' },
  [L('English', 'en'), L('French', 'fr'), L('Seychellois Creole')]
);

/* Spanish (+ bilingual) */
mapLabeled(
  ['spain', 'majorca', 'lanzarote', 'gran canaria', 'tenerife'],
  {
    spain: 'Spain', majorca: 'Mallorca (Spain)',
    lanzarote: 'Canary Islands (Spain)', 'gran canaria': 'Canary Islands (Spain)',
    tenerife: 'Canary Islands (Spain)',
  },
  [L('Spanish', 'es'), L('Catalan'), L('Galician'), L('Basque')]
);
BY_ID.majorca = { country: 'Mallorca (Spain)', languages: [L('Spanish', 'es'), L('Catalan')] };
BY_ID.lanzarote = { country: 'Canary Islands (Spain)', languages: [L('Spanish', 'es')] };
BY_ID['gran canaria'] = { country: 'Canary Islands (Spain)', languages: [L('Spanish', 'es')] };
BY_ID.tenerife = { country: 'Canary Islands (Spain)', languages: [L('Spanish', 'es')] };

mapIds(['mexico'], 'Mexico', [L('Spanish', 'es')]);
mapIds(['guatemala'], 'Guatemala', [L('Spanish', 'es')]);
mapIds(['honduras'], 'Honduras', [L('Spanish', 'es')]);
mapIds(['el salvador'], 'El Salvador', [L('Spanish', 'es')]);
mapIds(['nicaragua'], 'Nicaragua', [L('Spanish', 'es')]);
mapIds(['costa rica'], 'Costa Rica', [L('Spanish', 'es')]);
mapIds(['panama'], 'Panama', [L('Spanish', 'es')]);
mapIds(['cuba'], 'Cuba', [L('Spanish', 'es')]);
mapIds(['domincan republic'], 'Dominican Republic', [L('Spanish', 'es')]);
mapIds(['haiti-dominican border'], 'Hispaniola', [L('Spanish', 'es'), L('French', 'fr')]);
mapIds(['colombia'], 'Colombia', [L('Spanish', 'es')]);
mapIds(['venezuela'], 'Venezuela', [L('Spanish', 'es')]);
mapIds(['ecuador', 'galapagos'], 'Ecuador', [L('Spanish', 'es'), L('Quechua')]);
BY_ID.galapagos = { country: 'Galápagos (Ecuador)', languages: [L('Spanish', 'es')] };
mapIds(['peru'], 'Peru', [L('Spanish', 'es'), L('Quechua'), L('Aymara')]);
mapIds(['bolivia'], 'Bolivia', [L('Spanish', 'es'), L('Quechua'), L('Aymara'), L('Guaraní')]);
mapIds(['paraguay'], 'Paraguay', [L('Spanish', 'es'), L('Guaraní')]);
mapIds(['chile', 'chiloe', 'tierra del fuego chile'], 'Chile', [L('Spanish', 'es')]);
BY_ID.chiloe = { country: 'Chile', languages: [L('Spanish', 'es')] };
BY_ID['tierra del fuego chile'] = { country: 'Chile', languages: [L('Spanish', 'es')] };
mapIds(['argentina', 'tierra del fuego argentina'], 'Argentina', [L('Spanish', 'es')]);
BY_ID['tierra del fuego argentina'] = { country: 'Argentina', languages: [L('Spanish', 'es')] };
mapIds(['uruguay'], 'Uruguay', [L('Spanish', 'es')]);
mapIds(['equatorial guinea', 'bioko'], 'Equatorial Guinea', [
  L('Spanish', 'es'), L('French', 'fr'), L('Portuguese'),
]);
BY_ID.bioko = { country: 'Equatorial Guinea', languages: [L('Spanish', 'es'), L('French', 'fr'), L('Portuguese')] };

mapIds(['israel'], 'Israel', [L('Hebrew', 'he'), L('Arabic')]);
mapIds(['armenia'], 'Armenia', [L('Armenian', 'hy')]);

/* ── Other countries (hover; codes only when in catalog) ── */

mapIds(['germany'], 'Germany', [L('German')]);
mapIds(['austria'], 'Austria', [L('German')]);
mapIds(['switzerland'], 'Switzerland', [L('German'), L('French', 'fr'), L('Italian'), L('Romansh')]);
mapIds(['belgium'], 'Belgium', [L('Dutch'), L('French', 'fr'), L('German')]);
mapIds(['netherlands'], 'Netherlands', [L('Dutch')]);
mapIds(['suriname'], 'Suriname', [L('Dutch')]);
mapIds(['portugal', 'madeira', 'sao miguel', 'terceira', 'pico'], 'Portugal', [L('Portuguese')]);
BY_ID.madeira = { country: 'Madeira (Portugal)', languages: [L('Portuguese')] };
BY_ID['sao miguel'] = { country: 'Azores (Portugal)', languages: [L('Portuguese')] };
BY_ID.terceira = { country: 'Azores (Portugal)', languages: [L('Portuguese')] };
BY_ID.pico = { country: 'Azores (Portugal)', languages: [L('Portuguese')] };
mapIds(['brazil'], 'Brazil', [L('Portuguese')]);
mapIds(['angola', 'cabinda'], 'Angola', [L('Portuguese')]);
BY_ID.cabinda = { country: 'Angola', languages: [L('Portuguese')] };
mapIds(['mozambique'], 'Mozambique', [L('Portuguese')]);
mapIds(['bissau'], 'Guinea-Bissau', [L('Portuguese')]);
mapIds(['sao tome', 'principe'], 'São Tomé and Príncipe', [L('Portuguese')]);
mapIds(['santiago', 'boa vista', 'santo antao'], 'Cape Verde', [L('Portuguese')]);
BY_ID.santiago = { country: 'Cape Verde', languages: [L('Portuguese')] };
BY_ID['boa vista'] = { country: 'Cape Verde', languages: [L('Portuguese')] };
BY_ID['santo antao'] = { country: 'Cape Verde', languages: [L('Portuguese')] };

mapIds(['italy', 'sicily', 'sardinia'], 'Italy', [L('Italian')]);
BY_ID.sicily = { country: 'Italy', languages: [L('Italian')] };
BY_ID.sardinia = { country: 'Italy', languages: [L('Italian')] };
mapIds(['greece', 'crete', 'thrace'], 'Greece', [L('Greek')]);
BY_ID.crete = { country: 'Greece', languages: [L('Greek')] };
BY_ID.thrace = { country: 'Greece', languages: [L('Greek')] };
mapIds(['cyprus'], 'Cyprus', [L('Greek'), L('Turkish')]);
mapIds(['turkey'], 'Turkey', [L('Turkish')]);
mapIds(['poland'], 'Poland', [L('Polish')]);
mapIds(['czech'], 'Czechia', [L('Czech')]);
mapIds(['slovakia'], 'Slovakia', [L('Slovak')]);
mapIds(['hungary'], 'Hungary', [L('Hungarian')]);
mapIds(['romania'], 'Romania', [L('Romanian')]);
mapIds(['moldova'], 'Moldova', [L('Romanian'), L('Russian', 'ru')]);
mapIds(['bulgaria'], 'Bulgaria', [L('Bulgarian')]);
mapIds(['serbia'], 'Serbia', [L('Serbian')]);
mapIds(['croatia'], 'Croatia', [L('Croatian')]);
mapIds(['bosnia'], 'Bosnia and Herzegovina', [L('Bosnian'), L('Croatian'), L('Serbian')]);
mapIds(['montenegro'], 'Montenegro', [L('Montenegrin')]);
mapIds(['slovenia'], 'Slovenia', [L('Slovenian')]);
mapIds(['albania'], 'Albania', [L('Albanian')]);
mapIds(['macedonia'], 'North Macedonia', [L('Macedonian'), L('Albanian')]);
mapIds(['ukraine'], 'Ukraine', [L('Ukrainian')]);
mapIds(['lithuania'], 'Lithuania', [L('Lithuanian')]);
mapIds(['estonia', 'hiumaa', 'saaremaa'], 'Estonia', [L('Estonian')]);
BY_ID.hiumaa = { country: 'Estonia', languages: [L('Estonian')] };
BY_ID.saaremaa = { country: 'Estonia', languages: [L('Estonian')] };
mapIds(['finland'], 'Finland', [L('Finnish'), L('Swedish')]);
mapIds(['sweden', 'gotland'], 'Sweden', [L('Swedish')]);
BY_ID.gotland = { country: 'Sweden', languages: [L('Swedish')] };
mapIds(['norway', 'spitsbergen', 'nordaustlandet', 'edgeoya'], 'Norway', [L('Norwegian')]);
mapIds(['denmark', 'sjælland'], 'Denmark', [L('Danish')]);
BY_ID['sjælland'] = { country: 'Denmark', languages: [L('Danish')] };
mapIds(['iceland'], 'Iceland', [L('Icelandic')]);
mapIds(['greenland', 'disko'], 'Greenland', [L('Greenlandic'), L('Danish')]);
BY_ID.disko = { country: 'Greenland', languages: [L('Greenlandic'), L('Danish')] };

mapIds(['morocco'], 'Morocco', [L('Arabic'), L('Tamazight'), L('French', 'fr')]);
mapIds(['algeria'], 'Algeria', [L('Arabic'), L('Tamazight'), L('French', 'fr')]);
mapIds(['tunisia'], 'Tunisia', [L('Arabic'), L('French', 'fr')]);
mapIds(['libya'], 'Libya', [L('Arabic')]);
mapIds(['egypt'], 'Egypt', [L('Arabic')]);
mapIds(['sudan'], 'Sudan', [L('Arabic'), L('English', 'en')]);
mapIds(['mauretania'], 'Mauritania', [L('Arabic')]);
mapIds(['saudi'], 'Saudi Arabia', [L('Arabic')]);
mapIds(['yemen', 'soqotra'], 'Yemen', [L('Arabic')]);
BY_ID.soqotra = { country: 'Yemen', languages: [L('Arabic')] };
mapIds(['oman'], 'Oman', [L('Arabic')]);
mapIds(['emirates'], 'United Arab Emirates', [L('Arabic'), L('English', 'en')]);
mapIds(['qatar'], 'Qatar', [L('Arabic'), L('English', 'en')]);
mapIds(['kuwait'], 'Kuwait', [L('Arabic')]);
mapIds(['iraq'], 'Iraq', [L('Arabic'), L('Kurdish')]);
mapIds(['syria'], 'Syria', [L('Arabic')]);
mapIds(['jordan'], 'Jordan', [L('Arabic')]);
mapIds(['lebanon'], 'Lebanon', [L('Arabic'), L('French', 'fr'), L('English', 'en')]);

mapIds(['iran'], 'Iran', [L('Persian')]);
mapIds(['afghanistan'], 'Afghanistan', [L('Dari'), L('Pashto')]);
mapIds(['pakistan'], 'Pakistan', [L('Urdu'), L('English', 'en')]);
mapIds(['india'], 'India', [L('Hindi'), L('English', 'en')]);
mapIds(['bangladesh'], 'Bangladesh', [L('Bengali')]);
mapIds(['nepal'], 'Nepal', [L('Nepali')]);
mapIds(['bhutan'], 'Bhutan', [L('Dzongkha'), L('English', 'en')]);
mapIds(['sri lanka'], 'Sri Lanka', [L('Sinhala'), L('Tamil'), L('English', 'en')]);
mapIds(['maldive', 'male', 'gan'], 'Maldives', [L('Dhivehi')]);
BY_ID.male = { country: 'Maldives', languages: [L('Dhivehi')] };
BY_ID.gan = { country: 'Maldives', languages: [L('Dhivehi')] };

mapIds(['china', 'hainan'], 'China', [L('Mandarin Chinese')]);
BY_ID.hainan = { country: 'China', languages: [L('Mandarin Chinese')] };
mapIds(['taiwan'], 'Taiwan', [L('Mandarin Chinese')]);
mapIds(['mongolia'], 'Mongolia', [L('Mongolian')]);
mapIds(['north korea'], 'North Korea', [L('Korean')]);
mapIds(['south korea'], 'South Korea', [L('Korean')]);
mapIds(['honshu', 'hokkaido', 'kyushu', 'shikoku'], 'Japan', [L('Japanese')]);
BY_ID.honshu = { country: 'Japan', languages: [L('Japanese')] };
BY_ID.hokkaido = { country: 'Japan', languages: [L('Japanese')] };
BY_ID.kyushu = { country: 'Japan', languages: [L('Japanese')] };
BY_ID.shikoku = { country: 'Japan', languages: [L('Japanese')] };
mapIds(['vietnam'], 'Vietnam', [L('Vietnamese')]);
mapIds(['laos'], 'Laos', [L('Lao')]);
mapIds(['cambodia'], 'Cambodia', [L('Khmer')]);
mapIds(['thailand'], 'Thailand', [L('Thai')]);
mapIds(['burma'], 'Myanmar', [L('Burmese')]);
mapIds(['malaysia', 'east malaysia'], 'Malaysia', [L('Malay'), L('English', 'en')]);
BY_ID['east malaysia'] = { country: 'Malaysia', languages: [L('Malay'), L('English', 'en')] };
mapIds(['brunei'], 'Brunei', [L('Malay'), L('English', 'en')]);
mapIds(
  ['sumatra', 'java', 'kalimantan', 'sulawesi', 'irian jaya', 'bali', 'lombok', 'flores', 'sumba', 'timor', 'seram', 'maluku'],
  'Indonesia',
  [L('Indonesian')]
);
for (const id of ['sumatra', 'java', 'kalimantan', 'sulawesi', 'irian jaya', 'bali', 'lombok', 'flores', 'sumba', 'timor', 'seram', 'maluku']) {
  BY_ID[id] = { country: 'Indonesia', languages: [L('Indonesian')] };
}
mapIds(['luzon', 'cebu', 'negros', 'mindoro', 'samar', 'palawan'], 'Philippines', [
  L('Filipino'), L('English', 'en'),
]);
for (const id of ['luzon', 'cebu', 'negros', 'mindoro', 'samar', 'palawan']) {
  BY_ID[id] = { country: 'Philippines', languages: [L('Filipino'), L('English', 'en')] };
}

mapIds(['kazakhstan'], 'Kazakhstan', [L('Kazakh'), L('Russian', 'ru')]);
mapIds(['uzbekistan'], 'Uzbekistan', [L('Uzbek'), L('Russian', 'ru')]);
mapIds(['turkmenistan'], 'Turkmenistan', [L('Turkmen'), L('Russian', 'ru')]);
mapIds(['tajikistan'], 'Tajikistan', [L('Tajik'), L('Russian', 'ru')]);
mapIds(['kirgizstan'], 'Kyrgyzstan', [L('Kyrgyz'), L('Russian', 'ru')]);
mapIds(['azerbaijan'], 'Azerbaijan', [L('Azerbaijani'), L('Russian', 'ru')]);
mapIds(['georgia'], 'Georgia', [L('Georgian')]);
mapIds(['ethiopia'], 'Ethiopia', [L('Amharic'), L('Oromo'), L('English', 'en')]);
mapIds(['eritrea'], 'Eritrea', [L('Tigrinya'), L('Arabic'), L('English', 'en')]);
mapIds(['somalia', 'somaliland'], 'Somalia', [L('Somali'), L('Arabic')]);
BY_ID.somaliland = { country: 'Somaliland', languages: [L('Somali'), L('Arabic')] };
mapIds(['djibouti'], 'Djibouti', [L('French', 'fr'), L('Arabic'), L('Somali')]);
mapIds(['tanzania'], 'Tanzania', [L('Swahili'), L('English', 'en')]);
mapIds(['lesotho'], 'Lesotho', [L('Sesotho'), L('English', 'en')]);
mapIds(['swaziland'], 'Eswatini', [L('Swazi'), L('English', 'en')]);
mapIds(['grande comore'], 'Comoros', [L('Comorian'), L('Arabic'), L('French', 'fr')]);
mapIds(['efate', 'espiritu santo', 'malakula'], 'Vanuatu', [
  L('Bislama'), L('English', 'en'), L('French', 'fr'),
]);
BY_ID.efate = { country: 'Vanuatu', languages: [L('Bislama'), L('English', 'en'), L('French', 'fr')] };
BY_ID['espiritu santo'] = { country: 'Vanuatu', languages: [L('Bislama'), L('English', 'en'), L('French', 'fr')] };
BY_ID.malakula = { country: 'Vanuatu', languages: [L('Bislama'), L('English', 'en'), L('French', 'fr')] };

mapLabeled(
  ['east antarctica', 'antarctic peninsula', 'alexander', 'smyley', 'thurston', 'elephant', 'king george', 'james ross', 'robert', 'kerguelen'],
  {
    'east antarctica': 'Antarctica',
    'antarctic peninsula': 'Antarctica',
  },
  [L('—')]
);

/**
 * @param {string | null | undefined} svgId
 * @returns {CountryInfo | null}
 */
export function getCountryLanguage(svgId) {
  if (!svgId) return null;
  return BY_ID[svgId] || null;
}

/**
 * @param {CountryInfo | null | undefined} info
 * @param {Set<string>} supported
 * @returns {string[]}
 */
export function playableLanguageCodes(info, supported) {
  if (!info?.languages?.length) return [];
  const codes = [];
  for (const lang of info.languages) {
    if (lang.code && supported.has(lang.code) && !codes.includes(lang.code)) {
      codes.push(lang.code);
    }
  }
  return codes;
}

/**
 * @param {string} svgId
 */
export function fallbackCountryName(svgId) {
  return svgId.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export { BY_ID as COUNTRY_LANGUAGES };
