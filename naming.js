// Builds the "{radnja}" and "{stavke}" parts of a file name from the receipt's shop and items, with plain rules:
//   1-2 items          -> the item names:            Viljuska_Desna_i_Termostat
//   a branded device   -> brand + device:            Bosch_Inverter_Klime
//   more items         -> categories by amount:      Rasveta_Jastuci_i_Posteljina, Uticnice_Maske_i_Ostalo

const LATIN = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Ђ: 'Dj', Е: 'E', Ж: 'Z', З: 'Z', И: 'I', Ј: 'J', К: 'K', Л: 'L', Љ: 'Lj',
  М: 'M', Н: 'N', Њ: 'Nj', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', Ћ: 'C', У: 'U', Ф: 'F', Х: 'H', Ц: 'C', Ч: 'C',
  Џ: 'Dz', Ш: 'S', Đ: 'Dj', Ž: 'Z', Š: 'S', Č: 'C', Ć: 'C',
};

// Cyrillic -> Latin, no diacritics, upper case.
export function plain(text) {
  return [...text.toUpperCase()].map(c => LATIN[c] ?? c).join('').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const cap = w => w.charAt(0) + w.slice(1).toLowerCase();
const camel = words => words.map(cap).join(''); // shop: AutoKraljevo
const snake = words => words.map(cap).join('_'); // items: Garnitura_Sa_Lenjivcem

const LEGAL_FORMS = new Set(['DOO', 'D.O.O.', 'D.O.O', 'AD', 'A.D.', 'A.D', 'PR', 'SZR', 'STR', 'SZTR', 'TR', 'OD', 'DOOEL', 'KD', 'ORTACKO']);
// Chains whose receipts name the owner company, but the store is what people search for.
const STORE_BRANDS = ['MOMAX', 'LESNINA', 'IDEA', 'MAXI', 'LIDL', 'RODA', 'MERCATOR', 'TEMPO', 'UNIVEREXPORT', 'AMAN',
  'LILLY', 'DM', 'BENU', 'JYSK', 'IKEA', 'EMMEZETA', 'GIGATRON', 'TEHNOMANIJA', 'WINWIN', 'METRO', 'OBI', 'MERKUR'];

// "AUTO KRALJEVO" -> AutoKraljevo, "Telekom Srbija a.d. Beograd," -> TelekomSrbija, MOMAX place -> Momax.
export function shopTag({ company = '', place = '' }) {
  const placeWords = plain(place).split(/[^A-Z0-9]+/);
  const brand = STORE_BRANDS.find(b => placeWords.includes(b));
  if (brand) return camel([brand]);
  const words = [];
  for (const w of plain(company).split(',')[0].split(/\s+/).filter(Boolean)) {
    if (LEGAL_FORMS.has(w)) break; // whatever follows the legal form is usually the city
    words.push(w.replace(/[^A-Z0-9&]/g, ''));
  }
  const kept = words.filter(Boolean);
  while (kept.length > 1 && kept[kept.length - 1].length === 1) kept.pop(); // "LESNINA S"
  return camel(kept.slice(0, 3));
}

const BRANDS = ['BOSCH', 'BEKO', 'SAMSUNG', 'LG', 'GORENJE', 'SONY', 'PHILIPS', 'TESLA', 'VOX', 'WHIRLPOOL', 'ELECTROLUX',
  'CANDY', 'HISENSE', 'XIAOMI', 'APPLE', 'HP', 'LENOVO', 'ASUS', 'ACER', 'DELL', 'MIDEA', 'GREE', 'VIVAX', 'FOX', 'AEG',
  'SIEMENS', 'MIELE', 'HAIER', 'TCL', 'PANASONIC', 'SHARP', 'HUAWEI', 'MOTOROLA', 'NOKIA', 'DYSON', 'ROWENTA', 'TEFAL',
  'BRAUN', 'KRUPS', 'DELONGHI', 'SMEG', 'INDESIT', 'HOTPOINT', 'MITSUBISHI', 'DAIKIN', 'FUJITSU', 'TOSHIBA', 'HITACHI',
  'ARIELLI', 'QUADRO', 'ALPHA', 'HYUNDAI', 'GRUNDIG', 'METABO', 'MAKITA', 'DEWALT', 'EINHELL', 'BLACK&DECKER', 'KARCHER',
  'LOGITECH', 'CANON', 'EPSON', 'BROTHER', 'NIKON', 'GOPRO', 'JBL', 'MSI', 'GIGABYTE', 'REALME', 'OPPO', 'HONOR'];

// Product codes, sizes, units and model numbers are noise in a file name.
function isNoise(word) {
  if (/\d/.test(word)) return true; // 030101225, SS25486-AMC, 500ML, CL3000IU, 4M
  if (/^(KOM|KG|GR|ML|L|M|CM|MM|PAK|KUT|X)$/.test(word)) return true;
  if (word.length <= 2 && !/^(ZA|SA|I|U|NA|OD|DO)$/.test(word)) return true; // "ES", "W", "E", "II"
  return false;
}

// "SS25486-AMC VILJUSKA DESNA_24495 /kom (Ђ)" -> ['VILJUSKA', 'DESNA']
export function itemWords(name) {
  const cleaned = plain(name)
    .replace(/\s*\([^)]{1,3}\)\s*$/, '') // tax label "(Ђ)"
    .replace(/_\d+/g, ' ') // "_24495" internal codes
    .replace(/\/\s*[A-Z]{1,4}\.?/g, ' '); // "/kom"
  return cleaned.split(/\s+/)
    .filter(token => !/\d/.test(token)) // whole codes like SS25486-AMC, CL3000iU, II+DZ stay out
    .flatMap(token => token.split(/[,.;:+*"'()[\]{}/\\-]+/))
    .filter(w => w && !isNoise(w));
}

function itemTag(item, max = 3) {
  const words = itemWords(item.name);
  const brand = words.find(w => BRANDS.includes(w));
  if (brand) return snake([brand, ...words.filter(w => w !== brand).slice(0, 4)]);
  return snake(words.slice(0, max));
}

// First matching stem wins, so more specific stems come first.
const CATEGORIES = [
  ['Rasveta', ['SIJALIC', 'PLAFONJER', 'LUSTER', 'LAMP', 'LED', 'REFLEKTOR', 'ROZETN']],
  ['Uticnice', ['UTICNIC', 'PRIKLJUCNIC', 'PRODUZN', 'RAZDELNIK']],
  ['Prekidaci', ['PREKIDAC', 'MEHANIZ', 'TASTER', 'DIMER']],
  ['Maske', ['MASK', 'OKVIR']],
  ['Elektro', ['KABL', 'PRIRUBNIC', 'KUTIJ', 'DOZN', 'POKLOPAC', 'OSIGURAC', 'GAJTAN', 'BUZIR', 'STEZALJK', 'KANALIC']],
  ['Jastuci', ['JASTU']],
  ['Posteljina', ['POSTELJ', 'CARSAV', 'NAVLAK', 'PREKRIVAC', 'CEBE', 'JORGAN', 'POKRIVAC']],
  ['Tekstil', ['PESKIR', 'ZAVES', 'TEPIH', 'STOLNJAK', 'PODMETAC']],
  ['Namestaj', ['STO', 'STOLIC', 'FOTELJ', 'KREVET', 'ORMAR', 'KOMODA', 'POLICA', 'DUSEK', 'TROSED', 'KAUC']],
  ['Kucna_Hemija', ['CISTAC', 'OSVEZIVAC', 'DETERDZENT', 'OMEKSIVAC', 'SREDSTVO', 'DEZINFEK', 'IZBELJIVAC', 'SPUZV', 'KRPA']],
  ['Kozmetika', ['SAMPON', 'SAPUN', 'KREMA', 'GEL', 'PASTA', 'DEZODORANS', 'PARFEM', 'BRIJAC', 'PELENE', 'MARAMIC']],
  ['Auto_Delovi', ['VILJUSK', 'TERMOSTAT', 'AMORTIZER', 'PAKNE', 'PLOCIC', 'KAIS', 'SVECIC', 'AKUMULATOR', 'METLIC', 'HLADNJAK', 'SPONA', 'LEZAJ', 'KVACIL', 'AUSPUH', 'FILTER']],
  ['Alat', ['BUSILIC', 'SRAFCIGER', 'BURGIJ', 'CEKIC', 'KLESTA', 'KLJUC', 'TESTER', 'BRUSILIC', 'METAR', 'NOZ']],
  ['Gradjevina', ['LEPAK', 'MALTER', 'CEMENT', 'SILIKON', 'BOJA', 'FASAD', 'GIPS', 'GLET', 'PENA', 'TIPL', 'SRAF', 'EKSER', 'CEV']],
  ['Bela_Tehnika', ['FRIZIDER', 'ZAMRZIVAC', 'SPORET', 'RERNA', 'MASIN', 'SUSILIC', 'BOJLER', 'KLIM', 'USISIVAC', 'MIKROTALAS', 'APARAT']],
  ['Elektronika', ['TELEVIZOR', 'LAPTOP', 'RACUNAR', 'MONITOR', 'TELEFON', 'TABLET', 'SLUSALIC', 'PUNJAC', 'MIS', 'TASTATUR', 'ZVUCNIK']],
  ['Mlecni', ['MLEKO', 'JOGURT', 'SIR', 'KAJMAK', 'PAVLAK', 'KEFIR', 'MASLAC', 'MILERAM']],
  ['Meso', ['MESO', 'PILE', 'PILETIN', 'SVINJ', 'JUNET', 'KOBASIC', 'SUNKA', 'SALAM', 'PRSUT', 'SLANIN', 'PECENIC', 'VIRSL', 'MLEVENO']],
  ['Pekara', ['HLEB', 'KIFL', 'PECIV', 'BUREK', 'PEREC', 'LEPINJ', 'TOST']],
  ['Voce_i_Povrce', ['JABUK', 'BANAN', 'KROMPIR', 'LUK', 'PARADAJZ', 'KRASTAVAC', 'PAPRIK', 'LIMUN', 'POMORANDZ', 'KUPUS', 'SARGAREP', 'GROZD']],
  ['Pice', ['VODA', 'SOK', 'PIVO', 'VINO', 'RAKIJ', 'KAFA', 'CAJ', 'COCA', 'PEPSI', 'NEKTAR']],
  ['Namirnice', ['BRASNO', 'SECER', 'SO', 'ULJE', 'PIRINAC', 'TESTENIN', 'JAJA', 'JAJE', 'COKOLAD', 'KEKS', 'GRICKALIC', 'CIPS', 'SMOKI', 'KONZERV']],
  ['Odeca', ['MAJIC', 'PANTALON', 'JAKN', 'CARAP', 'DUKSERIC', 'KOSULJ', 'HALJIN', 'SUKNJ', 'DONJI', 'GACE']],
  ['Obuca', ['PATIK', 'CIZM', 'CIPEL', 'SANDAL', 'PAPUC']],
];

function category(item) {
  const words = itemWords(item.name);
  for (const [label, stems] of CATEGORIES) {
    if (words.some(w => stems.some(s => (s.length <= 3 ? w === s : w.startsWith(s))))) return label;
  }
  return null;
}

const joinTags = tags => (tags.length <= 1 ? tags.join('') : `${tags.slice(0, -1).join('_')}_i_${tags[tags.length - 1]}`);

export function itemsTag(items) {
  const real = (items || []).filter(i => i.total > 0 && itemWords(i.name).length);
  if (!real.length) return '';
  const sum = real.reduce((s, i) => s + i.total, 0);

  // The same article on several lines counts once.
  const byTag = new Map();
  for (const i of real) {
    const tag = itemTag(i);
    byTag.set(tag, { tag, item: i, total: (byTag.get(tag)?.total ?? 0) + i.total });
  }
  const distinct = [...byTag.values()].sort((a, b) => b.total - a.total);
  if (distinct.length <= 2) return joinTags(distinct.map(d => d.tag));

  // One branded device that is most of the bill names the receipt (warranty lookups).
  const top = distinct[0];
  if (top.total >= sum / 2 && itemWords(top.item.name).some(w => BRANDS.includes(w))) return `${top.tag}_i_Ostalo`;

  const groups = new Map();
  for (const d of distinct) {
    const label = category(d.item) ?? snake(itemWords(d.item.name).slice(0, 1));
    groups.set(label, (groups.get(label) ?? 0) + d.total);
  }
  const ranked = [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  return ranked.length <= 3 ? joinTags(ranked) : `${ranked.slice(0, 2).join('_')}_i_Ostalo`;
}
