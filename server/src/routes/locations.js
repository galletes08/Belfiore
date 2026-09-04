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
