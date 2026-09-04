import { useEffect, useMemo, useRef, useState } from 'react';
import {
  apiCreateProduct,
  apiCreateProductsBulk,
  apiDeleteProduct,
  apiProducts,
  apiUpdateProduct,
  getImageUrl,
} from '../api/client';

const CATEGORY_OPTIONS = ['Aquaponics', 'Aloe Hybrids'];
const TAG_OPTIONS = ['White', 'Green', 'Red'];
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
};
const PRODUCTS_PER_PAGE = 20;

const initialForm = {
  category: ALOE_CATEGORY,
  name: '',
  tag: 'Green',
  price: '',
  stock: '1',
  description: '',
  imageFile: null,
  imageFiles: [],
};

function normalizeTagFilter(tag, category) {
  const normalizedTag = String(tag || '').trim().toLowerCase();
  const normalizedCategory = String(category || '').trim().toLowerCase();

  if (normalizedTag === 'others') return AQUAPONICS_TAG;
  if (!normalizedTag && normalizedCategory === AQUAPONICS_CATEGORY.toLowerCase()) return AQUAPONICS_TAG;
  if (normalizedCategory === AQUAPONICS_CATEGORY.toLowerCase()) return AQUAPONICS_TAG;
  return normalizedTag || '';
}

function normalizeFormTag(tag) {
  const normalizedTag = String(tag || '').trim().toLowerCase();
  return TAG_OPTIONS.find((option) => option.toLowerCase() === normalizedTag) || 'Green';
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
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const selectedFileRef = useRef(null);
  const selectedFilesRef = useRef([]);

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
    selectedFilesRef.current = [];
    if (fileInputRef.current) fileInputRef.current.value = '';
    setModalOpen(true);
  };

  const openEdit = (product) => {
    const category = product.category || ALOE_CATEGORY;
    setEditingId(product.id);
    setForm({
      category,
      name: product.name || '',
      tag: category === AQUAPONICS_CATEGORY ? AQUAPONICS_TAG : normalizeFormTag(product.tag),
      price: product.price != null ? String(product.price) : '',
      stock: category === ALOE_CATEGORY ? '1' : (product.stock != null ? String(product.stock) : '0'),
      description: product.description || '',
      imageFile: null,
      imageFiles: [],
    });
    setExistingImageUrl(product.imageUrl ? getImageUrl(product.imageUrl) : '');
    setError('');
    selectedFileRef.current = null;
    selectedFilesRef.current = [];
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
    selectedFilesRef.current = [];
  };

  const handleChange = (field, value) => {
    if (field === 'category') {
      selectedFileRef.current = null;
      selectedFilesRef.current = [];
      if (fileInputRef.current) fileInputRef.current.value = '';
    }

    setForm((prev) => {
      if (field === 'category') {
        if (value === AQUAPONICS_CATEGORY) {
          return {
            ...prev,
            category: value,
            tag: AQUAPONICS_TAG,
            imageFile: null,
            imageFiles: [],
          };
        }

        return {
          ...prev,
          category: value,
          tag: TAG_OPTIONS.includes(prev.tag) ? prev.tag : 'Green',
          stock: '1',
          imageFile: null,
          imageFiles: [],
        };
      }

      return { ...prev, [field]: value };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const category = form.category;
      const isBulkAloeAdd = category === ALOE_CATEGORY && !editingId;
      const tag = category === AQUAPONICS_CATEGORY ? AQUAPONICS_TAG : form.tag;
      const name = (isBulkAloeAdd ? tag : form.name).trim();
      const price = parseFloat(form.price);
      const stock = category === ALOE_CATEGORY ? 1 : parseInt(form.stock, 10);
      const description = form.description.trim();
      const bulkFiles = selectedFilesRef.current.length ? selectedFilesRef.current : form.imageFiles;
      const fileToUpload = selectedFileRef.current || form.imageFile;

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
      if (isBulkAloeAdd && !bulkFiles.length) {
        setError('Select at least one Aloe image. Each image becomes a separate product.');
        setSaving(false);
        return;
      }
      if (isBulkAloeAdd && bulkFiles.length > 50) {
        setError('You can add up to 50 Aloe products at a time.');
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

      if (editingId) {
        if (fileToUpload) formData.append('image', fileToUpload);
        await apiUpdateProduct(editingId, formData);
      } else if (isBulkAloeAdd) {
        bulkFiles.forEach((file) => formData.append('images', file));
        await apiCreateProductsBulk(formData);
      } else {
        if (fileToUpload) formData.append('image', fileToUpload);
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

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE;
    return filteredProducts.slice(startIndex, startIndex + PRODUCTS_PER_PAGE);
  }, [currentPage, filteredProducts]);
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const selectTagFilter = (filter) => {
    setSelectedTagFilter(filter);
    setCurrentPage(1);
  };

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
  const isBulkAloeAdd = !editingId && form.category === ALOE_CATEGORY;
  const selectedImageCount = form.imageFiles.length;
  const bulkSubmitLabel = selectedImageCount
    ? `Add ${selectedImageCount} Product${selectedImageCount === 1 ? '' : 's'}`
    : 'Add Products';
  const bulkSavingLabel = `Adding ${selectedImageCount} product${selectedImageCount === 1 ? '' : 's'}...`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Products & stock</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Inventory Management</h1>
          <p className="mt-2 text-sm text-slate-500">Manage products, filter by tag or type, and monitor available stock.</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-sm font-medium text-slate-600">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Filter by Tag / Type</span>
            <select
              value={selectedTagFilter}
              onChange={(e) => selectTagFilter(e.target.value)}
              className="min-w-52 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
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
            className="rounded-xl bg-[#1f5a43] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#174b37]"
          >
            Add Product
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Products</p>
          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{inventoryStats.all.count}</p>
          <p className="mt-2 text-xs text-slate-500">Total products in inventory</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Stock</p>
          <p className="mt-3 text-2xl font-bold tracking-tight text-emerald-700">{inventoryStats.all.stock}</p>
          <p className="mt-2 text-xs text-slate-500">All available units</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Selected View</p>
          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{filteredProducts.length}</p>
          <p className="mt-2 text-xs text-slate-500">{TAG_LABELS[selectedTagFilter] || 'Current filter'}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Visible Stock</p>
          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{visibleStock}</p>
          <p className="mt-2 text-xs text-slate-500">Stock within the selected filter</p>
        </article>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {TAG_ORDER.map((filter) => {
            const isActive = selectedTagFilter === filter;
            const metrics = inventoryStats[filter] || { count: 0, stock: 0 };

            return (
              <button
                key={filter}
                type="button"
                onClick={() => selectTagFilter(filter)}
                className={"rounded-xl px-3 py-2 text-sm transition " + (
                  isActive
                    ? "bg-[#1f5a43] text-white shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                )}
              >
                {TAG_LABELS[filter] || filter}
                <span className="ml-1 opacity-80">{metrics.count} / {metrics.stock}</span>
              </button>
            );
          })}
        </div>
      </section>
        {error && !modalOpen ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
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
            <>
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
                  {paginatedProducts.map((p) => {
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

              <nav
                className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                aria-label="Inventory pagination"
              >
                <p className="text-sm text-gray-500">
                  Showing {(currentPage - 1) * PRODUCTS_PER_PAGE + 1}–
                  {Math.min(currentPage * PRODUCTS_PER_PAGE, filteredProducts.length)} of{' '}
                  {filteredProducts.length}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                    className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>

                  {pageNumbers.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      aria-label={`Go to page ${page}`}
                      aria-current={currentPage === page ? 'page' : undefined}
                      className={`h-9 min-w-9 rounded-xl border px-3 text-sm font-semibold transition ${
                        currentPage === page
                          ? 'border-[#0f4d2e] bg-[#0f4d2e] text-white shadow-sm'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300 hover:text-emerald-700'
                      }`}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage === totalPages}
                    className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </nav>
            </>
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
                  {editingId ? 'Edit Product' : isBulkAloeAdd ? 'Add Aloe Products' : 'Add Product'}
                </h2>
                {isBulkAloeAdd ? (
                  <p className="mt-1 text-sm text-gray-500">
                    Select multiple images to create separate products under one tag / type.
                  </p>
                ) : null}
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
                      min={form.category === ALOE_CATEGORY ? "1" : "0"}
                      value={form.stock}
                      onChange={(e) => handleChange('stock', e.target.value)}
                      readOnly={form.category === ALOE_CATEGORY}
                      aria-describedby="stock-help"
                      placeholder="Available quantity"
                      className={"w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-[#2d5a45] focus:ring-2 focus:ring-[#2d5a45]/30 " + (form.category === ALOE_CATEGORY ? "cursor-not-allowed bg-gray-100 text-gray-500" : "")}
                      required
                    />
                    <p id="stock-help" className="mt-1 text-xs text-gray-500">
                      {form.category === ALOE_CATEGORY
                        ? "Aloe Hybrids are limited to one stock per product."
                        : "Enter the available Aquaponics quantity."}
                    </p>
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {isBulkAloeAdd ? 'Images' : 'Image'}
                  </label>
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
                    multiple={isBulkAloeAdd}
                    required={isBulkAloeAdd}
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (isBulkAloeAdd) {
                        selectedFilesRef.current = files;
                        selectedFileRef.current = null;
                        setForm((previous) => ({ ...previous, imageFile: null, imageFiles: files }));
                        return;
                      }

                      const file = files[0] ?? null;
                      selectedFileRef.current = file;
                      selectedFilesRef.current = [];
                      setForm((previous) => ({ ...previous, imageFile: file, imageFiles: [] }));
                    }}
                    className="w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-gray-700 hover:file:bg-gray-200"
                  />
                  {isBulkAloeAdd ? (
                    <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                      <p className="text-xs font-semibold text-emerald-800">
                        {selectedImageCount
                          ? `${selectedImageCount} separate product${selectedImageCount === 1 ? '' : 's'} will be created`
                          : 'Choose up to 50 images (maximum 5 MB each)'}
                      </p>
                      {selectedImageCount ? (
                        <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs text-gray-600">
                          {form.imageFiles.map((file, index) => (
                            <li key={`${file.name}-${file.lastModified}-${index}`} className="truncate">
                              {index + 1}. {file.name}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
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
                    {saving
                      ? isBulkAloeAdd
                        ? bulkSavingLabel
                        : 'Saving...'
                      : editingId
                        ? 'Update'
                        : isBulkAloeAdd
                          ? bulkSubmitLabel
                          : 'Add Product'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
    </div>
  );
}
