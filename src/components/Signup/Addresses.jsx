import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MapPin, Navigation, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import {
  apiLocationBarangays,
  apiLocationCities,
  apiLocationPostalCode,
  apiLocationProvinces,
  clearCustomerToken,
} from '../../api/client';
import AddressPinMap from '../AddressPinMap';
import AccountSidebar from './AccountSidebar';

const STORAGE_KEY = 'customerAddresses';
const COUNTRY_CODE = 'PH';
const blankAddress = {
  name: '',
  phone: '',
  addressLine: '',
  province: '',
  city: '',
  barangay: '',
  postalCode: '',
  landmark: '',
  latitude: null,
  longitude: null,
  isDefault: false,
};

function normalizeStoredAddress(address = {}) {
  return {
    ...address,
    name: String(address.name || ''),
    phone: String(address.phone || ''),
    addressLine: String(address.addressLine || ''),
    province: String(address.province || ''),
    city: String(address.city || ''),
    barangay: String(address.barangay || ''),
    postalCode: String(address.postalCode || ''),
    landmark: String(address.landmark || address.deliveryInstructions || address.instructions || ''),
    latitude: address.latitude ?? address.customerLatitude ?? null,
    longitude: address.longitude ?? address.customerLongitude ?? null,
    isDefault: Boolean(address.isDefault),
  };
}

function loadAddresses() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.map(normalizeStoredAddress) : [];
  } catch {
    return [];
  }
}

function FieldError({ message }) {
  return message ? <p className="mt-2 text-xs text-[#a04444]">{message}</p> : null;
}

