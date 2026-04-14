import { useEffect, useMemo, useRef, useState } from 'react';
import {
  apiCreateProduct,
  apiDeleteProduct,
  apiProducts,
  apiUpdateProduct,
  getImageUrl,
} from '../api/client';

const CATEGORY_OPTIONS = ['Aquaponics', 'Aloe Hybrids'];
const TAG_OPTIONS = ['White', 'Green', 'Red', 'Clumps', 'Bundles'];
const ALOE_CATEGORY = 'Aloe Hybrids';
const AQUAPONICS_CATEGORY = 'Aquaponics';
const AQUAPONICS_TAG = 'aquaponics';
const TAG_ORDER = ['all', AQUAPONICS_TAG, ...TAG_OPTIONS.map((tag) => tag.toLowerCase())];
const TAG_LABELS = {
  all: 'All Products',
  [AQUAPONICS_TAG]: 'Aquaponics',
  white: 'White',
  green: 'Green',
  red: 'Red',
  clumps: 'Clumps',
  bundles: 'Bundles',
};

const initialForm = {
  category: ALOE_CATEGORY,
  name: '',
  tag: 'Green',
  price: '',
  stock: '1',
  description: '',
  imageFile: null,
};

function normalizeTagFilter(tag, category) {
  const normalizedTag = String(tag || '').trim().toLowerCase();
  const normalizedCategory = String(category || '').trim().toLowerCase();

  if (normalizedTag === 'others') return AQUAPONICS_TAG;
  if (!normalizedTag && normalizedCategory === AQUAPONICS_CATEGORY.toLowerCase()) return AQUAPONICS_TAG;
  if (normalizedCategory === AQUAPONICS_CATEGORY.toLowerCase()) return AQUAPONICS_TAG;
  return normalizedTag || '';
}

