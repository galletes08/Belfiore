import { Router } from 'express';
import {
  getAllCitiesOfCountry,
  getCitiesOfState,
  getCountries,
  getStatesOfCountry,
} from '@countrystatecity/countries';

const router = Router();
const cachedCountries = { value: null };
const cachedProvinces = new Map();
const cachedCities = new Map();

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
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

export default router;