function hasValidMapPin(address) {
  if (address.latitude === null || address.latitude === '' || address.longitude === null || address.longitude === '') return false;
  const latitude = Number(address.latitude);
  const longitude = Number(address.longitude);
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function AddressForm({ address, change, save, cancel }) {
  const [provinceOptions, setProvinceOptions] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [barangayOptions, setBarangayOptions] = useState([]);
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [loadingCities, setLoadingCities] = useState(Boolean(address.province));
  const [loadingBarangays, setLoadingBarangays] = useState(Boolean(address.city));
  const [locationOptionsError, setLocationOptionsError] = useState('');
  const [errors, setErrors] = useState({});
  const [gpsStatus, setGpsStatus] = useState({ type: '', message: '' });
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const postalRequestId = useRef(0);
  const inputClass = 'mt-2 w-full rounded-xl border border-[#dce5d8] bg-white px-4 py-3 text-sm text-[#173d2b] outline-none transition focus:border-[#0f6b45] focus:ring-4 focus:ring-[#d9ebdc] disabled:cursor-not-allowed disabled:bg-[#f2f5f0] disabled:text-[#89958d]';

  const provinceCode = useMemo(
    () => provinceOptions.find((option) => option.name.toLowerCase() === address.province.toLowerCase())?.isoCode || '',
    [address.province, provinceOptions]
  );

  useEffect(() => {
    let active = true;
    apiLocationProvinces(COUNTRY_CODE)
      .then((options) => {
        if (!active) return;
        setProvinceOptions(Array.isArray(options) ? options : []);
        setLocationOptionsError('');
      })
      .catch(() => {
        if (!active) return;
        setProvinceOptions([]);
        setLocationOptionsError('Unable to load Philippine provinces right now. Please try again.');
      })
      .finally(() => active && setLoadingProvinces(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!provinceCode) return undefined;
    let active = true;
    apiLocationCities(COUNTRY_CODE, provinceCode)
      .then((options) => {
        if (!active) return;
        setCityOptions(Array.isArray(options) ? options : []);
        setLocationOptionsError('');
      })
      .catch(() => {
        if (!active) return;
        setCityOptions([]);
        setLocationOptionsError('Unable to load cities and municipalities right now. Please try again.');
      })
      .finally(() => active && setLoadingCities(false));
    return () => { active = false; };
  }, [provinceCode]);

  useEffect(() => {
    if (!address.province || !address.city) return undefined;
    let active = true;
    apiLocationBarangays(COUNTRY_CODE, address.province, address.city)
      .then((options) => {
        if (!active) return;
        setBarangayOptions(Array.isArray(options) ? options : []);
        setLocationOptionsError('');
      })
      .catch(() => {
        if (!active) return;
        setBarangayOptions([]);
        setLocationOptionsError('Unable to load barangays right now. Please try again.');
      })
      .finally(() => active && setLoadingBarangays(false));
    return () => { active = false; };
  }, [address.province, address.city]);

  function updateField(key, value) {
    change(key, value);
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function handleProvinceChange(event) {
    postalRequestId.current += 1;
    setCityOptions([]);
    setBarangayOptions([]);
    setLoadingCities(Boolean(event.target.value));
    setLoadingBarangays(false);
    setLocationOptionsError('');
    updateField('province', event.target.value);
    updateField('city', '');
    updateField('barangay', '');
    updateField('postalCode', '');
  }

  function handleCityChange(event) {
    const city = event.target.value;
    const requestId = postalRequestId.current + 1;
    postalRequestId.current = requestId;
    setBarangayOptions([]);
    setLoadingBarangays(Boolean(city));
    setLocationOptionsError('');
    updateField('city', city);
    updateField('barangay', '');
    updateField('postalCode', '');

    if (!city) return;
    apiLocationPostalCode(COUNTRY_CODE, address.province, city)
      .then((result) => {
        if (postalRequestId.current === requestId && result?.postalCode) {
          updateField('postalCode', result.postalCode);
        }
      })
      .catch(() => {});
  }

  function handleCaptureLocation() {
    if (!navigator.geolocation) {
      setGpsStatus({ type: 'error', message: 'Location is unavailable on this device. You can still save the written address.' });
      return;
    }

    setIsCapturingLocation(true);
    setGpsStatus({ type: '', message: '' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        change('latitude', position.coords.latitude);
        change('longitude', position.coords.longitude);
        setGpsStatus({ type: 'success', message: 'Exact delivery location saved successfully. You can adjust the pin on the map.' });
        setIsCapturingLocation(false);
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        setGpsStatus({
          type: 'error',
          message: denied
            ? 'Location permission was denied. Please allow location access and try again, or save without a GPS pin.'
            : 'We could not get your current location. Please check your device location settings and try again.',
        });
        setIsCapturingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  const handlePinChange = useCallback((latitude, longitude) => {
    change('latitude', latitude);
    change('longitude', longitude);
    setGpsStatus({ type: 'success', message: 'Exact delivery location updated.' });
  }, [change]);

  function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!address.name.trim()) nextErrors.name = 'Recipient name is required.';
    if (!address.phone.trim()) nextErrors.phone = 'Mobile number is required.';
    else if (!/^[0-9+\-\s()]{7,15}$/.test(address.phone.trim())) nextErrors.phone = 'Enter a valid mobile number.';
    if (!address.addressLine.trim()) nextErrors.addressLine = 'House number, street, or subdivision is required.';
    if (!address.province.trim()) nextErrors.province = 'Province is required.';
    if (!address.city.trim()) nextErrors.city = 'City or municipality is required.';
    if (!address.barangay.trim()) nextErrors.barangay = 'Barangay is required.';
    if (!address.postalCode.trim()) nextErrors.postalCode = 'Postal code is required.';
    else if (!/^\d{4}$/.test(address.postalCode.trim())) nextErrors.postalCode = 'Enter a valid 4-digit Philippine postal code.';

    const hasLatitude = address.latitude !== null && address.latitude !== '';
    const hasLongitude = address.longitude !== null && address.longitude !== '';
    if (hasLatitude !== hasLongitude) nextErrors.location = 'Both latitude and longitude are required for a GPS pin.';
    else if (hasLatitude && !hasValidMapPin(address)) nextErrors.location = 'The saved GPS coordinates are invalid. Please capture the location again.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    save();
  }

  const hasMapPin = hasValidMapPin(address);

  return (
    <form onSubmit={handleSubmit} className="mb-6 rounded-2xl border border-[#dce5d8] bg-[#fbfcf8] p-5 md:p-6" noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#6c786f]">Recipient Name <span className="text-red-600">*</span></span>
          <input value={address.name} onChange={(event) => updateField('name', event.target.value)} className={inputClass} />
          <FieldError message={errors.name} />
        </label>
        <label className="block">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#6c786f]">Mobile Number <span className="text-red-600">*</span></span>
          <input type="tel" value={address.phone} onChange={(event) => updateField('phone', event.target.value)} className={inputClass} />
          <FieldError message={errors.phone} />
        </label>

        <label className="block md:col-span-2">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#6c786f]">House No. / Street / Subdivision <span className="text-red-600">*</span></span>
          <input value={address.addressLine} onChange={(event) => updateField('addressLine', event.target.value)} className={inputClass} />
          <FieldError message={errors.addressLine} />
        </label>

        <label className="block">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#6c786f]">Province <span className="text-red-600">*</span></span>
          <select value={address.province} onChange={handleProvinceChange} disabled={loadingProvinces} className={inputClass}>
            <option value="">{loadingProvinces ? 'Loading provinces...' : 'Select province'}</option>
            {address.province && !provinceOptions.some((option) => option.name === address.province) ? <option value={address.province}>{address.province}</option> : null}
            {provinceOptions.map((option) => <option key={option.isoCode} value={option.name}>{option.name}</option>)}
          </select>
          <FieldError message={errors.province} />
        </label>
        <label className="block">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#6c786f]">City / Municipality <span className="text-red-600">*</span></span>
          <select value={address.city} onChange={handleCityChange} disabled={!provinceCode || loadingCities} className={inputClass}>
            <option value="">{loadingCities ? 'Loading cities...' : !provinceCode ? 'Select province first' : 'Select city / municipality'}</option>
            {address.city && !cityOptions.some((option) => option.name === address.city) ? <option value={address.city}>{address.city}</option> : null}
            {cityOptions.map((option) => <option key={`${option.stateCode}-${option.name}`} value={option.name}>{option.name}</option>)}
          </select>
          <FieldError message={errors.city} />
        </label>

        <label className="block">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#6c786f]">Barangay <span className="text-red-600">*</span></span>
          <select value={address.barangay} onChange={(event) => updateField('barangay', event.target.value)} disabled={!address.city || loadingBarangays} className={inputClass}>
            <option value="">{loadingBarangays ? 'Loading barangays...' : !address.city ? 'Select city first' : barangayOptions.length ? 'Select barangay' : 'No barangays available'}</option>
            {address.barangay && !barangayOptions.some((option) => option.name === address.barangay) ? <option value={address.barangay}>{address.barangay}</option> : null}
            {barangayOptions.map((option) => <option key={option.code || option.name} value={option.name}>{option.name}</option>)}
          </select>
          <FieldError message={errors.barangay} />
        </label>
        <label className="block">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#6c786f]">Postal Code <span className="text-red-600">*</span></span>
          <input inputMode="numeric" maxLength={4} value={address.postalCode} onChange={(event) => updateField('postalCode', event.target.value.replace(/\D/g, '').slice(0, 4))} className={inputClass} />
          <FieldError message={errors.postalCode} />
        </label>

        <label className="block md:col-span-2">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#6c786f]">Landmark / Delivery Instructions <span className="font-normal normal-case tracking-normal text-[#89958d]">(Optional)</span></span>
          <textarea value={address.landmark} onChange={(event) => updateField('landmark', event.target.value)} className={`${inputClass} min-h-24 resize-y`} placeholder="Green gate, beside Alfamart" />
        </label>
      </div>

      {locationOptionsError ? <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-[#a04444]">{locationOptionsError}</p> : null}

      <section className="mt-5 rounded-2xl border border-[#dce5d8] bg-white p-4 md:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#173d2b]">Exact Delivery Location <span className="font-normal text-[#89958d]">(Optional)</span></h3>
            <p className="mt-1 text-xs leading-5 text-[#5e6f65]">Pin your exact delivery location to help our Belfiore Rider find your address.</p>
            <p className="mt-1 text-xs text-[#7b867d]">Your written delivery address is still required.</p>
          </div>
          <button type="button" onClick={handleCaptureLocation} disabled={isCapturingLocation} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#0f6b45] bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#0f6b45] transition hover:bg-[#e8f3ea] disabled:cursor-not-allowed disabled:opacity-60">
            <Navigation size={15} />{isCapturingLocation ? 'Getting Location...' : 'Use Current Location'}
          </button>
        </div>

        {gpsStatus.message ? <p className={`mt-3 text-xs ${gpsStatus.type === 'success' ? 'text-[#0f6b45]' : 'text-[#a04444]'}`}>{gpsStatus.message}</p> : null}
        <FieldError message={errors.location} />

        {hasMapPin ? (
          <>
            <AddressPinMap latitude={address.latitude} longitude={address.longitude} onPositionChange={handlePinChange} />
            <p className="mt-3 text-xs text-[#5e6f65]">Saved coordinates: {Number(address.latitude).toFixed(6)}, {Number(address.longitude).toFixed(6)}</p>
          </>
        ) : null}
      </section>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-[#0f4d2e] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white"><Plus size={15} />Save Address</button>
        <button type="button" onClick={cancel} className="inline-flex items-center gap-2 rounded-xl border border-[#dce5d8] bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#405145]"><X size={15} />Cancel</button>
      </div>
    </form>
  );
}

export default function Addresses() {
  const location = useLocation();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState(loadAddresses);
  const [draft, setDraft] = useState(blankAddress);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  const persist = (next) => {
    setAddresses(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };
  const changeDraft = useCallback((key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);
  const openNew = () => {
    setDraft({ ...blankAddress, isDefault: addresses.length === 0 });
    setEditingId(null);
    setFormOpen(true);
  };
  const openEdit = (address) => {
    setDraft(normalizeStoredAddress(address));
    setEditingId(address.id);
    setFormOpen(true);
  };
  const save = () => {
    const { label: _legacyLabel, ...addressWithoutLabel } = draft;
    const nextAddress = {
      ...addressWithoutLabel,
      id: editingId || crypto.randomUUID(),
      name: addressWithoutLabel.name.trim(),
      phone: addressWithoutLabel.phone.trim(),
      addressLine: addressWithoutLabel.addressLine.trim(),
      province: addressWithoutLabel.province.trim(),
      city: addressWithoutLabel.city.trim(),
      barangay: addressWithoutLabel.barangay.trim(),
      postalCode: addressWithoutLabel.postalCode.trim(),
      landmark: addressWithoutLabel.landmark.trim(),
      latitude: addressWithoutLabel.latitude === '' ? null : addressWithoutLabel.latitude,
      longitude: addressWithoutLabel.longitude === '' ? null : addressWithoutLabel.longitude,
    };
    const next = editingId
      ? addresses.map((item) => item.id === editingId ? nextAddress : item)
      : [...addresses, nextAddress];
    persist(next.map((item) => ({
      ...item,
      isDefault: nextAddress.isDefault ? item.id === nextAddress.id : item.isDefault,
    })));
    setFormOpen(false);
    if (location.state?.fromCheckout) navigate('/checkout', { replace: true });
  };
  const remove = (id) => {
    const next = addresses.filter((item) => item.id !== id);
    persist(next.map((item, index) => ({
      ...item,
      isDefault: item.isDefault || (index === 0 && !next.some((current) => current.isDefault)),
    })));
  };
  const logout = () => {
    localStorage.removeItem('isLoggedIn');
    clearCustomerToken();
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8faf6] font-['Montserrat'] text-[#24372d]">
      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-0 px-4 md:px-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <AccountSidebar onLogout={logout} />
        <main className="min-w-0 py-6 lg:px-6">
          <section className="rounded-[1.35rem] border border-[#e1e7dc] bg-white shadow-[0_18px_45px_rgba(15,77,46,0.06)]">
            <div className="flex flex-col gap-4 border-b border-[#eef2ea] p-5 md:flex-row md:items-center md:justify-between md:p-6">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[#6c786f]">Delivery details</p>
                <h1 className="mt-1 font-['Playfair_Display'] text-3xl leading-tight text-[#0f4d2e] md:text-4xl">My Addresses</h1>
              </div>
              <button onClick={openNew} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0f6b45] px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#0f4d2e]"><Plus size={18} />Add Address</button>
            </div>

            <div className="p-5 md:p-6">
              {formOpen ? <AddressForm address={draft} change={changeDraft} save={save} cancel={() => setFormOpen(false)} /> : null}
              {addresses.length === 0 ? (
                <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-[#cbd9c9] bg-[#fbfcf8] px-6 text-center">
                  <div>
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e8f3ea] text-[#0f6b45]"><MapPin size={21} /></span>
                    <h2 className="mt-4 text-lg font-semibold text-[#173d2b]">No saved addresses yet</h2>
                    <p className="mt-2 text-sm leading-6 text-[#5e6f65]">Add a delivery address so checkout is quicker next time.</p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-[#e5ebe2]">
                  {addresses.map((address) => (
                    <article key={address.id} className="py-6 first:pt-0 last:pb-0">
                      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <h2 className="text-lg font-semibold text-[#173d2b]">{address.name}</h2>
                            <span className="h-5 border-l border-[#cbd5cb]" />
                            <span className="text-sm text-[#405145]">{address.phone}</span>
                            {address.isDefault ? <span className="inline-flex items-center gap-1 rounded-md border border-[#f04b2f] px-2 py-0.5 text-xs font-medium text-[#e44227]"><Star size={12} />Default</span> : null}
                          </div>
                          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#405145]">{address.addressLine}, {address.barangay ? `${address.barangay}, ` : ''}{address.city}, {address.province}, {address.postalCode}</p>
                          {address.landmark ? <p className="mt-2 text-sm leading-6 text-[#5e6f65]"><span className="font-medium text-[#405145]">Landmark:</span> {address.landmark}</p> : null}
                          {hasValidMapPin(address) ? <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#e8f3ea] px-3 py-1 text-xs font-medium text-[#0f6b45]"><MapPin size={12} />Exact location saved</p> : null}
                        </div>
                        <div className="flex shrink-0 items-start gap-3 text-sm">
                          <button onClick={() => openEdit(address)} className="inline-flex items-center gap-1 text-[#0f6b45]"><Pencil size={15} />Edit</button>
                          <button onClick={() => remove(address.id)} className="inline-flex items-center gap-1 text-red-600"><Trash2 size={15} />Remove Address</button>
                        </div>
                      </div>
                      {!address.isDefault ? <button onClick={() => persist(addresses.map((item) => ({ ...item, isDefault: item.id === address.id })))} className="mt-4 rounded-lg border border-[#cbd5cb] bg-white px-3 py-2 text-sm font-medium text-[#173d2b] transition hover:border-[#0f6b45] hover:text-[#0f6b45]">Set as default</button> : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
