import { Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiLocationCities, apiLocationCountries, apiLocationProvinces, apiLocationBarangays, getImageUrl, apiCustomerAccount, cacheCustomerAccount, customerAccountStorageKey, getCustomerUser } from '../../api/client';
import {
  DEFAULT_DELIVERY_COUNTRY,
  DEFAULT_DELIVERY_COUNTRY_CODE,
  buildDeliveryLocation,
} from '../../utils/deliveryLocations';
import { getShippingQuote } from '../../utils/shipping';

import {preferredAddress,addressToCheckout,checkoutToAddress,missingAddressFields} from '../../../shared/checkoutAddress';

const PROFILE_STORAGE_KEY = 'customerProfile';

function getStoredCustomerDetails() {
  const user=getCustomerUser()||{};let profile={};try{profile=JSON.parse(localStorage.getItem(customerAccountStorageKey(PROFILE_STORAGE_KEY))||'{}');}catch{/* Load authoritative data below. */}
  return {fullName:profile.name||user.name||'',gmail:user.email||'',mobileNumber:profile.phone||'',...addressToCheckout(),paymentMethod:'COD'};
}
export default function CheckoutSection({ items, total, formatPrice, onOrderPlaced, onPlaceOrder }) {
  const [form, setForm] = useState(getStoredCustomerDetails);
  const [addresses,setAddresses]=useState([]),[selectedAddress,setSelectedAddress]=useState(''),[accountLoading,setAccountLoading]=useState(true),[accountError,setAccountError]=useState('');
  const [editingAddress,setEditingAddress]=useState(false),[repairFields,setRepairFields]=useState([]),[saveAddress,setSaveAddress]=useState(false),[addressLabel,setAddressLabel]=useState('Other'),[makeDefault,setMakeDefault]=useState(false),[addressNotice,setAddressNotice]=useState('');
  const submission=useRef(null),submitting=useRef(false),initialContacts=useRef(form);
  useEffect(()=>{
    let active=true;apiCustomerAccount().then(data=>{if(!active)return;cacheCustomerAccount(data);setAddresses(data.addresses||[]);
      const address=preferredAddress(data.addresses||[]);if(address){setSelectedAddress(String(address.id));setRepairFields(missingAddressFields(addressToCheckout(address)));setAddressLabel(['Home','Work','Other'].includes(address.label)?address.label:'Other');setMakeDefault(Boolean(address.isDefault));}
      setForm(current=>({...current,fullName:current.fullName===initialContacts.current.fullName?(data.profile.name||current.fullName):current.fullName,gmail:current.gmail===initialContacts.current.gmail?(data.profile.email||current.gmail):current.gmail,mobileNumber:current.mobileNumber===initialContacts.current.mobileNumber?(data.profile.phone||address?.phone||current.mobileNumber):current.mobileNumber,...(address?addressToCheckout(address):{})}));
    }).catch(err=>{if(active)setAccountError(err.message);}).finally(()=>{if(active)setAccountLoading(false);});return()=>{active=false;};
  },[]);
  const [errors, setErrors] = useState({});
  const [confirmation, setConfirmation] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [locationCaptureMessage, setLocationCaptureMessage] = useState('');
  const [countryOptions, setCountryOptions] = useState([]);
  const [provinceOptions, setProvinceOptions] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [isCountriesLoading, setIsCountriesLoading] = useState(true);
  const [isProvinceLoading, setIsProvinceLoading] = useState(false);
  const [isCityLoading, setIsCityLoading] = useState(false);
  const [locationOptionsError, setLocationOptionsError] = useState('');

  const totalItems = useMemo(
    () => items.reduce((count, item) => count + Number(item.qty || 0), 0),
    [items]
  );
  const deliveryLocation = useMemo(
    () =>
      buildDeliveryLocation({
        streetAddress: form.streetAddress,
        landmark: form.landmark,
        barangay: form.barangay,
        city: form.city,
        province: form.province,
        zipCode: form.zipCode,
        country: form.country,
      }),
    [form.streetAddress, form.landmark, form.barangay, form.city, form.province, form.zipCode, form.country]
  );
  const countryHasProvinces = provinceOptions.length > 0;
  const estimatedQuote = useMemo(
    () => getShippingQuote({
      country: form.country,
      province: form.province,
      city: form.city,
      barangay: form.barangay,
      postalCode: form.zipCode,
      subtotal: total,
      items,
    }),
    [form.country, form.province, form.city, form.barangay, form.zipCode, total, items]
  );
  const [serverQuote,setServerQuote]=useState(null),[quoteError,setQuoteError]=useState(''),[quoting,setQuoting]=useState(false);
  const addressPayload=checkoutToAddress(form);
  const quoteInput=JSON.stringify({savedAddressId:selectedAddress||undefined,deliveryAddress:addressPayload,items:items.map(i=>({id:i.productId||i.id,qty:i.qty,batchId:i.batchId||null,variantId:i.variantId||null,expectedUnitPrice:i.price}))});
  useEffect(()=>{let active=true;setServerQuote(null);setQuoteError('');setQuoting(true);const timer=setTimeout(()=>{
    if(accountLoading||accountError||missingAddressFields(addressToCheckout(JSON.parse(quoteInput).deliveryAddress)).length||!JSON.parse(quoteInput).items.length){if(active)setQuoting(false);return;}
    apiCustomerAccount('checkout-quote','POST',JSON.parse(quoteInput)).then(result=>{if(active)setServerQuote({key:quoteInput,...result.quote});}).catch(err=>{if(active)setQuoteError(err.message);}).finally(()=>{if(active)setQuoting(false);});
    },300);
    return()=>{active=false;clearTimeout(timer);};
  },[quoteInput,accountLoading,accountError,items.length]);
  const confirmedQuote=serverQuote?.key===quoteInput?serverQuote:null;
  const shippingQuote=confirmedQuote||{...estimatedQuote,isConfirmed:false,status:'Estimate',message:estimatedQuote.fee!=null?'Estimated fee: '+formatPrice(estimatedQuote.fee)+'. Validate your destination to confirm.':estimatedQuote.message};
  const orderTotal=confirmedQuote?.totalAmount??null;
  const showAddressForm=!selectedAddress||editingAddress||repairFields.length>0||Boolean(quoteError);
  const repairOnly=Boolean(selectedAddress)&&!editingAddress&&repairFields.length>0&&!quoteError;
  function chooseAddress(id){
    const address=addresses.find(a=>String(a.id)===id);setSelectedAddress(id);setEditingAddress(false);setSaveAddress(false);setAddressNotice('');setMakeDefault(Boolean(address?.isDefault));setAddressLabel(['Home','Work','Other'].includes(address?.label)?address.label:'Other');
    setRepairFields(address?missingAddressFields(addressToCheckout(address)):[]);
    setForm(current=>({...current,...addressToCheckout(address),provinceCode:address?.provinceCode||provinceOptions.find(p=>p.name===address?.province)?.isoCode||''}));
  }
  async function saveDeliveryAddress(){
    const path=selectedAddress?'addresses/'+encodeURIComponent(selectedAddress):'addresses';
    const result=await apiCustomerAccount(path,selectedAddress?'PATCH':'POST',{...checkoutToAddress(form),name:form.fullName,phone:form.mobileNumber,label:addressLabel,isDefault:makeDefault});
    cacheCustomerAccount(result);setAddresses(result.addresses);setAddressNotice('Address saved for future orders.');return result.address;
  }


  useEffect(() => {
    let active = true;

    async function loadCountries() {
      try {
        const options = await apiLocationCountries();
        if (!active) return;

        setCountryOptions(options);
        setLocationOptionsError('');
        setForm((prev) => {
          const matchedCountry = options.find((option) => option.isoCode === prev.countryCode);
          if (matchedCountry) {
            return {
              ...prev,
              country: matchedCountry.name,
            };
          }

          const fallbackCountry =
            options.find((option) => option.isoCode === DEFAULT_DELIVERY_COUNTRY_CODE) || options[0] || null;

          if (prev.countryCode||!fallbackCountry) {
            return prev;
          }

          return {
            ...prev,
            country: fallbackCountry.name,
            countryCode: fallbackCountry.isoCode,
          };
        });
      } catch (error) {
        if (!active) return;
        setLocationOptionsError(error?.message || 'Unable to load countries right now.');
      } finally {
        if (active) {
          setIsCountriesLoading(false);
        }
      }
    }

    loadCountries();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadProvinces() {
      setIsProvinceLoading(true);

      try {
        const options = await apiLocationProvinces(form.countryCode);
        if (!active) return;

        setProvinceOptions(options);
        setLocationOptionsError('');
        setForm((prev) => {
          const selectedProvince = options.find((option) => option.isoCode === prev.provinceCode || option.name === prev.province);
          if (selectedProvince) {
            return {
              ...prev,
              province: selectedProvince.name,
              provinceCode: selectedProvince.isoCode,
            };
          }

          if (!prev.provinceCode && !prev.province && !prev.city) {
            return prev;
          }

          return prev;
        });
      } catch (error) {
        if (!active) return;
        setProvinceOptions([]);
        setLocationOptionsError(error?.message || 'Unable to load provinces right now.');
      } finally {
        if (active) {
          setIsProvinceLoading(false);
        }
      }
    }

    if (!form.countryCode) {
      return () => {
        active = false;
      };
    }

    loadProvinces();
    return () => {
      active = false;
    };
  }, [form.countryCode]);

  useEffect(() => {
    let active = true;

    async function loadCities() {
      setIsCityLoading(true);

      try {
        const options = await apiLocationCities(form.countryCode, form.provinceCode);
        if (!active) return;

        setCityOptions(options);
        setLocationOptionsError('');
        setForm((prev) => {
          const selectedCity = options.find((option) => option.name === prev.city);
          if (selectedCity || !prev.city) {
            return prev;
          }

          return prev;
        });
      } catch (error) {
        if (!active) return;
        setCityOptions([]);
        setLocationOptionsError(error?.message || 'Unable to load cities right now.');
      } finally {
        if (active) {
          setIsCityLoading(false);
        }
      }
    }

    if (!form.countryCode || isProvinceLoading || (countryHasProvinces && !form.provinceCode)) {
      return () => {
        active = false;
      };
    }

    loadCities();
    return () => {
      active = false;
    };
  }, [form.countryCode, form.provinceCode, countryHasProvinces, isProvinceLoading]);

  useEffect(()=>{if(!form.province||form.provinceCode)return;const match=provinceOptions.find(p=>p.name===form.province);if(match)setForm(current=>({...current,provinceCode:match.isoCode}));},[form.province,form.provinceCode,provinceOptions]);
  const [barangayOptions,setBarangayOptions]=useState([]);
  useEffect(()=>{let active=true;setBarangayOptions([]);if(form.countryCode==='PH'&&form.province&&form.city)apiLocationBarangays(form.countryCode,form.province,form.city).then(data=>{if(active)setBarangayOptions(data);}).catch(()=>{});return()=>{active=false;};},[form.countryCode,form.province,form.city]);
  function resolveItemImage(item) {
    return item.image || getImageUrl(item.imageUrl);
  }

  function clearFieldErrors(fieldNames) {
    setErrors((prev) => {
      if (!prev || Object.keys(prev).length === 0) return prev;

      const next = { ...prev };
      fieldNames.forEach((fieldName) => {
        delete next[fieldName];
      });
      return next;
    });
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value,...(['streetAddress','barangay','zipCode'].includes(name)?{customerLatitude:null,customerLongitude:null}:{}) }));
    clearFieldErrors([name]);
  }

  function handleCountryChange(event) {
    const nextCountryCode = event.target.value;
    const selectedCountry = countryOptions.find((option) => option.isoCode === nextCountryCode);

    setForm((prev) => ({
      ...prev,
      country: selectedCountry?.name || '',
      countryCode: nextCountryCode,
      province: '',
      provinceCode: '',
      city: '',
      barangay: '',
      customerLatitude:null,customerLongitude:null,
      zipCode: '',
    }));
    setProvinceOptions([]);
    setCityOptions([]);
    setLocationOptionsError('');
    clearFieldErrors(['country', 'province', 'city', 'zipCode']);
  }

  function handleProvinceChange(event) {
    const nextProvinceCode = event.target.value;
    const selectedProvince = provinceOptions.find((option) => option.isoCode === nextProvinceCode);

    setForm((prev) => ({
      ...prev,
      province: selectedProvince?.name || '',
      provinceCode: nextProvinceCode,
      city: '',
      zipCode: '',
    }));
    setCityOptions([]);
    setLocationOptionsError('');
    clearFieldErrors(['province', 'city', 'zipCode']);
  }

  function handleCityChange(event) {
    const nextCity = event.target.value;

    setForm((prev) => ({
      ...prev,
      city: nextCity,barangay:'',customerLatitude:null,customerLongitude:null,
    }));
    clearFieldErrors(['city']);
  }

  function handleCaptureMapLocation() {
    if (!shippingQuote.isLocalDelivery) {
      setLocationCaptureMessage('Map pin tracking is available for Belfiore local deliveries only.');
      return;
    }

    if (!navigator.geolocation) {
      setLocationCaptureMessage('This device does not support GPS location sharing.');
      return;
    }

    setIsCapturingLocation(true);
    setLocationCaptureMessage('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((prev) => ({
          ...prev,
          customerLatitude: position.coords.latitude,
          customerLongitude: position.coords.longitude,
        }));
        setLocationCaptureMessage('Your current map pin was saved for live rider tracking.');
        setIsCapturingLocation(false);
      },
      () => {
        setLocationCaptureMessage('Unable to get your current location. Please allow GPS permission and try again.');
        setIsCapturingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if(submitting.current)return;

    if (items.length === 0) {
      setConfirmation({
        type: 'error',
        message: 'Your cart is empty. Add items before checking out.',
      });
      return;
    }

    const nextErrors = {};
    if (!form.fullName.trim()) nextErrors.fullName = 'Full name is required.';
    if (!form.gmail.trim()) {
      nextErrors.gmail = 'Gmail is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.gmail.trim())) {
      nextErrors.gmail = 'Enter a valid contact email.';
    }
    if (!form.mobileNumber.trim()) {
      nextErrors.mobileNumber = 'Mobile number is required.';
    } else if (!/^[0-9+\-\s()]{7,15}$/.test(form.mobileNumber.trim())) {
      nextErrors.mobileNumber = 'Enter a valid mobile number.';
    }
    if (!form.streetAddress.trim()) nextErrors.streetAddress = 'House number or street is required.';
    if (!form.barangay.trim()) nextErrors.barangay = 'Barangay is required.';
    if (!form.countryCode.trim()) nextErrors.country = 'Country is required.';
    if (countryHasProvinces && !form.provinceCode.trim()) nextErrors.province = 'Province is required.';
    if (!form.city.trim()) nextErrors.city = 'City is required.';
    if (!form.zipCode.trim()) nextErrors.zipCode = 'Postal code or ZIP code is required.';
    if (!form.paymentMethod) nextErrors.paymentMethod = 'Please select a payment method.';
    if (form.paymentMethod === 'ONLINE' && !shippingQuote.isConfirmed) {
      nextErrors.paymentMethod = 'Online payment is available after the courier shipping fee is confirmed. Please use COD for this order.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if(accountLoading||accountError||quoting||!confirmedQuote){setConfirmation({type:'error',message:quoteError||'Wait for your delivery destination to be validated.'});return;}
    try {
      submitting.current=true;setIsSubmitting(true);
      if(saveAddress)await saveDeliveryAddress();
      const payload={
        savedAddressId:selectedAddress||undefined,deliveryAddress:checkoutToAddress(form),
        fullName: form.fullName.trim(),
        gmail: form.gmail.trim(),
        mobileNumber: form.mobileNumber.trim(),
        location: deliveryLocation,
        country: form.country.trim(),
        province: form.province.trim(),
        city: form.city.trim(),
        barangay: form.barangay.trim(),
        postalCode: form.zipCode.trim(),
        zipCode: form.zipCode.trim(),
        customerLatitude: shippingQuote.isLocalDelivery ? form.customerLatitude ?? null : null,
        customerLongitude: shippingQuote.isLocalDelivery ? form.customerLongitude ?? null : null,
        paymentMethod: form.paymentMethod,
        items: items.map((item) => ({ id: item.productId||item.id, qty: item.qty,batchId:item.batchId||null,variantId:item.variantId||null,expectedUnitPrice:item.price })),
      };
      const signature=JSON.stringify(payload);if(submission.current?.signature!==signature){
        let hash=null;try{hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature))),b=>b.toString(16).padStart(2,'0')).join('');}catch{/* In-memory keyed retries remain supported. */}
        let pending=null;try{pending=JSON.parse(sessionStorage.getItem(customerAccountStorageKey('pendingCheckout'))||'null');}catch{/* Storage can be unavailable. */}
        submission.current={signature,key:hash&&pending?.hash===hash?pending.key:crypto.randomUUID()};
        if(hash)try{sessionStorage.setItem(customerAccountStorageKey('pendingCheckout'),JSON.stringify({hash,key:submission.current.key}));}catch{/* No raw contact or address data is stored. */}
      }
      const order=await onPlaceOrder({...payload,checkoutRequestId:submission.current.key});

      try{sessionStorage.removeItem(customerAccountStorageKey('pendingCheckout'));}catch{/* Optional browser storage. */}
      const reference = `BF-${String(order.id).padStart(6, '0')}`;

      if (form.paymentMethod === 'ONLINE') {
        if (!order?.checkoutUrl) {
          throw new Error('Unable to start the PayMongo checkout session.');
        }

        setConfirmation({
          type: 'success',
          message: `Order ${reference} was created. Redirecting you to PayMongo checkout...`,
        });
        onOrderPlaced(order, { redirectToOrders: false });
        window.location.href = order.checkoutUrl;
        return;
      }

      const paymentText =
        form.paymentMethod === 'COD'
          ? 'Cash on Delivery selected. Please prepare exact amount on delivery.'
          : 'Online Payment selected. Payment instructions will be sent to you.';

      setConfirmation({
        type: 'success',
        message: `Order placed successfully. Reference: ${reference}. ${paymentText}`,
      });
      onOrderPlaced(order);
      setForm((prev) => ({
        ...getStoredCustomerDetails(),
        paymentMethod: prev.paymentMethod,
        customerLatitude: null,
        customerLongitude: null,
      }));
      setErrors({});
      setLocationCaptureMessage('');
    } catch (error) {
      setConfirmation({
        type: 'error',
        message: error?.message || 'Failed to place order. Please try again.',
      });
    } finally {
      submitting.current=false;setIsSubmitting(false);
    }
  }

  return (
    <section className="max-w-6xl mx-auto px-6 py-12" id="checkout">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-['Montserrat'] text-xs uppercase tracking-[0.35em] text-[#5e6f65]">Checkout</p>
          <h2 className="mt-3 font-['Playfair_Display'] text-3xl text-[#0f4d2e] sm:text-4xl">
            Complete your order
          </h2>
        </div>
        <div className="rounded-full border border-[#d8dfd3] px-5 py-2 text-xs uppercase tracking-[0.3em] text-[#5e6f65]">
          {totalItems} item{totalItems === 1 ? '' : 's'}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <form className="space-y-6 rounded-2xl border border-[#e1e7dc] bg-white p-6 sm:p-8" onSubmit={handleSubmit}>
          <div className="rounded-2xl border border-[#e7ede3] bg-[#f8fbf6] p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-['Playfair_Display'] text-lg text-[#0f4d2e]">Personal details</h3>
                <p className="text-sm text-[#5e6f65]">Your saved account name and Gmail are filled in automatically.</p>
              </div>
              <span className="text-xs uppercase tracking-[0.28em] text-[#7b867d]">Editable before checkout</span>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="fullName" className="mb-2 block text-sm text-[#1f2f28]">
                  Full Name
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  value={form.fullName}
                  onChange={handleFieldChange}
                  className="w-full rounded-xl border border-[#d8dfd3] bg-white px-4 py-3 text-sm outline-none focus:border-[#0b7a3c] focus:ring-2 focus:ring-[#0b7a3c]/20"
                  placeholder="Juan Dela Cruz"
                />
                {errors.fullName ? <p className="mt-2 text-sm text-[#8b4a4a]">{errors.fullName}</p> : null}
              </div>

              <div>
                <label htmlFor="gmail" className="mb-2 block text-sm text-[#1f2f28]">
                  Email
                </label>
                <input
                  id="gmail"
                  name="gmail"
                  type="email"
                  value={form.gmail}
                  onChange={handleFieldChange}
                  className="w-full rounded-xl border border-[#d8dfd3] bg-white px-4 py-3 text-sm outline-none focus:border-[#0b7a3c] focus:ring-2 focus:ring-[#0b7a3c]/20"
                  placeholder="yourname@gmail.com"
                />
                {errors.gmail ? <p className="mt-2 text-sm text-[#8b4a4a]">{errors.gmail}</p> : null}
              </div>

              <div>
                <label htmlFor="mobileNumber" className="mb-2 block text-sm text-[#1f2f28]">
                  Mobile Number
                </label>
                <input
                  id="mobileNumber"
                  name="mobileNumber"
                  type="tel"
                  value={form.mobileNumber}
                  onChange={handleFieldChange}
                  className="w-full rounded-xl border border-[#d8dfd3] bg-white px-4 py-3 text-sm outline-none focus:border-[#0b7a3c] focus:ring-2 focus:ring-[#0b7a3c]/20"
                  placeholder="09XXXXXXXXX"
                />
                {errors.mobileNumber ? <p className="mt-2 text-sm text-[#8b4a4a]">{errors.mobileNumber}</p> : null}
              </div>

              <div className="md:col-span-2">
                <h3 className="text-lg font-semibold text-[#0f4d2e]">Select Delivery Address</h3>
                {accountLoading?<p role="status" className="mt-3 text-sm">Loading your saved addresses...</p>:accountError?<p role="alert" className="mt-3 text-sm text-red-700">{accountError} Refresh checkout to retry.</p>:<div className="mt-3 space-y-3">
                  {addresses.length>0&&<label className="block text-sm">Saved address<select value={selectedAddress} onChange={e=>chooseAddress(e.target.value)} className="mt-1 w-full rounded-xl border border-[#d8dfd3] p-3"><option value="">Enter a new address</option>{[...addresses].sort((a,b)=>Number(b.isDefault)-Number(a.isDefault)).map(a=><option key={a.id} value={a.id}>{a.label||'Address'} {a.isDefault?'(Default)':''} - {a.addressLine}, {a.city}</option>)}</select></label>}
                  {selectedAddress&&<div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm"><p className="font-semibold">{addresses.find(a=>String(a.id)===selectedAddress)?.label||'Saved delivery address'}</p><p className="mt-1">{deliveryLocation}</p><p className="mt-1 text-xs text-emerald-900">Saved recipient: {addresses.find(a=>String(a.id)===selectedAddress)?.name} {addresses.find(a=>String(a.id)===selectedAddress)?.phone}</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={()=>{setEditingAddress(true);setRepairFields([]);}} className="font-medium text-emerald-900 underline">Edit Address</button><button type="button" onClick={()=>chooseAddress('')} className="font-medium text-emerald-900 underline">Add New Address</button><Link to="/addresses" className="text-emerald-900 underline">Manage Addresses</Link></div></div>}
                  {!selectedAddress&&addresses.length>1&&!preferredAddress(addresses)&&<p className="text-xs text-slate-500">Select a saved address or enter a new one. No default address was changed.</p>}
                  {repairOnly&&<p className="text-sm text-amber-800">Complete only the missing address details below.</p>}
                </div>}
                <div hidden={!showAddressForm||accountLoading}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <label htmlFor="streetAddress" className="block text-sm text-[#1f2f28]">
                    Delivery Address
                  </label>
                  <span className="text-xs uppercase tracking-[0.22em] text-[#7b867d]">All countries, provinces, and cities</span>
                </div>

                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div hidden={repairOnly&&!repairFields.includes('streetAddress')}>
                    <label htmlFor="streetAddress" className="mb-2 block text-sm text-[#1f2f28]">
                      House No. / Street
                    </label>
                    <input
                      id="streetAddress"
                      name="streetAddress"
                      type="text"
                      value={form.streetAddress}
                      onChange={handleFieldChange}
                      className="w-full rounded-xl border border-[#d8dfd3] bg-white px-4 py-3 text-sm outline-none focus:border-[#0b7a3c] focus:ring-2 focus:ring-[#0b7a3c]/20"
                      placeholder="Blk 2 Lot 5, Rose St."
                    />
                    {errors.streetAddress ? <p className="mt-2 text-sm text-[#8b4a4a]">{errors.streetAddress}</p> : null}
                  </div>

                  <div hidden={repairOnly&&!repairFields.includes('barangay')}>
                    <label htmlFor="barangay" className="mb-2 block text-sm text-[#1f2f28]">
                      Barangay
                    </label>
                    <input
                      list="checkout-barangays"
                      id="barangay"
                      name="barangay"
                      type="text"
                      value={form.barangay}
                      onChange={handleFieldChange}
                      className="w-full rounded-xl border border-[#d8dfd3] bg-white px-4 py-3 text-sm outline-none focus:border-[#0b7a3c] focus:ring-2 focus:ring-[#0b7a3c]/20"
                      placeholder="Barangay San Roque"
                    />
                    <datalist id="checkout-barangays">{barangayOptions.map(a=><option key={a.code||a.name} value={a.name}/>)}</datalist>
                    {errors.barangay ? <p className="mt-2 text-sm text-[#8b4a4a]">{errors.barangay}</p> : null}
                  </div>

                  <div hidden={repairOnly&&!repairFields.includes('countryCode')}>
                    <label htmlFor="countryCode" className="mb-2 block text-sm text-[#1f2f28]">
                      Country
                    </label>
                    <select
                      id="countryCode"
                      name="countryCode"
                      value={form.countryCode}
                      onChange={handleCountryChange}
                      disabled={isCountriesLoading}
                      className="w-full rounded-xl border border-[#d8dfd3] bg-white px-4 py-3 text-sm outline-none focus:border-[#0b7a3c] focus:ring-2 focus:ring-[#0b7a3c]/20 disabled:bg-[#f3f6f1] disabled:text-[#8d998f]"
                    >
                      <option value="">{isCountriesLoading ? 'Loading countries...' : 'Select country'}</option>
                      {countryOptions.map((option) => (
                        <option key={option.isoCode} value={option.isoCode}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    {errors.country ? <p className="mt-2 text-sm text-[#8b4a4a]">{errors.country}</p> : null}
                  </div>

                  <div hidden={repairOnly&&!repairFields.includes('province')}>
                    <label htmlFor="provinceCode" className="mb-2 block text-sm text-[#1f2f28]">
                      Province / State
                    </label>
                    <select
                      id="provinceCode"
                      name="provinceCode"
                      value={form.provinceCode}
                      onChange={handleProvinceChange}
                      disabled={!form.countryCode || isCountriesLoading || isProvinceLoading || !countryHasProvinces}
                      className="w-full rounded-xl border border-[#d8dfd3] bg-white px-4 py-3 text-sm outline-none focus:border-[#0b7a3c] focus:ring-2 focus:ring-[#0b7a3c]/20 disabled:bg-[#f3f6f1] disabled:text-[#8d998f]"
                    >
                      <option value="">
                        {isProvinceLoading
                          ? 'Loading provinces...'
                          : !form.countryCode
                            ? 'Select country first'
                            : countryHasProvinces
                              ? 'Select province'
                              : 'No province selection required'}
                      </option>
                      {provinceOptions.map((option) => (
                        <option key={option.isoCode} value={option.isoCode}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    {errors.province ? <p className="mt-2 text-sm text-[#8b4a4a]">{errors.province}</p> : null}
                  </div>

                  <div hidden={repairOnly&&!repairFields.includes('city')}>
                    <label htmlFor="city" className="mb-2 block text-sm text-[#1f2f28]">
                      City / Municipality
                    </label>
                    <select
                      id="city"
                      name="city"
                      value={form.city}
                      onChange={handleCityChange}
                      disabled={!form.countryCode || isCountriesLoading || isProvinceLoading || isCityLoading || (countryHasProvinces && !form.provinceCode)}
                      className="w-full rounded-xl border border-[#d8dfd3] bg-white px-4 py-3 text-sm outline-none focus:border-[#0b7a3c] focus:ring-2 focus:ring-[#0b7a3c]/20 disabled:bg-[#f3f6f1] disabled:text-[#8d998f]"
                    >
                      <option value="">
                        {isCityLoading
                          ? 'Loading cities...'
                          : !form.countryCode
                            ? 'Select country first'
                            : countryHasProvinces && !form.provinceCode
                              ? 'Select province first'
                              : cityOptions.length > 0
                                ? 'Select city'
                                : 'No cities available'}
                      </option>
                      {cityOptions.map((option) => (
                        <option key={`${option.countryCode}-${option.stateCode}-${option.name}`} value={option.name}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    {errors.city ? <p className="mt-2 text-sm text-[#8b4a4a]">{errors.city}</p> : null}
                  </div>

                  <div hidden={repairOnly&&!repairFields.includes('zipCode')}>
                    <label htmlFor="zipCode" className="mb-2 block text-sm text-[#1f2f28]">
                      Postal Code / ZIP Code
                    </label>
                    <input
                      id="zipCode"
                      name="zipCode"
                      type="text"
                      value={form.zipCode}
                      onChange={handleFieldChange}
                      className="w-full rounded-xl border border-[#d8dfd3] bg-white px-4 py-3 text-sm outline-none focus:border-[#0b7a3c] focus:ring-2 focus:ring-[#0b7a3c]/20"
                      placeholder="1000 or 90210"
                    />
                    {errors.zipCode ? <p className="mt-2 text-sm text-[#8b4a4a]">{errors.zipCode}</p> : null}
                  </div>
                </div>

                <label className="mt-4 block text-sm">Address label<select value={addressLabel} onChange={e=>setAddressLabel(e.target.value)} className="ml-2 rounded-lg border p-2">{['Home','Work','Other'].map(label=><option key={label}>{label}</option>)}</select></label>
                <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={saveAddress} onChange={e=>setSaveAddress(e.target.checked)}/>Save this address for future orders.</label>
                {saveAddress&&<label className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={makeDefault} onChange={e=>setMakeDefault(e.target.checked)}/>Set as my default address</label>}
                {selectedAddress&&<button type="button" disabled={!confirmedQuote||quoting} onClick={()=>{setEditingAddress(false);setRepairFields([]);}} className="mt-3 rounded-lg border border-emerald-200 px-3 py-2 text-sm disabled:opacity-50">Use this address for this order</button>}
                </div>
                {addressNotice&&<p role="status" className="mt-2 text-sm text-emerald-800">{addressNotice}</p>}
                {quoting&&<p role="status" className="mt-2 text-xs text-slate-500">Validating destination and shipping...</p>}
                {quoteError&&<p role="alert" className="mt-2 text-sm text-red-700">{quoteError}</p>}
                {locationOptionsError ? <p className="mt-3 text-sm text-[#8b4a4a]">{locationOptionsError}</p> : null}

                <div className="mt-4 rounded-xl border border-[#d8dfd3] bg-[#fbfdf9] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#7b867d]">Delivery Preview</p>
                  <p className="mt-2 text-sm text-[#1f2f28]">
                    {deliveryLocation || 'Choose your address details above to generate the final delivery location.'}
                  </p>
                </div>

                {shippingQuote.deliveryMode ? (
                  <div className="mt-3 rounded-xl border border-[#d8dfd3] bg-[#f8fbf6] px-4 py-3">
                    <p className="text-sm font-semibold text-[#0f4d2e]">{shippingQuote.deliveryMethod}</p>
                    <p className="mt-1 text-xs text-[#5e6f65]">{shippingQuote.message}</p>
                    <p className="mt-1 text-xs font-medium text-[#0f4d2e]">{shippingQuote.trackingMessage}</p>
                    {!shippingQuote.isLocalDelivery && shippingQuote.courierOptions?.length ? (
                      <p className="mt-1 text-xs text-[#5e6f65]">Available courier may be {shippingQuote.courierOptions.join(', ')}.</p>
                    ) : null}
                  </div>
                ) : null}

                {shippingQuote.isLocalDelivery ? (
                  <div className="mt-3 rounded-xl border border-dashed border-[#c7d5c5] bg-white px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-[#0f4d2e]">Map Pin for Rider Tracking</p>
                        <p className="mt-1 text-xs text-[#5e6f65]">
                          Save your current GPS position so the Belfiore rider can find your location.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCaptureMapLocation}
                        disabled={isCapturingLocation}
                        className="rounded-full border border-[#0b7a3c] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#0b7a3c] transition hover:bg-[#0b7a3c] hover:text-white disabled:cursor-not-allowed disabled:border-[#9eb1a5] disabled:text-[#9eb1a5] disabled:hover:bg-transparent disabled:hover:text-[#9eb1a5]"
                      >
                        {isCapturingLocation
                          ? 'Getting GPS...'
                          : form.customerLatitude != null && form.customerLongitude != null
                            ? 'Update Map Pin'
                            : 'Use Current Location'}
                      </button>
                    </div>

                    <p className="mt-3 text-xs text-[#5e6f65]">
                      {form.customerLatitude != null && form.customerLongitude != null
                        ? `Saved coordinates: ${Number(form.customerLatitude).toFixed(5)}, ${Number(form.customerLongitude).toFixed(5)}`
                        : 'No GPS pin saved yet. The selected address above is still required.'}
                    </p>
                    {locationCaptureMessage ? <p className="mt-2 text-xs text-[#0f4d2e]">{locationCaptureMessage}</p> : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <fieldset>
            <legend className="mb-3 block text-sm text-[#1f2f28]">Payment Method</legend>
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#d8dfd3] p-4">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="COD"
                  checked={form.paymentMethod === 'COD'}
                  onChange={handleFieldChange}
                  className="h-4 w-4 accent-[#0b7a3c]"
                />
                <span className="text-sm text-[#1f2f28]">Cash on Delivery (COD)</span>
              </label>
              <label className={`flex items-center gap-3 rounded-xl border border-[#d8dfd3] p-4 ${shippingQuote.isConfirmed ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="ONLINE"
                  checked={form.paymentMethod === 'ONLINE'}
                  onChange={handleFieldChange}
                  disabled={!shippingQuote.isConfirmed}
                  className="h-4 w-4 accent-[#0b7a3c]"
                />
                <span className="text-sm text-[#1f2f28]">Online Payment{shippingQuote.isConfirmed ? '' : ' (available after shipping confirmation)'}</span>
              </label>
            </div>
            {errors.paymentMethod ? <p className="mt-2 text-sm text-[#8b4a4a]">{errors.paymentMethod}</p> : null}
            {form.paymentMethod === 'ONLINE' && <p className="mt-2 text-xs text-[#5e6f65]">Online checkout temporarily reserves your plants and lettuce packs while payment is pending. Unpaid reservations are automatically released when they expire.</p>}
          </fieldset>

          <button
            className="w-full rounded-full border border-[#0b7a3c] bg-[#0b7a3c] py-3 text-xs uppercase tracking-[0.35em] text-white transition hover:bg-[#0d6a35] disabled:cursor-not-allowed disabled:border-[#95a29b] disabled:bg-[#95a29b]"
            type="submit"
            disabled={isSubmitting||accountLoading||Boolean(accountError)||quoting||!confirmedQuote}
          >
            {isSubmitting
              ? form.paymentMethod === 'ONLINE'
                ? 'Preparing PayMongo...'
                : 'Placing Order...'
              : form.paymentMethod === 'ONLINE'
                ? 'Continue to PayMongo'
                : 'Place Order'}
          </button>

          {confirmation ? (
            <p className={`text-sm ${confirmation.type === 'success' ? 'text-[#0f4d2e]' : 'text-[#8b4a4a]'}`}>
              {confirmation.message}
            </p>
          ) : null}
        </form>

        <aside className="h-fit rounded-2xl border border-[#e1e7dc] bg-white p-6">
          <h3 className="font-['Playfair_Display'] text-lg text-[#0f4d2e]">Review Order</h3>

          <div className="mt-5 space-y-3">
            {items.length === 0 ? (
              <p className="text-sm text-[#5e6f65]">Your cart is empty.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 text-sm">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#eef2ea]">
                      {resolveItemImage(item) ? (
                        <img
                          src={resolveItemImage(item)}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-[#e9efe6] via-[#f4f6f0] to-[#dce5d9]" />
                      )}
                    </div>
                    <div className="min-w-0 text-[#1f2f28]">
                      <p className="truncate">{item.name}</p>
                      {item.sellingUnit&&<p className="text-xs text-slate-600">{item.qty} {item.sellingUnit} | {item.variantSku}{item.weightKg?` | Total weight: ${Number(item.weightKg)*Number(item.qty)} kg`:item.piecesPerUnit?` | ${Number(item.piecesPerUnit)*Number(item.qty)} pieces total`:null}</p>}{item.batchCode && <p className="text-xs text-[#5e6f65]">{item.batchCode} · {formatPrice(item.price)} per 400g pack</p>}
                      <p className="text-xs text-[#5e6f65]">Qty: {item.qty} {item.allowsMultipleQuantity ? 'packs · 400g per pack' : 'individual plant'}</p>
                    </div>
                  </div>
                  <span className="font-medium text-[#0f4d2e]">{formatPrice(item.price * item.qty)}</span>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 border-t border-[#e1e7dc] pt-4">
            <div className="space-y-3 text-sm text-[#5e6f65]">
              <div className="flex items-center justify-between gap-4">
                <span>Delivery Method</span>
                <span className="text-right font-medium text-[#0f4d2e]">{shippingQuote.deliveryMethod || 'Select delivery location'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span className="font-medium text-[#0f4d2e]">{formatPrice(confirmedQuote?.subtotal??total)}</span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span>Shipping Fee</span>
                <span className="text-right font-medium text-[#0f4d2e]">{shippingQuote.isConfirmed ? formatPrice(shippingQuote.fee) : 'Shipping fee to be confirmed'}</span>
              </div>
              <div className="flex items-start justify-between gap-4 border-t border-[#e1e7dc] pt-3 text-base">
                <span className="font-semibold text-[#1f2f28]">Total</span>
                <span className="text-right font-semibold text-[#0f4d2e]">{orderTotal == null ? 'To be confirmed' : formatPrice(orderTotal)}</span>
              </div>
              <p className="rounded-xl bg-[#f8fbf6] px-3 py-2 text-xs leading-5 text-[#5e6f65]">{shippingQuote.message}</p>
              {shippingQuote.trackingMessage ? (
                <p className="px-3 text-xs font-medium leading-5 text-[#0f4d2e]">{shippingQuote.trackingMessage}</p>
              ) : null}
            </div>
            <Link
              to="/cart"
              className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-[#d8dfd3] py-3 text-xs uppercase tracking-[0.25em] text-[#1f2f28] hover:border-[#0b7a3c] hover:text-[#0b7a3c]"
            >
              Back to Cart
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