export default function AdminInventory() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [existingImageUrl, setExistingImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedTagFilter, setSelectedTagFilter] = useState('all');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const selectedFileRef = useRef(null);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await apiProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(initialForm);
    setExistingImageUrl('');
    setError('');
    selectedFileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
    setModalOpen(true);
  };

  const openEdit = (product) => {
    const category = product.category || ALOE_CATEGORY;
    setEditingId(product.id);
    setForm({
      category,
      name: product.name || '',
      tag: category === AQUAPONICS_CATEGORY ? AQUAPONICS_TAG : product.tag || 'Green',
      price: product.price != null ? String(product.price) : '',
      stock: product.stock != null ? String(product.stock) : '1',
      description: product.description || '',
      imageFile: null,
    });
    setExistingImageUrl(product.imageUrl ? getImageUrl(product.imageUrl) : '');
    setError('');
    selectedFileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(initialForm);
    setExistingImageUrl('');
    setError('');
    selectedFileRef.current = null;
  };

  const handleChange = (field, value) => {
    setForm((prev) => {
      if (field === 'category') {
        if (value === AQUAPONICS_CATEGORY) {
          return {
            ...prev,
            category: value,
            tag: AQUAPONICS_TAG,
          };
        }

        return {
          ...prev,
          category: value,
          tag: TAG_OPTIONS.includes(prev.tag) ? prev.tag : 'Green',
        };
      }

      return { ...prev, [field]: value };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const fileToUpload = selectedFileRef.current || form.imageFile;

    try {
      const category = form.category;
      const tag = category === AQUAPONICS_CATEGORY ? AQUAPONICS_TAG : form.tag;
      const name = (category === ALOE_CATEGORY && !editingId ? tag : form.name).trim();
      const price = parseFloat(form.price);
      const stock = parseInt(form.stock, 10);
      const description = form.description.trim();

      if (!category) {
        setError('Category is required');
        setSaving(false);
        return;
      }
      if (!name) {
        setError(category === ALOE_CATEGORY ? 'Tag / Type is required' : 'Product name is required');
        setSaving(false);
        return;
      }
      if (isNaN(price) || price < 0) {
        setError('Enter a valid price');
        setSaving(false);
        return;
      }
      if (isNaN(stock) || stock < 0) {
        setError('Stock must be 0 or more');
        setSaving(false);
        return;
      }

      const formData = new FormData();
      formData.append('category', category);
      formData.append('name', name);
      formData.append('tag', tag);
      formData.append('price', String(price));
      formData.append('stock', String(stock));
      formData.append('description', description);
      if (fileToUpload) formData.append('image', fileToUpload);

      if (editingId) {
        await apiUpdateProduct(editingId, formData);
      } else {
        await apiCreateProduct(formData);
      }

      closeModal();
      loadProducts();
    } catch (err) {
      setError(err.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product) => {
    if (!window.confirm(`Delete "${product.name}"?`)) return;
    try {
      await apiDeleteProduct(product.id);
      loadProducts();
    } catch (err) {
      setError(err.message || 'Failed to delete');
    }
  };

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        if (selectedTagFilter === 'all') return true;
        return normalizeTagFilter(product.tag, product.category) === selectedTagFilter;
      }),
    [products, selectedTagFilter]
  );

  const inventoryStats = useMemo(() => {
    const summary = TAG_ORDER.reduce((acc, key) => {
      acc[key] = { count: 0, stock: 0 };
      return acc;
    }, {});

    for (const product of products) {
      const key = normalizeTagFilter(product.tag, product.category) || 'all';
      const stock = Number(product.stock) || 0;

      if (!summary[key]) summary[key] = { count: 0, stock: 0 };

      summary[key].count += 1;
      summary[key].stock += stock;
      summary.all.count += 1;
      summary.all.stock += stock;
    }

    return summary;
  }, [products]);

  const visibleStock = filteredProducts.reduce((sum, product) => sum + (Number(product.stock) || 0), 0);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(220,252,231,0.9),_transparent_28%),linear-gradient(180deg,#f5faf7_0%,#eef5f1_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-3xl border border-white/80 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="bg-[linear-gradient(135deg,#0f4d2e_0%,#137a46_42%,#ecfdf5_100%)] px-6 py-6 text-white sm:px-8 sm:py-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-100/90">Inventory Dashboard</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Track stock by tag and type</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-50/90 sm:text-base">
                  Use the filter to narrow the view, then watch the summary cards update with current stock totals.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="text-sm font-medium text-emerald-50/90">
                  <span className="mb-1 block text-xs uppercase tracking-[0.22em] text-emerald-100/80">Filter by Tag / Type</span>
                  <select
                    value={selectedTagFilter}
                    onChange={(e) => setSelectedTagFilter(e.target.value)}
                    className="min-w-52 rounded-2xl border border-white/20 bg-white px-4 py-3 text-sm font-medium text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-200/40"
                  >
                    {TAG_ORDER.map((filter) => (
                      <option key={filter} value={filter}>
                        {TAG_LABELS[filter] || filter}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={openAdd}
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-[#0f4d2e] shadow-sm transition hover:scale-[1.01] hover:bg-emerald-50"
                >
                  Add Product
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-b border-gray-100 bg-white px-6 py-5 sm:grid-cols-2 xl:grid-cols-4 sm:px-8">
            <article className="rounded-2xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf8_100%)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Products</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{inventoryStats.all.count}</p>
              <p className="mt-1 text-sm text-gray-500">Total products in inventory</p>
            </article>
            <article className="rounded-2xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf8_100%)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Total Stock</p>
              <p className="mt-2 text-3xl font-bold text-emerald-700">{inventoryStats.all.stock}</p>
              <p className="mt-1 text-sm text-gray-500">All available units</p>
            </article>
            <article className="rounded-2xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf8_100%)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Selected View</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{filteredProducts.length}</p>
              <p className="mt-1 text-sm text-gray-500">{TAG_LABELS[selectedTagFilter] || 'Current filter'}</p>
            </article>
            <article className="rounded-2xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf8_100%)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Visible Stock</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{visibleStock}</p>
              <p className="mt-1 text-sm text-gray-500">Stock within the selected filter</p>
            </article>
          </div>

          <div className="bg-white px-6 py-5 sm:px-8">
            <div className="flex flex-wrap gap-2">
              {TAG_ORDER.map((filter) => {
                const isActive = selectedTagFilter === filter;
                const metrics = inventoryStats[filter] || { count: 0, stock: 0 };

                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setSelectedTagFilter(filter)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'border-[#0f4d2e] bg-[#0f4d2e] text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300 hover:text-emerald-700'
                    }`}
                  >
                    {TAG_LABELS[filter] || filter}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                        isActive ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {metrics.count} / {metrics.stock}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {error && !modalOpen ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-3xl border border-white/80 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading products...</div>
          ) : products.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              No products yet. Click &quot;Add Product&quot; to create one.
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              No products match the selected tag / type.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    <th className="py-4 px-5 text-sm font-semibold text-gray-600">Image</th>
                    <th className="py-4 px-5 text-sm font-semibold text-gray-600">Product Name</th>
                    <th className="py-4 px-5 text-sm font-semibold text-gray-600">Tag / Type</th>
                    <th className="py-4 px-5 text-sm font-semibold text-gray-600">Price</th>
                    <th className="py-4 px-5 text-sm font-semibold text-gray-600">Stock</th>
                    <th className="max-w-[200px] py-4 px-5 text-sm font-semibold text-gray-600">Description</th>
                    <th className="py-4 px-5 text-right text-sm font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => {
                    const rowTagKey = normalizeTagFilter(p.tag, p.category) || 'all';
                    const rowTagLabel = TAG_LABELS[rowTagKey] || String(p.tag || '-');

                    return (
                      <tr
                        key={p.id}
                        className="border-b border-gray-100 transition-colors hover:bg-emerald-50/40"
                      >
                        <td className="py-3 px-5">
                          {p.imageUrl ? (
                            <img
                              src={getImageUrl(p.imageUrl)}
                              alt=""
                              className="h-12 w-12 rounded-xl border border-gray-200 object-cover"
                            />
                          ) : (
                            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-xl text-gray-400">
                              P
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-5 font-medium text-gray-900">{p.name}</td>
                        <td className="py-3 px-5">
                          <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                            {rowTagLabel}
                          </span>
                        </td>
                        <td className="py-3 px-5 text-gray-700">PHP {Number(p.price).toFixed(2)}</td>
                        <td className="py-3 px-5">
                          <span className={p.stock <= 3 ? 'font-medium text-amber-600' : 'text-gray-700'}>
                            {p.stock}
                          </span>
                        </td>
                        <td className="max-w-[200px] py-3 px-5 text-sm truncate text-gray-600">
                          {p.description || '-'}
                        </td>
                        <td className="py-3 px-5 text-right">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="mr-3 text-sm font-medium text-[#2d5a45] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            className="text-sm font-medium text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {modalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => e.target === e.currentTarget && closeModal()}
          >
            <div
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-gray-100 p-6">
                <h2 className="text-lg font-bold text-gray-800">
                  {editingId ? 'Edit Product' : 'Add Product'}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 p-6">
                {error ? <p className="rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p> : null}

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => handleChange('category', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-[#2d5a45] focus:ring-2 focus:ring-[#2d5a45]/30"
                    required
                  >
                    {CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                {form.category === AQUAPONICS_CATEGORY ? (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Product Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      placeholder="e.g. Lollo Bionda Lettuce"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-[#2d5a45] focus:ring-2 focus:ring-[#2d5a45]/30"
                      required
                    />
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Tag / Type</label>
                    <select
                      value={form.tag}
                      onChange={(e) => handleChange('tag', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-[#2d5a45] focus:ring-2 focus:ring-[#2d5a45]/30"
                    >
                      {TAG_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Price</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.price}
                      onChange={(e) => handleChange('price', e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-[#2d5a45] focus:ring-2 focus:ring-[#2d5a45]/30"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Stock</label>
                    <input
                      type="number"
                      min="0"
                      value={form.stock}
                      onChange={(e) => handleChange('stock', e.target.value)}
                      placeholder="Available quantity"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-[#2d5a45] focus:ring-2 focus:ring-[#2d5a45]/30"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Product description"
                    rows={3}
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-[#2d5a45] focus:ring-2 focus:ring-[#2d5a45]/30"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Image</label>
                  {existingImageUrl && !form.imageFile ? (
                    <div className="mb-2">
                      <img
                        src={existingImageUrl}
                        alt="Current"
                        className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
                      />
                      <p className="mt-1 text-xs text-gray-500">Current image. Choose a new file to replace.</p>
                    </div>
                  ) : null}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (file) selectedFileRef.current = file;
                      handleChange('imageFile', file);
                    }}
                    className="w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-gray-700 hover:file:bg-gray-200"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-lg bg-[#2d5a45] py-2.5 font-medium text-white hover:bg-[#1a3d2e] disabled:opacity-70"
                  >
                    {saving ? 'Saving...' : editingId ? 'Update' : 'Add Product'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
