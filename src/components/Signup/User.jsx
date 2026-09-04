import { useRef, useState } from "react";
import AccountSidebar from "./AccountSidebar";
import { CalendarDays, Camera, Mail, Phone, Save, ShieldCheck, UserRound } from "lucide-react";
import { clearCustomerToken } from "../../api/client";

const PROFILE_STORAGE_KEY = "customerProfile";

const initialProfile = {
  username: "",
  name: "",
  email: "",
  phone: "",
  gender: "",
  birthDate: "",
  image: ""
};

function loadStoredProfile() {
  try {
    const rawProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
    const parsedProfile = rawProfile ? JSON.parse(rawProfile) : {};

    return {
      ...initialProfile,
      ...parsedProfile,
      name: parsedProfile?.name || localStorage.getItem("customerName") || "",
      email: parsedProfile?.email || localStorage.getItem("customerEmail") || ""
    };
  } catch {
    return {
      ...initialProfile,
      name: localStorage.getItem("customerName") || "",
      email: localStorage.getItem("customerEmail") || ""
    };
  }
}

function TextField({ icon, label, type = "text", value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#6c786f]">{label}</span>
      <span className="mt-2 flex items-center gap-3 rounded-2xl border border-[#dce5d8] bg-white px-4 py-3 transition focus-within:border-[#0f6b45] focus-within:ring-4 focus-within:ring-[#d9ebdc]">
        <span className="text-[#0f6b45]">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-[#173d2b] outline-none placeholder:text-[#98a39a]"
        />
      </span>
    </label>
  );
}

function ProfileSummary({ profile }) {
  const displayName = profile.name || profile.username || "Belfiore Customer";
  const displayEmail = profile.email || "No email saved";
  const displayPhone = profile.phone || "No phone saved";

  return (
    <div className="rounded-2xl border border-[#e1e7dc] bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f3ea] text-[#0f4d2e]">
          <ShieldCheck size={18} />
        </span>
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#6c786f]">Account</p>
          <h3 className="mt-1 font-['Playfair_Display'] text-2xl text-[#0f4d2e]">{displayName}</h3>
        </div>
      </div>

      <div className="mt-5 space-y-3 text-sm leading-6 text-[#405145]">
        <p className="flex items-center gap-2">
          <Mail size={15} className="text-[#0f6b45]" />
          {displayEmail}
        </p>
        <p className="flex items-center gap-2">
          <Phone size={15} className="text-[#0f6b45]" />
          {displayPhone}
        </p>
        <p className="flex items-center gap-2">
          <CalendarDays size={15} className="text-[#0f6b45]" />
          {profile.birthDate || "No birth date saved"}
        </p>
      </div>
    </div>
  );
}

export default function UserAccountPage() {
  const [profile, setProfile] = useState(loadStoredProfile);
  const [savedMessage, setSavedMessage] = useState("");
  const [imageError, setImageError] = useState("");
  const fileInputRef = useRef(null);

  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    clearCustomerToken();
  };

  const handleFieldChange = (field, value) => {
    setProfile((previous) => ({
      ...previous,
      [field]: value
    }));
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const isAllowedType = ["image/jpeg", "image/png"].includes(file.type);
    if (!isAllowedType) {
      setImageError("Only JPG/JPEG or PNG files are allowed.");
      return;
    }

    const isAllowedSize = file.size <= 1024 * 1024;
    if (!isAllowedSize) {
      setImageError("Image must be 1 MB or less.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setProfile((previous) => ({
        ...previous,
        image: String(reader.result)
      }));
      setImageError("");
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (event) => {
    event.preventDefault();
    const cleanName = profile.name.trim();
    const cleanEmail = profile.email.trim();
    const cleanPhone = profile.phone.trim();
    const nextProfile = {
      ...profile,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone
    };

    if (cleanName) {
      localStorage.setItem("customerName", cleanName);
    }
    if (cleanEmail) {
      localStorage.setItem("customerEmail", cleanEmail);
    }
    if (cleanPhone) {
      localStorage.setItem("customerPhone", cleanPhone);
    } else {
      localStorage.removeItem("customerPhone");
    }
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
    setProfile(nextProfile);
    setSavedMessage("Profile saved.");
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8faf6] font-['Montserrat'] text-[#24372d]">
      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-0 px-4 md:px-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <AccountSidebar onLogout={handleLogout} />

        <main className="min-w-0 space-y-6 py-6 lg:px-6">
          

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_320px]">
            <form
              onSubmit={handleSave}
              className="rounded-[1.35rem] border border-[#e1e7dc] bg-white p-5 shadow-[0_18px_45px_rgba(15,77,46,0.06)] md:p-6"
            >
              <div className="border-b border-[#eef2ea] pb-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[#6c786f]">Details</p>
                <h2 className="mt-1 font-['Playfair_Display'] text-2xl leading-tight text-[#0f4d2e]">Account Information</h2>
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <TextField
                  icon={<UserRound size={16} />}
                  label="Username"
                  value={profile.username}
                  onChange={(event) => handleFieldChange("username", event.target.value)}
                  placeholder="Your username"
                />
                <TextField
                  icon={<UserRound size={16} />}
                  label="Name"
                  value={profile.name}
                  onChange={(event) => handleFieldChange("name", event.target.value)}
                  placeholder="Full name"
                />
                <TextField
                  icon={<Mail size={16} />}
                  label="Email"
                  type="email"
                  value={profile.email}
                  onChange={(event) => handleFieldChange("email", event.target.value)}
                  placeholder="your@email.com"
                />
                <TextField
                  icon={<Phone size={16} />}
                  label="Phone Number"
                  value={profile.phone}
                  onChange={(event) => handleFieldChange("phone", event.target.value)}
                  placeholder="Mobile number"
                />
                <TextField
                  icon={<CalendarDays size={16} />}
                  label="Date of Birth"
                  type="date"
                  value={profile.birthDate}
                  onChange={(event) => handleFieldChange("birthDate", event.target.value)}
                />

                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#6c786f]">Gender</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-[#405145]">
                    {[
                      { label: "Male", value: "Male" },
                      { label: "Female", value: "Female" },
                      { label: "Other", value: "Other" }
                    ].map((option) => (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-center justify-center rounded-2xl border px-3 py-3 font-medium transition ${
                          profile.gender === option.value
                            ? "border-[#0f6b45] bg-[#e8f3ea] text-[#0f4d2e]"
                            : "border-[#dce5d8] bg-white text-[#405145] hover:border-[#b7ccb5]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="gender"
                          value={option.value}
                          checked={profile.gender === option.value}
                          onChange={(event) => handleFieldChange("gender", event.target.value)}
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#eef2ea] pt-5">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0f4d2e] px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-sm transition hover:bg-[#173d2b]"
                >
                  <Save size={15} />
                  Save Profile
                </button>
                {savedMessage ? <p className="text-sm font-medium text-emerald-700">{savedMessage}</p> : null}
              </div>
            </form>

            <aside className="space-y-5">
              <div className="rounded-[1.35rem] border border-[#e1e7dc] bg-[#f7f5f0] p-5 shadow-sm">
                <div className="mx-auto h-32 w-32 overflow-hidden rounded-full border border-[#dce5d8] bg-white shadow-sm">
                  {profile.image ? (
                    <img src={profile.image} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[#9aa69a]">
                      <UserRound size={44} />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#b9d7c3] bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#0f6b45] shadow-sm transition hover:border-[#0f6b45] hover:bg-[#f1faf3]"
                >
                  <Camera size={15} />
                  Select Image
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  onChange={handleImageChange}
                  className="hidden"
                />

                <div className="mt-4 rounded-2xl border border-[#e1e7dc] bg-white px-4 py-3 text-sm leading-6 text-[#5e6f65]">
                  <p>Maximum file size: 1 MB</p>
                  <p>Allowed files: JPG, JPEG, PNG</p>
                </div>
                {imageError ? <p className="mt-3 text-sm leading-6 text-red-600">{imageError}</p> : null}
              </div>

              <ProfileSummary profile={profile} />
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}
