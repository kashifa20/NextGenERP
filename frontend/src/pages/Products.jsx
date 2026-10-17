import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../api';

const PRODUCTS_URL = '/products/';
const EMPTY_PRODUCT_FORM = {
  name: '',
  sku: '',
  price: '',
  stock_quantity: '',
  reorder_level: '',
  category_id: '',
};

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-IN');

async function requestProducts() {
  const response = await apiFetch(PRODUCTS_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Products could not be loaded (HTTP ${response.status}).`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('The products service returned an unexpected response.');
  }
  return data;
}

function getErrorMessage(requestError) {
  return requestError instanceof Error
    ? requestError.message
    : 'Unable to connect to the products service.';
}

function validateProductForm(form) {
  const errors = {};
  const requiredFields = [
    ['name', 'Product name'],
    ['sku', 'SKU'],
    ['price', 'Price'],
    ['stock_quantity', 'Stock quantity'],
    ['reorder_level', 'Reorder level'],
  ];

  for (const [field, label] of requiredFields) {
    if (!form[field].trim()) errors[field] = `${label} is required.`;
  }

  if (form.price.trim() && (!Number.isFinite(Number(form.price)) || Number(form.price) < 0)) {
    errors.price = 'Enter a valid price of 0 or more.';
  }

  for (const [field, label] of [
    ['stock_quantity', 'Stock quantity'],
    ['reorder_level', 'Reorder level'],
    ['category_id', 'Category ID'],
  ]) {
    const value = form[field].trim();
    if (value && (!Number.isInteger(Number(value)) || Number(value) < 0)) {
      errors[field] = `${label} must be a whole number of 0 or more.`;
    }
  }

  return errors;
}

function getStockStatus(product) {
  const quantity = Number(product.stock_quantity);
  const reorderLevel = Number(product.reorder_level);

  if (quantity === 0) return { label: 'Out of Stock', className: 'bg-red-50 text-red-800 ring-red-200' };
  if (quantity <= reorderLevel) return { label: 'Low Stock', className: 'bg-amber-50 text-amber-900 ring-amber-200' };
  return { label: 'In Stock', className: 'bg-teal-50 text-teal-800 ring-teal-200' };
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isViewMode, setIsViewMode] = useState(false);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState(null);
  const dialogRef = useRef(null);
  const productRequestIdRef = useRef(0);

  async function loadProducts(isRefresh = false) {
    const requestId = ++productRequestIdRef.current;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const data = await requestProducts();
      if (requestId === productRequestIdRef.current) setProducts(data);
    } catch (requestError) {
      if (requestId === productRequestIdRef.current) setError(getErrorMessage(requestError));
    } finally {
      if (requestId === productRequestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isCreateOpen && !dialog.open) dialog.showModal();
    if (!isCreateOpen && dialog.open) dialog.close();
  }, [isCreateOpen]);

  useEffect(() => {
    let active = true;
    const requestId = ++productRequestIdRef.current;
    requestProducts()
      .then((data) => {
        if (active && requestId === productRequestIdRef.current) setProducts(data);
      })
      .catch((requestError) => {
        if (active && requestId === productRequestIdRef.current) setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active && requestId === productRequestIdRef.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      [product.name, product.sku].some((value) => String(value ?? '').toLocaleLowerCase().includes(query)),
    );
  }, [products, search]);

  function openCreateForm() {
    setProductForm(EMPTY_PRODUCT_FORM);
    setFormErrors({});
    setCreateError('');
    setSuccessMessage('');
    setIsEditMode(false);
    setIsViewMode(false);
    setSelectedProduct(null);
    setIsCreateOpen(true);
  }

  function closeCreateForm() {
    if (creating) return;
    setIsCreateOpen(false);
    setIsViewMode(false);
  }

  function openEditForm(product) {
    setProductForm({
      name: product.name ?? '',
      sku: product.sku ?? '',
      price: String(product.price ?? ''),
      stock_quantity: String(product.stock_quantity ?? 0),
      reorder_level: String(product.reorder_level ?? 0),
      category_id: product.category_id == null ? '' : String(product.category_id),
    });
    setFormErrors({});
    setCreateError('');
    setSuccessMessage('');
    setSelectedProduct(product);
    setIsEditMode(true);
    setIsViewMode(false);
    setIsCreateOpen(true);
  }

  async function openProductDetails(product) {
    setSelectedProduct(null);
    setCreateError('');
    setViewLoading(true);
    setIsEditMode(false);
    setIsViewMode(true);
    setIsCreateOpen(true);
    try {
      const response = await apiFetch(`${PRODUCTS_URL}${product.id}`);
      if (!response.ok) throw new Error(`Product details could not be loaded (HTTP ${response.status}).`);
      setSelectedProduct(await response.json());
    } catch (requestError) {
      setCreateError(getErrorMessage(requestError));
    } finally {
      setViewLoading(false);
    }
  }

  function updateProductField(event) {
    const { name, value } = event.target;
    setProductForm((currentForm) => ({ ...currentForm, [name]: value }));
    setFormErrors((currentErrors) => ({ ...currentErrors, [name]: undefined }));
    setCreateError('');
  }

  async function saveProduct(event) {
    event.preventDefault();
    const validationErrors = validateProductForm(productForm);
    setFormErrors(validationErrors);
    setCreateError('');
    if (Object.keys(validationErrors).length > 0) return;

    const payload = {
      name: productForm.name.trim(),
      sku: productForm.sku.trim(),
      price: Number(productForm.price),
      stock_quantity: Number(productForm.stock_quantity),
      reorder_level: Number(productForm.reorder_level),
      category_id: productForm.category_id.trim() ? Number(productForm.category_id) : null,
    };

    setCreating(true);
    try {
      const isEdit = isEditMode;
      const response = await apiFetch(isEdit ? `${PRODUCTS_URL}${selectedProduct.id}` : PRODUCTS_URL, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message = `Product could not be ${isEdit ? 'updated' : 'created'} (HTTP ${response.status}).`;
        try {
          const responseBody = await response.json();
          if (typeof responseBody.detail === 'string') message = responseBody.detail;
          else if (Array.isArray(responseBody.detail)) {
            message = responseBody.detail.map((item) => item.msg).filter(Boolean).join(' ');
          }
        } catch {
          // Use the HTTP status message when the response has no JSON body.
        }
        throw new Error(message);
      }

      setIsCreateOpen(false);
      setIsEditMode(false);
      setProductForm(EMPTY_PRODUCT_FORM);
      setFormErrors({});
      setSuccessMessage(`Product ${isEdit ? 'updated' : 'created'} successfully.`);
      await loadProducts(true);
    } catch (requestError) {
      setCreateError(getErrorMessage(requestError));
    } finally {
      setCreating(false);
    }
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Delete product "${product.name}"? This cannot be undone.`)) return;
    setDeletingProductId(product.id);
    setError('');
    try {
      const response = await apiFetch(`${PRODUCTS_URL}${product.id}`, { method: 'DELETE' });
      if (!response.ok) {
        let message = `Product could not be deleted (HTTP ${response.status}).`;
        try {
          const responseBody = await response.json();
          if (typeof responseBody.detail === 'string') message = responseBody.detail;
        } catch {
          // Keep the HTTP status message if the response has no JSON body.
        }
        throw new Error(message);
      }
      setSuccessMessage('Product deleted successfully.');
      await loadProducts(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setDeletingProductId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-teal-700">
            Inventory Operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Products</h1>
          <p className="mt-1 text-sm text-stone-600">Review product details and stock levels across your inventory.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-28 border-l-2 border-teal-500 pl-3">
            <p className="text-2xl font-semibold leading-none tracking-tight text-stone-900" aria-live="polite">
              {loading ? '—' : numberFormatter.format(products.length)}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.17em] text-stone-500">
              {products.length === 1 ? 'Product' : 'Products'}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 rounded-md bg-teal-800 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
          >
            <span aria-hidden="true" className="text-base leading-none">+</span>
            Add Product
          </button>
          <button
            type="button"
            onClick={() => loadProducts(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-stone-300 bg-[#fffdf9] px-3 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-teal-500 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden="true" className={refreshing ? 'animate-spin' : ''}>↻</span>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-[#fffdf9] shadow-sm">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Product inventory</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {loading
                ? 'Loading inventory…'
                : search
                  ? `${numberFormatter.format(filteredProducts.length)} of ${numberFormatter.format(products.length)} products`
                  : 'Current stock and reorder thresholds'}
            </p>
          </div>
          <label className="flex w-full items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-500 focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100 sm:w-72">
            <span aria-hidden="true" className="text-base leading-none text-stone-400">⌕</span>
            <span className="sr-only">Search products by name or SKU</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or SKU"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:ring-0"
            />
          </label>
        </div>

        {error && (
          <div role="alert" className="mx-4 mt-4 flex flex-col gap-2 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => loadProducts(Boolean(products.length))}
              disabled={refreshing}
              className="w-fit font-medium text-red-900 underline decoration-red-300 underline-offset-2 hover:decoration-red-700 disabled:opacity-60"
            >
              Try again
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/80">
                {['Product ID', 'Product Name', 'SKU', 'Price', 'Stock Quantity', 'Reorder Level', 'Category ID', 'Stock Status', 'Actions'].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-stone-600"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-sm text-stone-600" role="status">
                    <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-teal-700 align-[-3px]" />
                    Loading products from inventory…
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <p className="text-sm font-medium text-stone-800">
                      {error && products.length === 0
                        ? 'Inventory is unavailable right now.'
                        : products.length === 0
                          ? 'No products in inventory yet.'
                          : 'No products match your search.'}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {products.length > 0 ? 'Try a different product name or SKU.' : 'Refresh to check for the latest inventory.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const status = getStockStatus(product);
                  return (
                    <tr key={product.id} className="transition-colors hover:bg-stone-50/80">
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs tabular-nums text-stone-500">#{product.id}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-sm font-medium text-stone-900">{product.name}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-stone-600">{product.sku}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums text-stone-800">
                        {currencyFormatter.format(Number(product.price))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums text-stone-800">
                        {numberFormatter.format(Number(product.stock_quantity))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums text-stone-600">
                        {numberFormatter.format(Number(product.reorder_level))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums text-stone-600">
                        {product.category_id ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset ${status.className}`}>
                          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                          {status.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openProductDetails(product)}
                            className="rounded border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-700 hover:border-teal-500 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditForm(product)}
                            className="rounded border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-700 hover:border-teal-500 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteProduct(product)}
                            disabled={deletingProductId === product.id}
                            className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60"
                          >
                            {deletingProductId === product.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-stone-500">Stock status is calculated from each product’s current quantity and reorder level.</p>

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-40 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-900 shadow-lg"
        >
          {successMessage}
        </div>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="create-product-title"
        aria-describedby="create-product-description"
        onCancel={(event) => {
          if (creating) {
            event.preventDefault();
            return;
          }
          setIsCreateOpen(false);
          setIsViewMode(false);
        }}
        onClose={() => setIsCreateOpen(false)}
        className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-stone-200 bg-[#fffdf9] p-0 text-stone-900 shadow-2xl backdrop:bg-stone-950/40"
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-700">Inventory Operations</p>
            <h2 id="create-product-title" className="mt-1 text-xl font-semibold tracking-tight">
              {isViewMode ? 'Product Details' : isEditMode ? 'Edit Product' : 'Add Product'}
            </h2>
            <p id="create-product-description" className="mt-1 text-sm text-stone-600">
              {isViewMode ? 'Product and current inventory information.' : isEditMode ? 'Update this product’s inventory details.' : 'Enter the product details to add it to your inventory.'}
            </p>
          </div>
          <button
            type="button"
            onClick={closeCreateForm}
            disabled={creating}
            aria-label="Close product form"
            className="rounded-md px-2 py-1 text-xl leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        {isViewMode ? (
          <div className="px-5 py-5 sm:px-6">
            {viewLoading ? (
              <p role="status" className="py-8 text-center text-sm text-stone-600">Loading product details…</p>
            ) : selectedProduct ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  ['Name', selectedProduct.name],
                  ['SKU', selectedProduct.sku],
                  ['Price', currencyFormatter.format(Number(selectedProduct.price))],
                  ['Stock Quantity', selectedProduct.stock_quantity],
                  ['Reorder Level', selectedProduct.reorder_level],
                  ['Category ID', selectedProduct.category_id ?? '—'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-stone-200 bg-white px-3 py-2.5">
                    <dt className="text-xs font-medium text-stone-500">{label}</dt>
                    <dd className="mt-1 break-words text-sm text-stone-900">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {createError && <p role="alert" className="mt-4 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-900">{createError}</p>}
            <div className="mt-5 flex justify-end border-t border-stone-200 pt-4">
              <button type="button" onClick={closeCreateForm} className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
                Close
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={saveProduct} noValidate>
          <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
            {[
              { name: 'name', label: 'Product Name', type: 'text', required: true, autoComplete: 'off' },
              { name: 'sku', label: 'SKU', type: 'text', required: true, autoComplete: 'off' },
              { name: 'price', label: 'Price', type: 'number', required: true, step: '0.01' },
              { name: 'stock_quantity', label: 'Stock Quantity', type: 'number', required: true, step: '1' },
              { name: 'reorder_level', label: 'Reorder Level', type: 'number', required: true, step: '1' },
              { name: 'category_id', label: 'Category ID', type: 'number', required: false, step: '1' },
            ].map((field) => {
              const fieldError = formErrors[field.name];
              const fieldId = `product-${field.name}`;
              return (
                <div key={field.name}>
                  <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-stone-800">
                    {field.label}
                    {field.required ? <span className="ml-1 text-red-700" aria-hidden="true">*</span> : null}
                  </label>
                  <input
                    id={fieldId}
                    name={field.name}
                    type={field.type}
                    value={productForm[field.name]}
                    onChange={updateProductField}
                    required={field.required}
                    min={field.type === 'number' ? '0' : undefined}
                    step={field.step}
                    autoComplete={field.autoComplete}
                    autoFocus={field.name === 'name'}
                    aria-invalid={Boolean(fieldError)}
                    aria-describedby={fieldError ? `${fieldId}-error` : undefined}
                    className={`w-full rounded-md border bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition placeholder:text-stone-400 focus:ring-2 ${
                      fieldError
                        ? 'border-red-400 focus:border-red-600 focus:ring-red-100'
                        : 'border-stone-300 focus:border-teal-600 focus:ring-teal-100'
                    }`}
                  />
                  {fieldError && (
                    <p id={`${fieldId}-error`} className="mt-1 text-xs text-red-800">
                      {fieldError}
                    </p>
                  )}
                  {field.name === 'category_id' && (
                    <p className="mt-1 text-xs text-stone-500">Optional. Leave blank if the product has no category.</p>
                  )}
                </div>
              );
            })}
          </div>

          {createError && (
            <p role="alert" className="mx-5 mb-4 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-900 sm:mx-6">
              {createError}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-stone-200 bg-stone-50/70 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={closeCreateForm}
              disabled={creating}
              className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {creating ? 'Saving…' : isEditMode ? 'Save Changes' : 'Save Product'}
            </button>
          </div>
        </form>
        )}
      </dialog>
    </div>
  );
}
