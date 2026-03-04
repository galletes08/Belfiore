import { useState, useEffect, useRef } from 'react';
import {
  apiProducts,
  apiCreateProduct,
  apiUpdateProduct,
  apiDeleteProduct,
  getImageUrl,
} from '../api/client';

const CATEGORY_OPTIONS = ['Aquaponics', 'Aloe Hybrids'];
const AQUAPONICS_NAME_OPTIONS = ['Lollo Bionda', 'Butterhead', 'Romaine'];
const TAG_OPTIONS = ['White', 'Green', 'Red', 'Clumps', 'Bundles'];
const ALOE_CATEGORY = 'Aloe Hybrids';
const AQUAPONICS_CATEGORY = 'Aquaponics';

const initialForm = {
  category: ALOE_CATEGORY,
  name: '',
  tag: 'Green',
  price: '',
  stock: '1',
  description: '',
  imageFile: null,
};

export default function AdminInventory() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [existingImageUrl, setExistingImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
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
      tag: product.tag || 'Green',
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
            name: AQUAPONICS_NAME_OPTIONS.includes(prev.name) ? prev.name : '',
            tag: '',
          };
        }
        return {
          ...prev,
          category: value,
          tag: prev.tag || 'Green',
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
      const name = form.name.trim();
      const tag = category === AQUAPONICS_CATEGORY ? '' : form.tag;
      const price = parseFloat(form.price);
      const stock = parseInt(form.stock, 10);
      const description = form.description.trim();

      if (!category) {
        setError('Category is required');
        setSaving(false);
        return;
      }
      if (!name) {
        setError('Product name is required');
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

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">Inventory</h1>
        <button
          type="button"
          onClick={openAdd}
          className="px-4 py-2.5 bg-[#2d5a45] text-white rounded-lg font-medium hover:bg-[#1a3d2e] transition-colors"
        >
          Add Product
        </button>
      </div>

      {error && !modalOpen && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading products...</div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No products yet. Click &quot;Add Product&quot; to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="py-4 px-5 font-semibold text-gray-600 text-sm">Image</th>
                  <th className="py-4 px-5 font-semibold text-gray-600 text-sm">Product Name</th>
                  <th className="py-4 px-5 font-semibold text-gray-600 text-sm">Tag / Type</th>
                  <th className="py-4 px-5 font-semibold text-gray-600 text-sm">Price</th>
                  <th className="py-4 px-5 font-semibold text-gray-600 text-sm">Stock</th>
                  <th className="py-4 px-5 font-semibold text-gray-600 text-sm max-w-[200px]">Description</th>
                  <th className="py-4 px-5 font-semibold text-gray-600 text-sm text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="py-3 px-5">
                      {p.imageUrl ? (
                        <img
                          src={getImageUrl(p.imageUrl)}
                          alt=""
                          className="w-12 h-12 object-cover rounded-lg border border-gray-200"
                        />
                      ) : (
                        <span className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-lg text-gray-400 text-xl">
                          P
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-5 font-medium text-gray-900">{p.name}</td>
                    <td className="py-3 px-5">
                      <span className="inline-flex px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                        {p.tag || '-'}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-gray-700">${Number(p.price).toFixed(2)}</td>
                    <td className="py-3 px-5">
                      <span
                        className={
                          p.stock <= 3
                            ? 'font-medium text-amber-600'
                            : 'text-gray-700'
                        }
                      >
                        {p.stock}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-gray-600 text-sm max-w-[200px] truncate">
                      {p.description || '-'}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="text-[#2d5a45] hover:underline font-medium text-sm mr-3"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p)}
                        className="text-red-600 hover:underline font-medium text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">
                {editingId ? 'Edit Product' : 'Add Product'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) => handleChange('category', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2d5a45]/30 focus:border-[#2d5a45]"
                  required
                >
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product Name
                </label>
                {form.category === AQUAPONICS_CATEGORY ? (
                  <select
                    value={form.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2d5a45]/30 focus:border-[#2d5a45]"
                    required
                  >
                    <option value="">Select aquaponics type</option>
                    {AQUAPONICS_NAME_OPTIONS.map((nameOption) => (
                      <option key={nameOption} value={nameOption}>
                        {nameOption}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="e.g. White Echeveria A"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2d5a45]/30 focus:border-[#2d5a45]"
                    required
                  />
                )}
              </div>

              {form.category !== AQUAPONICS_CATEGORY && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tag / Type
                  </label>
                  <select
                    value={form.tag}
                    onChange={(e) => handleChange('tag', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2d5a45]/30 focus:border-[#2d5a45]"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => handleChange('price', e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2d5a45]/30 focus:border-[#2d5a45]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={(e) => handleChange('stock', e.target.value)}
                    placeholder="Available quantity"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2d5a45]/30 focus:border-[#2d5a45]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Product description"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2d5a45]/30 focus:border-[#2d5a45] resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Image
                </label>
                {existingImageUrl && !form.imageFile && (
                  <div className="mb-2">
                    <img
                      src={existingImageUrl}
                      alt="Current"
                      className="h-20 w-20 object-cover rounded-lg border border-gray-200"
                    />
                    <p className="text-xs text-gray-500 mt-1">Current image. Choose a new file to replace.</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file) selectedFileRef.current = file;
                    handleChange('imageFile', file);
                  }}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-[#2d5a45] text-white rounded-lg font-medium hover:bg-[#1a3d2e] disabled:opacity-70"
                >
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
