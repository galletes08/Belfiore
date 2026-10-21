import { createRequire } from 'node:module';
import { Router } from 'express';
import {
  getAllCitiesOfCountry,
  getCitiesOfState,
  getCountries,
  getStatesOfCountry,
} from '@countrystatecity/countries';

const router = Router();
const loadPsgcJson = createRequire(import.meta.url);
const psgcProvinces = loadPsgcJson('@jobuntux/psgc/data/2025-2Q/provinces.json');
const psgcCities = loadPsgcJson('@jobuntux/psgc/data/2025-2Q/muncities.json');
const psgcBarangays = loadPsgcJson('@jobuntux/psgc/data/2025-2Q/barangays.json');
const cachedCountries = { value: null };
const cachedProvinces = new Map();
const cachedCities = new Map();
const cachedBarangays = new Map();

const POSTAL_CODES = new Map([
  ['laguna:calamba', '4027'],
  ['laguna:cabuyao', '4025'],
  ['laguna:los banos', '4030'],
  ['laguna:santa rosa', '4026'],
]);

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeLocationName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(city|municipality) of\s+/i, '')
    .replace(/\s+city$/i, '')
    .trim()
    .toLowerCase();
}

function sortByName(items) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

export async function validateDeliveryAddress(value) {
  const invalid=message=>Object.assign(new Error(message),{status:400});
  if(!value||typeof value!=='object'||Array.isArray(value))throw invalid('Delivery address is required');
  const a={};for(const key of ['addressLine','barangay','country','countryCode','province','provinceCode','city','postalCode','landmark']){
    if(value[key]!=null&&(typeof value[key]!=='string'||value[key].length>1000))throw invalid('Invalid delivery address field');a[key]=String(value[key]||'').trim();
  }
  if(!a.countryCode&&!a.country)a.countryCode='PH';
  const countries=await getCountries();const country=countries.find(c=>normalizeCode(c.iso2)===normalizeCode(a.countryCode)||normalizeLocationName(c.name)===normalizeLocationName(a.country));
  if(!country)throw invalid('Select a valid country');a.countryCode=country.iso2;a.country=country.name;
  if(!a.addressLine||!a.barangay||!a.city||!a.postalCode)throw invalid('House/street, barangay, city and postal code are required');
  const provinces=await getStatesOfCountry(a.countryCode);const province=provinces.find(p=>normalizeLocationName(p.name)===normalizeLocationName(a.province));
  if(provinces.length&&!province)throw invalid('Select a province belonging to this country');
  if(province){a.province=province.name;a.provinceCode=province.iso2;}
  const cities=province?await getCitiesOfState(a.countryCode,province.iso2):await getAllCitiesOfCountry(a.countryCode);
  const city=cities.find(c=>normalizeLocationName(c.name)===normalizeLocationName(a.city));if(!city)throw invalid('Select a city belonging to this province');a.city=city.name;
  if(a.countryCode==='PH') {
    if(!/^\d{4}$/.test(a.postalCode))throw invalid('Enter a valid four-digit Philippine ZIP code');
    const p=psgcProvinces.find(p=>[p.provName,p.provOldName].some(n=>n&&normalizeLocationName(n)===normalizeLocationName(a.province)));
    const c=psgcCities.find(c=>(p?c.provCode===p.provCode:['metro manila','ncr','national capital region'].includes(normalizeLocationName(a.province))&&c.regCode==='13')&&[c.munCityName,c.munCityOldName].some(n=>n&&normalizeLocationName(n)===normalizeLocationName(a.city)));
    const barangays=c?psgcBarangays.filter(b=>b.munCityCode===c.munCityCode):[];
    if(barangays.length&&!barangays.some(b=>normalizeLocationName(b.brgyName)===normalizeLocationName(a.barangay)))throw invalid('Select a barangay belonging to this city');
    const known=POSTAL_CODES.get(`${normalizeLocationName(a.province)}:${normalizeLocationName(a.city)}`);if(known&&known!==a.postalCode)throw invalid('ZIP code does not match the selected city');
  } else if(!/^[A-Za-z0-9 -]{2,12}$/.test(a.postalCode))throw invalid('Enter a valid postal code');
  for(const [key,min,max] of [['latitude',-90,90],['longitude',-180,180]]){a[key]=value[key]==null||value[key]===''?null:Number(value[key]);if(a[key]!==null&&(!Number.isFinite(a[key])||a[key]<min||a[key]>max))throw invalid('Invalid delivery coordinates');}
  if((a.latitude===null)!==(a.longitude===null))throw invalid('Provide both delivery coordinates');
  return a;
}

