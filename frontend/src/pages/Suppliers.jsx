import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../api';

const SUPPLIERS_URL = '/suppliers/';
const EMPTY_SUPPLIER_FORM = {
  name: '',
  email: '',
  phone: '',
  address: '',
  lead_time_days: '0',
  performance_rating: '',
};

const numberFormatter = new Intl.NumberFormat('en-IN');

async function requestSuppliers() {
  const response = await apiFetch(SUPPLIERS_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Suppliers could not be loaded (HTTP ${response.status}).`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('The suppliers service returned an unexpected response.');
  }
  return data;
}

function getErrorMessage(requestError) {
  return requestError instanceof Error
    ? requestError.message
    : 'Unable to connect to the suppliers service.';
}

function formatRating(rating) {
  if (rating === null || rating === undefined || rating === '') return '—';

  const value = Number(rating);
  return Number.isFinite(value) ? `${value.toFixed(1)} / 5` : '—';
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [dialogMode, setDialogMode] = useState(null);
  const [supplierForm, setSupplierForm] = useState(EMPTY_SUPPLIER_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [formBusy, setFormBusy] = useState(false);
  const [viewSupplier, setViewSupplier] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [deletingSupplierId, setDeletingSupplierId] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialogMode && !dialog.open) dialog.showModal();
    if (!dialogMode && dialog.open) dialog.close();
  }, [dialogMode]);

  async function loadSuppliers(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      setSuppliers(await requestSuppliers());
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    requestSuppliers()
      .then((data) => {
        if (active) setSuppliers(data);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function openCreateForm() {
    setSupplierForm(EMPTY_SUPPLIER_FORM);
    setFormErrors({});
    setFormError('');
    setSuccessMessage('');
    setDialogMode('create');
  }

  function openEditForm(supplier) {
    setSupplierForm({
      name: supplier.name ?? '',
      email: supplier.email ?? '',
      phone: supplier.phone ?? '',
      address: supplier.address ?? '',
      lead_time_days: String(supplier.lead_time_days ?? 0),
      performance_rating: supplier.performance_rating == null ? '' : String(supplier.performance_rating),
    });
    setFormErrors({});
    setFormError('');
    setSuccessMessage('');
    setViewSupplier(supplier);
    setDialogMode('edit');
  }

  async function openSupplierDetails(supplier) {
    setViewSupplier(null);
    setViewLoading(true);
    setFormError('');
    setDialogMode('view');
    try {
      const response = await apiFetch(`${SUPPLIERS_URL}${supplier.id}`);
      if (!response.ok) throw new Error(`Supplier details could not be loaded (HTTP ${response.status}).`);
      setViewSupplier(await response.json());
    } catch (requestError) {
      setFormError(getErrorMessage(requestError));
    } finally {
      setViewLoading(false);
    }
  }

  function updateSupplierField(event) {
    const { name, value } = event.target;
    setSupplierForm((currentForm) => ({ ...currentForm, [name]: value }));
    setFormErrors((currentErrors) => ({ ...currentErrors, [name]: undefined }));
    setFormError('');
  }

  async function saveSupplier(event) {
    event.preventDefault();
    const errors = {};
    if (!supplierForm.name.trim()) errors.name = 'Supplier name is required.';
    const leadTime = supplierForm.lead_time_days.trim();
    if (leadTime && (!Number.isInteger(Number(leadTime)) || Number(leadTime) < 0)) {
      errors.lead_time_days = 'Lead time must be a whole number of 0 or more.';
    }
    const rating = supplierForm.performance_rating.trim();
    if (rating && (!Number.isFinite(Number(rating)) || Number(rating) < 0 || Number(rating) > 5)) {
      errors.performance_rating = 'Performance rating must be between 0 and 5.';
    }
    setFormErrors(errors);
    setFormError('');
    if (Object.keys(errors).length) return;

    const payload = {
      name: supplierForm.name.trim(),
      email: supplierForm.email.trim() || null,
      phone: supplierForm.phone.trim() || null,
      address: supplierForm.address.trim() || null,
      lead_time_days: leadTime ? Number(leadTime) : 0,
      performance_rating: rating ? Number(rating) : null,
    };
    const isEdit = dialogMode === 'edit';
    setFormBusy(true);
    try {
      const response = await apiFetch(
        isEdit ? `${SUPPLIERS_URL}${viewSupplier.id}` : SUPPLIERS_URL,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        let message = `Supplier could not be ${isEdit ? 'updated' : 'created'} (HTTP ${response.status}).`;
        try {
          const responseBody = await response.json();
          if (typeof responseBody.detail === 'string') message = responseBody.detail;
          else if (Array.isArray(responseBody.detail)) {
            message = responseBody.detail.map((item) => item.msg).filter(Boolean).join(' ');
          }
        } catch {
          // Keep the HTTP status message if the response has no JSON body.
        }
        throw new Error(message);
      }
      setDialogMode(null);
      setSuccessMessage(`Supplier ${isEdit ? 'updated' : 'created'} successfully.`);
      await loadSuppliers(true);
    } catch (requestError) {
      setFormError(getErrorMessage(requestError));
    } finally {
      setFormBusy(false);
    }
  }

  async function deleteSupplier(supplier) {
    if (!window.confirm(`Delete supplier "${supplier.name}"? This cannot be undone.`)) return;
    setDeletingSupplierId(supplier.id);
    setError('');
    try {
      const response = await apiFetch(`${SUPPLIERS_URL}${supplier.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`Supplier could not be deleted (HTTP ${response.status}).`);
      setSuccessMessage('Supplier deleted successfully.');
      await loadSuppliers(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setDeletingSupplierId(null);
    }
  }

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return suppliers;
    return suppliers.filter((supplier) =>
      [supplier.name, supplier.email, supplier.phone].some((value) =>
        String(value ?? '').toLocaleLowerCase().includes(query),
      ),
    );
  }, [suppliers, search]);

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-teal-700">
            Inventory Operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Suppliers</h1>
          <p className="mt-1 text-sm text-stone-600">Review supplier contacts, lead times, and performance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-28 border-l-2 border-teal-500 pl-3">
            <p className="text-2xl font-semibold leading-none tracking-tight text-stone-900" aria-live="polite">
              {loading ? '—' : numberFormatter.format(suppliers.length)}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.17em] text-stone-500">
              {suppliers.length === 1 ? 'Supplier' : 'Suppliers'}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 rounded-md bg-teal-800 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
          >
            <span aria-hidden="true">+</span>
            Add Supplier
          </button>
          <button
            type="button"
            onClick={() => loadSuppliers(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-stone-300 bg-[#fffdf9] px-3 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-teal-500 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden="true" className={refreshing ? 'animate-spin' : ''}>↻</span>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </section>

      {successMessage && (
        <div role="status" className="fixed right-4 top-20 z-40 rounded-md border border-teal-200 bg-white px-4 py-3 text-sm font-medium text-teal-900 shadow-lg">
          {successMessage}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-[#fffdf9] shadow-sm">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Supplier directory</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {loading
                ? 'Loading suppliers…'
                : search
                  ? `${numberFormatter.format(filteredSuppliers.length)} of ${numberFormatter.format(suppliers.length)} suppliers`
                  : 'Current supplier contacts and performance'}
            </p>
          </div>
          <label className="flex w-full items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-500 focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100 sm:w-72">
            <span aria-hidden="true" className="text-base leading-none text-stone-400">⌕</span>
            <span className="sr-only">Search suppliers by name, email, or phone</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, or phone"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:ring-0"
            />
          </label>
        </div>

        {error && (
          <div role="alert" className="mx-4 mt-4 flex flex-col gap-2 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => loadSuppliers(Boolean(suppliers.length))}
              disabled={refreshing}
              className="w-fit font-medium text-red-900 underline decoration-red-300 underline-offset-2 hover:decoration-red-700 disabled:opacity-60"
            >
              Try again
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1260px] border-collapse text-left">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/80">
                {['Supplier ID', 'Supplier Name', 'Email', 'Phone', 'Address', 'Lead Time (days)', 'Performance Rating', 'Actions'].map((heading) => (
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
                  <td colSpan={8} className="px-4 py-16 text-center text-sm text-stone-600" role="status">
                    <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-teal-700 align-[-3px]" />
                    Loading suppliers from inventory…
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <p className="text-sm font-medium text-stone-800">
                      {error && suppliers.length === 0
                        ? 'Supplier information is unavailable right now.'
                        : suppliers.length === 0
                          ? 'No suppliers have been added yet.'
                          : 'No suppliers match your search.'}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {suppliers.length > 0
                        ? 'Try a different name, email, or phone number.'
                        : 'Refresh to check for the latest suppliers.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="transition-colors hover:bg-stone-50/80">
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs tabular-nums text-stone-500">#{supplier.id}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm font-medium text-stone-900">{supplier.name}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-stone-600">{supplier.email || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-stone-600">{supplier.phone || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-stone-600">{supplier.address || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums text-stone-600">
                      {supplier.lead_time_days ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm font-medium tabular-nums text-stone-800">
                      {formatRating(supplier.performance_rating)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openSupplierDetails(supplier)}
                          className="rounded border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-700 hover:border-teal-500 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditForm(supplier)}
                          className="rounded border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-700 hover:border-teal-500 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSupplier(supplier)}
                          disabled={deletingSupplierId === supplier.id}
                          className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60"
                        >
                          {deletingSupplierId === supplier.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <dialog
        ref={dialogRef}
        aria-labelledby="supplier-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!formBusy) setDialogMode(null);
        }}
        className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-stone-200 bg-[#fffdf9] p-0 text-stone-800 shadow-2xl backdrop:bg-stone-950/40"
      >
        <div className="flex items-start justify-between border-b border-stone-200 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-teal-700">Inventory Operations</p>
            <h2 id="supplier-dialog-title" className="mt-1 text-lg font-semibold text-stone-900">
              {dialogMode === 'view' ? 'Supplier Details' : dialogMode === 'edit' ? 'Edit Supplier' : 'Add Supplier'}
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              {dialogMode === 'view' ? 'Supplier contact and performance information.' : 'Maintain supplier contact and performance information.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !formBusy && setDialogMode(null)}
            aria-label="Close supplier form"
            className="rounded-md p-1 text-xl leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            ×
          </button>
        </div>

        {dialogMode === 'view' ? (
          <div className="px-5 py-5 sm:px-6">
            {viewLoading ? (
              <p role="status" className="py-8 text-center text-sm text-stone-600">Loading supplier details…</p>
            ) : viewSupplier ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  ['Name', viewSupplier.name],
                  ['Email', viewSupplier.email],
                  ['Phone', viewSupplier.phone],
                  ['Address', viewSupplier.address],
                  ['Lead Time Days', viewSupplier.lead_time_days],
                  ['Performance Rating', viewSupplier.performance_rating],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-stone-200 bg-white px-3 py-2.5">
                    <dt className="text-xs font-medium text-stone-500">{label}</dt>
                    <dd className="mt-1 break-words text-sm text-stone-900">{value ?? '—'}</dd>
                  </div>
                ))}
              </dl>
            ) : formError ? (
              <p role="alert" className="border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-900">{formError}</p>
            ) : null}
            {formError && viewSupplier && (
              <p role="alert" className="mt-4 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-900">{formError}</p>
            )}
            <div className="mt-5 flex justify-end border-t border-stone-200 pt-4">
              <button type="button" onClick={() => setDialogMode(null)} className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={saveSupplier} noValidate>
            <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
              {[
                ['name', 'Name', 'text'],
                ['email', 'Email', 'email'],
                ['phone', 'Phone', 'tel'],
                ['lead_time_days', 'Lead Time Days', 'number'],
                ['performance_rating', 'Performance Rating', 'number'],
              ].map(([name, label, type]) => (
                <div key={name}>
                  <label htmlFor={`supplier-${name}`} className="mb-1.5 block text-sm font-medium text-stone-800">
                    {label}{name === 'name' && <span className="ml-1 text-red-700" aria-hidden="true">*</span>}
                  </label>
                  <input
                    id={`supplier-${name}`}
                    name={name}
                    type={type}
                    value={supplierForm[name]}
                    onChange={updateSupplierField}
                    required={name === 'name'}
                    min={type === 'number' && name === 'lead_time_days' ? 0 : undefined}
                    step={name === 'lead_time_days' ? 1 : 'any'}
                    autoComplete={name === 'name' ? 'organization' : name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'off'}
                    aria-invalid={Boolean(formErrors[name])}
                    aria-describedby={formErrors[name] ? `supplier-${name}-error` : undefined}
                    className={`w-full rounded-md border bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:ring-2 ${
                      formErrors[name] ? 'border-red-400 focus:border-red-600 focus:ring-red-100' : 'border-stone-300 focus:border-teal-600 focus:ring-teal-100'
                    }`}
                  />
                  {formErrors[name] && <p id={`supplier-${name}-error`} className="mt-1 text-xs text-red-800">{formErrors[name]}</p>}
                </div>
              ))}
              <div className="sm:col-span-2">
                <label htmlFor="supplier-address" className="mb-1.5 block text-sm font-medium text-stone-800">Address</label>
                <textarea
                  id="supplier-address"
                  name="address"
                  value={supplierForm.address}
                  onChange={updateSupplierField}
                  rows={2}
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
              </div>
            </div>
            {formError && <p role="alert" className="mx-5 mb-4 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-900 sm:mx-6">{formError}</p>}
            <div className="flex flex-col-reverse gap-2 border-t border-stone-200 bg-stone-50/70 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button type="button" onClick={() => !formBusy && setDialogMode(null)} disabled={formBusy} className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60">
                Cancel
              </button>
              <button type="submit" disabled={formBusy} className="rounded-md bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-900 disabled:opacity-60">
                {formBusy ? 'Saving…' : dialogMode === 'edit' ? 'Save Changes' : 'Save Supplier'}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
