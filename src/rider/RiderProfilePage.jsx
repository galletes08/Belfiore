import { useEffect, useRef, useState } from 'react';
import { Bike, Camera, FileText, IdCard, Mail, MapPin, Phone, Save, ShieldCheck, UserRound } from 'lucide-react';
import {
  apiRiderProfile,
  apiUpdateRiderProfile,
  getImageUrl,
  getRiderUser,
  setRiderUser,
} from '../api/client';

const emptyProfile = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  vehicleType: '',
  plateNumber: '',
  licenseNumber: '',
  emergencyContact: '',
  bio: '',
  profileImageUrl: '',
  status: 'active',
  isAvailable: true,
};

function normalizeProfile(profile) {
  return {
    ...emptyProfile,
    ...profile,
    firstName: profile?.firstName || '',
    lastName: profile?.lastName || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
    address: profile?.address || '',
    vehicleType: profile?.vehicleType || '',
    plateNumber: profile?.plateNumber || '',
    licenseNumber: profile?.licenseNumber || '',
    emergencyContact: profile?.emergencyContact || '',
    bio: profile?.bio || '',
    profileImageUrl: profile?.profileImageUrl || '',
  };
}

function Field({ icon, label, value, onChange, type = 'text', required = false, placeholder = '' }) {
  const IconComponent = icon;

  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</span>
      <span className="mt-2 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 transition focus-within:border-[#1f5a43] focus-within:ring-4 focus-within:ring-emerald-100">
        <IconComponent size={16} className="shrink-0 text-[#1f5a43]" />
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
        />
      </span>
    </label>
  );
}

function formatStatus(value) {
  return String(value || 'active').replace(/^\w/, (letter) => letter.toUpperCase());
}