router.get('/api/location/countries', async (_req, res) => {
  try {
    if (!cachedCountries.value) {
      const countries = await getCountries();
      cachedCountries.value = sortByName(countries).map((country) => ({
        name: country.name,
        isoCode: country.iso2,
      }));
    }

    res.json(cachedCountries.value);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load countries' });
  }
});

router.get('/api/location/:countryCode/provinces', async (req, res) => {
  const countryCode = normalizeCode(req.params.countryCode);

  if (!countryCode) {
    return res.status(400).json({ error: 'Country code is required' });
  }

  try {
    if (!cachedProvinces.has(countryCode)) {
      const provinces = await getStatesOfCountry(countryCode);
      cachedProvinces.set(
        countryCode,
        sortByName(provinces).map((province) => ({
          name: province.name,
          isoCode: province.iso2,
          countryCode: province.country_code,
        }))
      );
    }

    res.json(cachedProvinces.get(countryCode));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load provinces' });
  }
});

router.get('/api/location/:countryCode/cities', async (req, res) => {
  const countryCode = normalizeCode(req.params.countryCode);
  const provinceCode = normalizeCode(req.query.provinceCode);

  if (!countryCode) {
    return res.status(400).json({ error: 'Country code is required' });
  }

  const cacheKey = `${countryCode}:${provinceCode}`;

  try {
    if (!cachedCities.has(cacheKey)) {
      const cities = provinceCode
        ? await getCitiesOfState(countryCode, provinceCode)
        : await getAllCitiesOfCountry(countryCode);

      cachedCities.set(
        cacheKey,
        sortByName(cities).map((city) => ({
          name: city.name,
          stateCode: city.state_code,
          countryCode: city.country_code,
        }))
      );
    }

    res.json(cachedCities.get(cacheKey));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load cities' });
  }
});

router.get('/api/location/:countryCode/barangays', (req, res) => {
  const countryCode = normalizeCode(req.params.countryCode);
  const province = String(req.query.province || '').trim();
  const city = String(req.query.city || '').trim();

  if (countryCode !== 'PH') return res.json([]);
  if (!province || !city) return res.status(400).json({ error: 'Province and city are required' });

  const cacheKey = `${normalizeLocationName(province)}:${normalizeLocationName(city)}`;
  if (!cachedBarangays.has(cacheKey)) {
    const normalizedProvince = normalizeLocationName(province);
    const provinceRecord = psgcProvinces.find(
      (item) => [item.provName, item.provOldName].some(
        (name) => name && normalizeLocationName(name) === normalizedProvince
      )
    );
    let cityRecord = provinceRecord
      ? psgcCities.find(
        (item) => item.provCode === provinceRecord.provCode
          && [item.munCityName, item.munCityOldName].some(
            (name) => name && normalizeLocationName(name) === normalizeLocationName(city)
          )
      )
      : null;
    if (!cityRecord && ['metro manila', 'ncr', 'national capital region'].includes(normalizeLocationName(province))) {
      cityRecord = psgcCities.find(
        (item) => item.regCode === '13'
          && [item.munCityName, item.munCityOldName].some(
            (name) => name && normalizeLocationName(name) === normalizeLocationName(city)
          )
      );
    }
    const barangays = cityRecord
      ? psgcBarangays
        .filter((item) => item.munCityCode === cityRecord.munCityCode)
        .map((item) => ({ name: item.brgyName, code: item.psgcCode }))
      : [];
    cachedBarangays.set(cacheKey, sortByName(barangays));
  }

  res.json(cachedBarangays.get(cacheKey));
});

router.get('/api/location/:countryCode/postal-code', (req, res) => {
  const countryCode = normalizeCode(req.params.countryCode);
  const province = normalizeLocationName(req.query.province);
  const city = normalizeLocationName(req.query.city);
  const postalCode = countryCode === 'PH' ? POSTAL_CODES.get(`${province}:${city}`) || '' : '';
  res.json({ postalCode });
});

export default router;
