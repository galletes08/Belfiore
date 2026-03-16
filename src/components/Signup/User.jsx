import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UserRound } from "lucide-react";
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
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8faf9_0%,#f2f6f4_45%,#eef3f1_100%)]">
      <div className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-lime-100/40 blur-3xl" />

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 px-4 py-0 md:px-6 lg:grid-cols-[260px_1fr]">
        <aside className="self-start rounded-none border border-white/80 bg-white/90 p-5 shadow-sm backdrop-blur lg:sticky lg:top-0 lg:z-40 lg:h-[100dvh] lg:overflow-y-auto">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
              <UserRound size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Account</p>
              <h2 className="text-lg font-bold text-gray-900">User Panel</h2>
            </div>
          </div>

          <nav className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-1">
            <Link to="/dashboard" className="rounded-lg border border-gray-200 px-3 py-2 text-left text-gray-700 hover:border-emerald-300 hover:text-emerald-700">
              Dashboard
            </Link>
            <Link to="/orders" className="rounded-lg border border-gray-200 px-3 py-2 text-left text-gray-700 hover:border-emerald-300 hover:text-emerald-700">
              Orders
            </Link>
            <Link to="/profile" className="rounded-lg bg-emerald-700 px-3 py-2 text-left font-semibold text-white">
              Profile
            </Link>
            <Link
              to="/login"
              onClick={handleLogout}
              className="col-span-2 rounded-lg border border-red-200 px-3 py-2 text-left text-red-600 hover:bg-red-50 lg:col-span-1"
            >
              Logout
            </Link>
          </nav>
        </aside>

        <main className="space-y-5 py-6">
          <section className="rounded-2xl border border-white/80 bg-white/95 p-6 shadow-sm backdrop-blur md:p-8">
            <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
            <p className="mt-1 text-sm text-gray-600">Manage and protect your account</p>

            <form onSubmit={handleSave} className="mt-6 border-t border-gray-200 pt-6">
              <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
                <div className="space-y-5 lg:border-r lg:border-gray-200 lg:pr-8">
                  <div className="grid items-center gap-2 sm:grid-cols-[140px_1fr]">
                    <label className="text-sm text-gray-600">Username</label>
                    <input
                      type="text"
                      value={profile.username}
                      onChange={(event) => handleFieldChange("username", event.target.value)}
                      className="w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    />
                  </div>

                  <div className="grid items-center gap-2 sm:grid-cols-[140px_1fr]">
                    <label className="text-sm text-gray-600">Name</label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={(event) => handleFieldChange("name", event.target.value)}
                      className="w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    />
                  </div>

                  <div className="grid items-center gap-2 sm:grid-cols-[140px_1fr]">
                    <label className="text-sm text-gray-600">Email</label>
                    <input
                      type="email"
                      value={profile.email}
                      onChange={(event) => handleFieldChange("email", event.target.value)}
                      className="w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    />
                  </div>

                  <div className="grid items-center gap-2 sm:grid-cols-[140px_1fr]">
                    <label className="text-sm text-gray-600">Phone Number</label>
                    <input
                      type="text"
                      value={profile.phone}
                      onChange={(event) => handleFieldChange("phone", event.target.value)}
                      className="w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    />
                  </div>

                  <div className="grid items-center gap-2 sm:grid-cols-[140px_1fr]">
                    <label className="text-sm text-gray-600">Gender</label>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-800">
                      {[
                        { label: "Male", value: "Male" },
                        { label: "Female", value: "Female" },
                        { label: "Other", value: "Other" }
                      ].map((option) => (
                        <label key={option.value} className="inline-flex items-center gap-2">
                          <input
                            type="radio"
                            name="gender"
                            value={option.value}
                            checked={profile.gender === option.value}
                            onChange={(event) => handleFieldChange("gender", event.target.value)}
                            className="h-4 w-4 accent-orange-500"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid items-center gap-2 sm:grid-cols-[140px_1fr]">
                    <label className="text-sm text-gray-600">Date of birth</label>
                    <input
                      type="date"
                      value={profile.birthDate}
                      onChange={(event) => handleFieldChange("birthDate", event.target.value)}
                      className="w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      className="rounded-md bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
                    >
                      Save
                    </button>
                    {savedMessage && <p className="mt-2 text-sm text-emerald-700">{savedMessage}</p>}
                  </div>
                </div>

                <div className="mx-auto w-full max-w-[220px]">
                  <div className="mx-auto h-28 w-28 overflow-hidden rounded-full border border-gray-300 bg-gray-100">
                    {profile.image ? (
                      <img src={profile.image} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-400">
                        <UserRound size={40} />
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 w-full rounded-sm border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Select Image
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                    onChange={handleImageChange}
                    className="hidden"
                  />

                  <p className="mt-4 text-sm text-gray-500">File size: maximum 1 MB</p>
                  <p className="text-sm text-gray-500">File extension: .JPEG, .PNG</p>
                  {imageError && <p className="mt-2 text-sm text-red-600">{imageError}</p>}
                </div>
              </div>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