export default function RiderProfilePage() {
  const [profile, setProfile] = useState(emptyProfile);
  const [loadStatus, setLoadStatus] = useState('loading');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [imageError, setImageError] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      try {
        const data = await apiRiderProfile();
        if (!mounted) return;
        setProfile(normalizeProfile(data));
        setLoadStatus('success');
        setError('');
      } catch (err) {
        if (!mounted) return;
        setLoadStatus('error');
        setError(err.message || 'Failed to load rider profile.');
      }
    }

    loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const photoSrc = previewUrl || getImageUrl(profile.profileImageUrl);
  const displayName = `${profile.firstName} ${profile.lastName}`.trim() || 'Belfiore Rider';

  function updateField(field, value) {
    setProfile((current) => ({ ...current, [field]: value }));
    setMessage('');
  }

  function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setImageError('Only JPG, PNG, or WEBP files are allowed.');
      event.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setImageError('Image must be 2 MB or less.');
      event.target.value = '';
      return;
    }

    setSelectedImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    setImageError('');
    setMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = new FormData();
      [
        'firstName',
        'lastName',
        'email',
        'phone',
        'address',
        'vehicleType',
        'plateNumber',
        'licenseNumber',
        'emergencyContact',
        'bio',
      ].forEach((field) => {
        payload.append(field, profile[field] || '');
      });

      if (selectedImage) {
        payload.append('profileImage', selectedImage);
      }

      const updatedProfile = normalizeProfile(await apiUpdateRiderProfile(payload));
      setProfile(updatedProfile);
      setSelectedImage(null);
      setPreviewUrl('');
      setMessage('Profile saved.');

      const currentUser = getRiderUser() || {};
      setRiderUser({
        ...currentUser,
        firstName: updatedProfile.firstName,
        lastName: updatedProfile.lastName,
        email: updatedProfile.email,
        name: `${updatedProfile.firstName} ${updatedProfile.lastName}`.trim(),
        role: 'rider',
        profileImageUrl: updatedProfile.profileImageUrl,
      });
    } catch (err) {
      setError(err.message || 'Failed to save rider profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 font-['Montserrat'] sm:space-y-7">
      <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-sm">
        <div className="bg-[#173d2b] px-5 py-7 text-white sm:px-8 sm:py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-100/90">Rider Profile</p>
              <h1 className="mt-3 font-['Playfair_Display'] text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                {displayName}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-emerald-50/90 sm:text-base">
                Contact details, vehicle info, and rider photo for delivery coordination.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-50/80">Status</p>
                <p className="mt-2 text-2xl font-semibold leading-none">{formatStatus(profile.status)}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-50/80">Availability</p>
                <p className="mt-2 text-2xl font-semibold leading-none">{profile.isAvailable ? 'Available' : 'Busy'}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {loadStatus === 'loading' ? (
        <section className="rounded-3xl border border-white/80 bg-white p-8 text-sm font-medium text-gray-500 shadow-sm">
          Loading rider profile...
        </section>
      ) : null}

      {loadStatus === 'error' ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
          {error}
        </section>
      ) : null}

      {loadStatus === 'success' ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <form onSubmit={handleSubmit} className="rounded-[1.75rem] border border-white/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="border-b border-gray-100 pb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Information</p>
              <h2 className="mt-2 font-['Playfair_Display'] text-3xl font-semibold text-gray-900">Rider Details</h2>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field
                icon={UserRound}
                label="First Name"
                value={profile.firstName}
                onChange={(value) => updateField('firstName', value)}
                required
              />
              <Field
                icon={UserRound}
                label="Last Name"
                value={profile.lastName}
                onChange={(value) => updateField('lastName', value)}
                required
              />
              <Field
                icon={Mail}
                label="Email"
                type="email"
                value={profile.email}
                onChange={(value) => updateField('email', value)}
                required
              />
              <Field
                icon={Phone}
                label="Phone"
                value={profile.phone}
                onChange={(value) => updateField('phone', value)}
                required
              />
              <label className="block md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Address</span>
                <span className="mt-2 flex items-start gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 transition focus-within:border-[#1f5a43] focus-within:ring-4 focus-within:ring-emerald-100">
                  <MapPin size={16} className="mt-0.5 shrink-0 text-[#1f5a43]" />
                  <textarea
                    value={profile.address}
                    onChange={(event) => updateField('address', event.target.value)}
                    rows={3}
                    className="min-w-0 flex-1 resize-none bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
                  />
                </span>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Vehicle Type</span>
                <span className="mt-2 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 transition focus-within:border-[#1f5a43] focus-within:ring-4 focus-within:ring-emerald-100">
                  <Bike size={16} className="shrink-0 text-[#1f5a43]" />
                  <select
                    value={profile.vehicleType}
                    onChange={(event) => updateField('vehicleType', event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none"
                  >
                    <option value="">Select vehicle</option>
                    <option value="Motorcycle">Motorcycle</option>
                    <option value="Bicycle">Bicycle</option>
                    <option value="Car">Car</option>
                    <option value="Van">Van</option>
                    <option value="Truck">Truck</option>
                  </select>
                </span>
              </label>
              <Field
                icon={IdCard}
                label="Plate Number"
                value={profile.plateNumber}
                onChange={(value) => updateField('plateNumber', value)}
              />
              <Field
                icon={ShieldCheck}
                label="License Number"
                value={profile.licenseNumber}
                onChange={(value) => updateField('licenseNumber', value)}
              />
              <Field
                icon={Phone}
                label="Emergency Contact"
                value={profile.emergencyContact}
                onChange={(value) => updateField('emergencyContact', value)}
              />

              <label className="block md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Notes</span>
                <span className="mt-2 flex items-start gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 transition focus-within:border-[#1f5a43] focus-within:ring-4 focus-within:ring-emerald-100">
                  <FileText size={16} className="mt-0.5 shrink-0 text-[#1f5a43]" />
                  <textarea
                    value={profile.bio}
                    onChange={(event) => updateField('bio', event.target.value)}
                    rows={3}
                    className="min-w-0 flex-1 resize-none bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
                  />
                </span>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0f4d2e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#173d2b] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
              {message ? <p className="text-sm font-semibold text-emerald-700">{message}</p> : null}
              {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}
            </div>
          </form>

          <aside className="space-y-5">
            <div className="rounded-[1.75rem] border border-white/80 bg-white p-5 shadow-sm">
              <div className="mx-auto h-36 w-36 overflow-hidden rounded-full border border-emerald-100 bg-gray-100 shadow-sm">
                {photoSrc ? (
                  <img src={photoSrc} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-400">
                    <UserRound size={52} />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-[#0f4d2e] transition hover:border-[#0f4d2e] hover:bg-white"
              >
                <Camera size={16} />
                Upload Picture
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                className="hidden"
              />
              {imageError ? <p className="mt-3 text-sm font-medium text-rose-700">{imageError}</p> : null}
            </div>

            <div className="rounded-[1.75rem] border border-white/80 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Contact</p>
              <h3 className="mt-2 font-['Playfair_Display'] text-2xl font-semibold text-gray-900">{displayName}</h3>
              <div className="mt-5 space-y-3 text-sm leading-6 text-gray-600">
                <p className="flex items-center gap-2">
                  <Mail size={15} className="text-[#1f5a43]" />
                  {profile.email || 'No email saved'}
                </p>
                <p className="flex items-center gap-2">
                  <Phone size={15} className="text-[#1f5a43]" />
                  {profile.phone || 'No phone saved'}
                </p>
                <p className="flex items-start gap-2">
                  <MapPin size={15} className="mt-1 text-[#1f5a43]" />
                  <span>{profile.address || 'No address saved'}</span>
                </p>
              </div>
            </div>
          </aside>
        </section>
      ) : null}
    </div>
  );
}
