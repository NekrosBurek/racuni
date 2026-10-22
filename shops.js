// Which store icon a receipt gets: a known chain's website, or the shop's initials.
import { shopTag } from './naming.js';

// shopTag (lower case) -> the chain's website. Only exact tags, so "Niš" in an address can't turn into NIS.
const DOMAINS = {
  maxi: 'maxi.rs', delhaizeserbia: 'maxi.rs', idea: 'idea.rs', mercator: 'mercator.rs', mercators: 'mercator.rs',
  roda: 'roda.rs', lidl: 'lidl.rs', univerexport: 'univerexport.rs', aman: 'aman.co.rs', lilly: 'lilly.rs',
  dm: 'dm.rs', benu: 'benu.rs', jysk: 'jysk.rs', ikea: 'ikea.com', emmezeta: 'emmezeta.rs', gigatron: 'gigatron.rs',
  tehnomanija: 'tehnomanija.rs', winwin: 'winwin.rs', metro: 'metro.rs', momax: 'momax.rs', lesnina: 'lesnina.rs',
  telekomsrbija: 'mts.rs', yettel: 'yettel.rs', a1srbija: 'a1.rs', sbb: 'sbb.rs', nis: 'nis.rs', omv: 'omv.co.rs',
  mol: 'mol.rs', lukoil: 'lukoil.rs', decathlon: 'decathlon.rs', sportvision: 'sportvision.rs', zara: 'zara.com',
  hm: 'hm.com', mcdonalds: 'mcdonalds.rs',
};

export function shopDomain(r) {
  const tag = shopTag({ company: r.shop || '', place: r.place || '' }).toLowerCase();
  return DOMAINS[tag] ?? null;
}

export function initials(shop) {
  const words = (shop || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
}

const HUES = [210, 160, 25, 280, 340, 45, 190, 120];
export const shopHue = text => HUES[[...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % HUES.length];
