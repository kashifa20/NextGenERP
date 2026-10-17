import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../api';

const PURCHASE_ORDERS_URL = '/purchase-orders/';
const SUPPLIERS_URL = '/suppliers/';
const PRODUCTS_URL = '/products/';
const PURCHASE_ORDER_STATUSES = ['Pending', 'Approved', 'Ordered', 'Received', 'Cancelled'];
const PURCHASE_ORDER_STATUS_TRANSITIONS = {
  Pending: ['Approved', 'Cancelled'],
  Approved: ['Ordered', 'Cancelled'],
  Ordered: ['Received', 'Cancelled'],
  Received: [],
  Cancelled: [],
};
const EMPTY_PURCHASE_ORDER_FORM = {
  supplier_id: '',
  product_id: '',
  quantity: '',
  unit_price: '',
};

const numberFormatter = new Intl.NumberFormat('en-IN');
const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const statusStyles = {
  Pending: 'bg-amber-50 text-amber-900 ring-amber-200',
  Approved: 'bg-teal-50 text-teal-800 ring-teal-200',
  Ordered: 'bg-amber-50 text-amber-900 ring-amber-200',
  Received: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  Cancelled: 'bg-red-50 text-red-800 ring-red-200',
};

async function requestPurchaseOrders() {
  const response = await apiFetch(PURCHASE_ORDERS_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Purchase orders could not be loaded (HTTP ${response.status}).`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('The purchase orders service returned an unexpected response.');
  }
  return data;
}

async function readApiError(response, fallbackMessage) {
  let message = `${fallbackMessage} (HTTP ${response.status}).`;
  try {
    const responseBody = await response.json();
    if (typeof responseBody.detail === 'string') {
      message = responseBody.detail;
    } else if (Array.isArray(responseBody.detail)) {
      message = responseBody.detail.map((item) => item.msg).filter(Boolean).join(' ');
    }
  } catch {
    // Keep the HTTP status message when the response has no JSON body.
  }
  return message;
}

async function requestOptions(url, label) {
  const response = await apiFetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readApiError(response, `${label} could not be loaded`));
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`The ${label.toLocaleLowerCase()} service returned an unexpected response.`);
  }
  return data;
}

function getErrorMessage(requestError) {
  return requestError instanceof Error
    ? requestError.message
    : 'Unable to connect to the purchase orders service.';
}

function getStatusStyle(status) {
  return statusStyles[status] ?? 'bg-stone-100 text-stone-700 ring-stone-300';
}

function formatCurrency(amount) {
  const value = Number(amount);
  return Number.isFinite(value) ? currencyFormatter.format(value) : '—';
}

export default function PurchaseOrders() {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [purchaseOrderForm, setPurchaseOrderForm] = useState(EMPTY_PURCHASE_ORDER_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedStatusOrder, setSelectedStatusOrder] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusError, setStatusError] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedDeleteOrder, setSelectedDeleteOrder] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const createDialogRef = useRef(null);
  const statusDialogRef = useRef(null);
  const deleteDialogRef = useRef(null);

  useEffect(() => {
    const dialog = createDialogRef.current;
    if (!dialog) return;
    if (isCreateOpen && !dialog.open) dialog.showModal();
    if (!isCreateOpen && dialog.open) dialog.close();
  }, [isCreateOpen]);

  useEffect(() => {
    const dialog = statusDialogRef.current;
    if (!dialog) return;
    if (selectedStatusOrder && !dialog.open) dialog.showModal();
    if (!selectedStatusOrder && dialog.open) dialog.close();
  }, [selectedStatusOrder]);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (selectedDeleteOrder && !dialog.open) dialog.showModal();
    if (!selectedDeleteOrder && dialog.open) dialog.close();
  }, [selectedDeleteOrder]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timeoutId = window.setTimeout(() => setSuccessMessage(''), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  async function loadPurchaseOrders(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      setPurchaseOrders(await requestPurchaseOrders());
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    requestPurchaseOrders()
      .then((data) => {
        if (active) setPurchaseOrders(data);
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

  const filteredPurchaseOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return purchaseOrders;
    return purchaseOrders.filter((purchaseOrder) =>
      [purchaseOrder.supplier_id, purchaseOrder.product_id].some((value) =>
        String(value ?? '').toLocaleLowerCase().includes(query),
      ),
    );
  }, [purchaseOrders, search]);

  async function openCreateForm() {
    setPurchaseOrderForm(EMPTY_PURCHASE_ORDER_FORM);
    setFormErrors({});
    setCreateError('');
    setOptionsError('');
    setSuccessMessage('');
    setIsCreateOpen(true);
    setOptionsLoading(true);

    const [supplierResult, productResult] = await Promise.allSettled([
      requestOptions(SUPPLIERS_URL, 'Suppliers'),
      requestOptions(PRODUCTS_URL, 'Products'),
    ]);
    const optionErrors = [];
    if (supplierResult.status === 'fulfilled') {
      setSuppliers(supplierResult.value);
    } else {
      optionErrors.push(getErrorMessage(supplierResult.reason));
    }
    if (productResult.status === 'fulfilled') {
      setProducts(productResult.value);
    } else {
      optionErrors.push(getErrorMessage(productResult.reason));
    }
    if (optionErrors.length > 0) setOptionsError(optionErrors.join(' '));
    setOptionsLoading(false);
  }

  function closeCreateForm() {
    if (creating) return;
    setIsCreateOpen(false);
  }

  function updatePurchaseOrderField(event) {
    const { name, value } = event.target;
    setPurchaseOrderForm((currentForm) => ({ ...currentForm, [name]: value }));
    setFormErrors((currentErrors) => ({ ...currentErrors, [name]: undefined }));
    setCreateError('');
  }

  async function savePurchaseOrder(event) {
    event.preventDefault();
    const validationErrors = {};
    if (!purchaseOrderForm.supplier_id) validationErrors.supplier_id = 'Select a supplier.';
    if (!purchaseOrderForm.product_id) validationErrors.product_id = 'Select a product.';
    if (!/^[1-9]\d*$/.test(purchaseOrderForm.quantity.trim())) {
      validationErrors.quantity = 'Quantity must be a positive whole number.';
    }
    const unitPrice = Number(purchaseOrderForm.unit_price);
    if (
      !purchaseOrderForm.unit_price.trim()
      || !Number.isFinite(unitPrice)
      || unitPrice < 0
    ) {
      validationErrors.unit_price = 'Enter a valid unit price of 0 or more.';
    }
    setFormErrors(validationErrors);
    setCreateError('');
    if (Object.keys(validationErrors).length > 0) return;

    setCreating(true);
    try {
      const response = await apiFetch(PURCHASE_ORDERS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: Number(purchaseOrderForm.supplier_id),
          product_id: Number(purchaseOrderForm.product_id),
          quantity: Number(purchaseOrderForm.quantity),
          unit_price: unitPrice,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Purchase order could not be created'));
      }

      setIsCreateOpen(false);
      setPurchaseOrderForm(EMPTY_PURCHASE_ORDER_FORM);
      setFormErrors({});
      setSuccessMessage('Purchase order created successfully.');
      await loadPurchaseOrders(true);
    } catch (requestError) {
      setCreateError(getErrorMessage(requestError));
    } finally {
      setCreating(false);
    }
  }

  function openStatusEditor(purchaseOrder) {
    if (purchaseOrder.status === 'Received') return;
    setSelectedStatusOrder(purchaseOrder);
    setSelectedStatus(purchaseOrder.status);
    setStatusError('');
  }

  function closeStatusEditor() {
    if (updatingStatus) return;
    setSelectedStatusOrder(null);
    setStatusError('');
  }

  async function savePurchaseOrderStatus(event) {
    event.preventDefault();
    if (!selectedStatusOrder) return;

    setUpdatingStatus(true);
    setStatusError('');
    try {
      const response = await apiFetch(`${PURCHASE_ORDERS_URL}${selectedStatusOrder.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: selectedStatus }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Purchase order status could not be updated'));
      }

      const updatedOrder = selectedStatusOrder;
      setSelectedStatusOrder(null);
      setSuccessMessage(`Purchase order #${updatedOrder.id} status updated to ${selectedStatus}.`);
      await loadPurchaseOrders(true);
    } catch (requestError) {
      setStatusError(getErrorMessage(requestError));
    } finally {
      setUpdatingStatus(false);
    }
  }

  function openDeleteConfirmation(purchaseOrder) {
    if (purchaseOrder.status === 'Received') return;
    setSelectedDeleteOrder(purchaseOrder);
    setDeleteError('');
  }

  function closeDeleteConfirmation() {
    if (deleting) return;
    setSelectedDeleteOrder(null);
    setDeleteError('');
  }

  async function deletePurchaseOrder() {
    if (
      !selectedDeleteOrder
      || selectedDeleteOrder.status === 'Received'
    ) return;

    setDeleting(true);
    setDeleteError('');
    try {
      const response = await apiFetch(`${PURCHASE_ORDERS_URL}${selectedDeleteOrder.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Purchase order could not be deleted'));
      }

      const deletedOrder = selectedDeleteOrder;
      setSelectedDeleteOrder(null);
      setSuccessMessage(`Purchase order #${deletedOrder.id} deleted successfully.`);
      await loadPurchaseOrders(true);
    } catch (requestError) {
      setDeleteError(getErrorMessage(requestError));
    } finally {
      setDeleting(false);
    }
  }

  const previewQuantity = Number(purchaseOrderForm.quantity);
  const previewUnitPrice = Number(purchaseOrderForm.unit_price);
  const previewTotal = purchaseOrderForm.quantity.trim()
    && purchaseOrderForm.unit_price.trim()
    && Number.isFinite(previewQuantity)
    && Number.isFinite(previewUnitPrice)
    && previewQuantity > 0
    && previewUnitPrice >= 0
    ? previewQuantity * previewUnitPrice
    : null;

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-teal-700">
            Inventory Operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Purchase Orders</h1>
          <p className="mt-1 text-sm text-stone-600">Review supplier orders, pricing, and receiving status.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="min-w-28 border-l-2 border-teal-500 pl-3">
            <p className="text-2xl font-semibold leading-none tracking-tight text-stone-900" aria-live="polite">
              {loading ? '—' : numberFormatter.format(purchaseOrders.length)}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.17em] text-stone-500">
              {purchaseOrders.length === 1 ? 'Purchase Order' : 'Purchase Orders'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openCreateForm}
              disabled={optionsLoading}
              className="inline-flex items-center gap-2 rounded-md bg-teal-800 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span aria-hidden="true">+</span>
              New Purchase Order
            </button>
            <button
              type="button"
              onClick={() => loadPurchaseOrders(true)}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-2 rounded-md border border-stone-300 bg-[#fffdf9] px-3 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-teal-500 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span aria-hidden="true" className={refreshing ? 'animate-spin' : ''}>↻</span>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-[#fffdf9] shadow-sm">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Purchase order register</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {loading
                ? 'Loading purchase orders…'
                : search
                  ? `${numberFormatter.format(filteredPurchaseOrders.length)} of ${numberFormatter.format(purchaseOrders.length)} purchase orders`
                  : 'Current supplier orders and fulfillment status'}
            </p>
          </div>
          <label className="flex w-full items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-500 focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100 sm:w-80">
            <span aria-hidden="true" className="text-base leading-none text-stone-400">⌕</span>
            <span className="sr-only">Search by supplier ID or product ID</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search supplier ID or product ID"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:ring-0"
            />
          </label>
        </div>

        {error && (
          <div role="alert" className="mx-4 mt-4 flex flex-col gap-2 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => loadPurchaseOrders(Boolean(purchaseOrders.length))}
              disabled={refreshing}
              className="w-fit font-medium text-red-900 underline decoration-red-300 underline-offset-2 hover:decoration-red-700 disabled:opacity-60"
            >
              Try again
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/80">
                {['Purchase Order ID', 'Supplier ID', 'Product ID', 'Quantity', 'Unit Price', 'Total Amount', 'Status', 'Actions'].map((heading) => (
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
                    Loading purchase orders from inventory…
                  </td>
                </tr>
              ) : filteredPurchaseOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <p className="text-sm font-medium text-stone-800">
                      {error && purchaseOrders.length === 0
                        ? 'Purchase orders are unavailable right now.'
                        : purchaseOrders.length === 0
                          ? 'No purchase orders have been created yet.'
                          : 'No purchase orders match your search.'}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {purchaseOrders.length > 0
                        ? 'Try a different supplier ID or product ID.'
                        : 'Refresh to check for the latest purchase orders.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredPurchaseOrders.map((purchaseOrder) => (
                  <tr key={purchaseOrder.id} className="transition-colors hover:bg-stone-50/80">
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs tabular-nums text-stone-500">#{purchaseOrder.id}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums text-stone-600">{purchaseOrder.supplier_id}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums text-stone-600">{purchaseOrder.product_id}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums text-stone-800">{purchaseOrder.quantity}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums text-stone-800">
                      {formatCurrency(purchaseOrder.unit_price)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums text-stone-800">
                      {formatCurrency(purchaseOrder.total_amount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset ${getStatusStyle(purchaseOrder.status)}`}>
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                        {purchaseOrder.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openStatusEditor(purchaseOrder)}
                          disabled={purchaseOrder.status === 'Received' || updatingStatus || deleting}
                          title={purchaseOrder.status === 'Received'
                            ? 'Received purchase orders cannot be changed.'
                            : undefined}
                          className="rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Edit Status
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteConfirmation(purchaseOrder)}
                          disabled={purchaseOrder.status === 'Received' || deleting || updatingStatus}
                          title={purchaseOrder.status === 'Received'
                            ? 'Received purchase orders cannot be deleted.'
                            : undefined}
                          className="rounded border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-800 transition hover:border-red-400 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Delete
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
        ref={createDialogRef}
        aria-labelledby="create-purchase-order-title"
        aria-describedby="create-purchase-order-description"
        onCancel={(event) => {
          if (creating) {
            event.preventDefault();
            return;
          }
          setIsCreateOpen(false);
        }}
        onClose={() => setIsCreateOpen(false)}
        className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-xl border border-stone-200 bg-[#fffdf9] p-0 text-stone-900 shadow-2xl backdrop:bg-stone-950/40"
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-700">Inventory Operations</p>
            <h2 id="create-purchase-order-title" className="mt-1 text-xl font-semibold tracking-tight">New Purchase Order</h2>
            <p id="create-purchase-order-description" className="mt-1 text-sm text-stone-600">
              Record a supplier order for inventory.
            </p>
          </div>
          <button
            type="button"
            onClick={closeCreateForm}
            disabled={creating}
            aria-label="Close purchase order form"
            className="rounded-md px-2 py-1 text-xl leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <form onSubmit={savePurchaseOrder} noValidate>
          <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
            <div>
              <label htmlFor="purchase-order-supplier" className="mb-1.5 block text-sm font-medium text-stone-800">
                Supplier <span className="ml-1 text-red-700" aria-hidden="true">*</span>
              </label>
              <select
                id="purchase-order-supplier"
                name="supplier_id"
                value={purchaseOrderForm.supplier_id}
                onChange={updatePurchaseOrderField}
                required
                disabled={optionsLoading || Boolean(optionsError) || suppliers.length === 0}
                aria-invalid={Boolean(formErrors.supplier_id)}
                aria-describedby={formErrors.supplier_id ? 'purchase-order-supplier-error' : undefined}
                className={`w-full rounded-md border bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:bg-stone-100 ${
                  formErrors.supplier_id
                    ? 'border-red-400 focus:border-red-600 focus:ring-red-100'
                    : 'border-stone-300 focus:border-teal-600 focus:ring-teal-100'
                }`}
              >
                <option value="">{optionsLoading ? 'Loading suppliers…' : 'Choose a supplier'}</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
              {formErrors.supplier_id && <p id="purchase-order-supplier-error" className="mt-1 text-xs text-red-800">{formErrors.supplier_id}</p>}
              {!optionsLoading && !optionsError && suppliers.length === 0 && (
                <p className="mt-1 text-xs text-stone-500">Add a supplier before creating a purchase order.</p>
              )}
            </div>

            <div>
              <label htmlFor="purchase-order-product" className="mb-1.5 block text-sm font-medium text-stone-800">
                Product <span className="ml-1 text-red-700" aria-hidden="true">*</span>
              </label>
              <select
                id="purchase-order-product"
                name="product_id"
                value={purchaseOrderForm.product_id}
                onChange={updatePurchaseOrderField}
                required
                disabled={optionsLoading || Boolean(optionsError) || products.length === 0}
                aria-invalid={Boolean(formErrors.product_id)}
                aria-describedby={formErrors.product_id ? 'purchase-order-product-error' : undefined}
                className={`w-full rounded-md border bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:bg-stone-100 ${
                  formErrors.product_id
                    ? 'border-red-400 focus:border-red-600 focus:ring-red-100'
                    : 'border-stone-300 focus:border-teal-600 focus:ring-teal-100'
                }`}
              >
                <option value="">{optionsLoading ? 'Loading products…' : 'Choose a product'}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>
                ))}
              </select>
              {formErrors.product_id && <p id="purchase-order-product-error" className="mt-1 text-xs text-red-800">{formErrors.product_id}</p>}
              {!optionsLoading && !optionsError && products.length === 0 && (
                <p className="mt-1 text-xs text-stone-500">Add a product before creating a purchase order.</p>
              )}
            </div>

            <div>
              <label htmlFor="purchase-order-quantity" className="mb-1.5 block text-sm font-medium text-stone-800">
                Quantity <span className="ml-1 text-red-700" aria-hidden="true">*</span>
              </label>
              <input
                id="purchase-order-quantity"
                name="quantity"
                type="number"
                value={purchaseOrderForm.quantity}
                onChange={updatePurchaseOrderField}
                required
                min="1"
                step="1"
                inputMode="numeric"
                aria-invalid={Boolean(formErrors.quantity)}
                aria-describedby={formErrors.quantity ? 'purchase-order-quantity-error' : undefined}
                className={`w-full rounded-md border bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:ring-2 ${
                  formErrors.quantity
                    ? 'border-red-400 focus:border-red-600 focus:ring-red-100'
                    : 'border-stone-300 focus:border-teal-600 focus:ring-teal-100'
                }`}
              />
              {formErrors.quantity && <p id="purchase-order-quantity-error" className="mt-1 text-xs text-red-800">{formErrors.quantity}</p>}
            </div>

            <div>
              <label htmlFor="purchase-order-unit-price" className="mb-1.5 block text-sm font-medium text-stone-800">
                Unit Price <span className="ml-1 text-red-700" aria-hidden="true">*</span>
              </label>
              <input
                id="purchase-order-unit-price"
                name="unit_price"
                type="number"
                value={purchaseOrderForm.unit_price}
                onChange={updatePurchaseOrderField}
                required
                min="0"
                step="any"
                aria-invalid={Boolean(formErrors.unit_price)}
                aria-describedby={formErrors.unit_price ? 'purchase-order-unit-price-error' : undefined}
                className={`w-full rounded-md border bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:ring-2 ${
                  formErrors.unit_price
                    ? 'border-red-400 focus:border-red-600 focus:ring-red-100'
                    : 'border-stone-300 focus:border-teal-600 focus:ring-teal-100'
                }`}
              />
              {formErrors.unit_price && <p id="purchase-order-unit-price-error" className="mt-1 text-xs text-red-800">{formErrors.unit_price}</p>}
            </div>

            <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2.5 sm:col-span-2">
              <p className="text-xs font-medium text-stone-500">Estimated Total</p>
              <p className="mt-1 text-base font-semibold tabular-nums text-stone-900">
                {previewTotal === null ? 'Enter quantity and unit price' : formatCurrency(previewTotal)}
              </p>
            </div>
          </div>

          {optionsError && (
            <div role="alert" className="mx-5 mb-4 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-900 sm:mx-6">
              <p>{optionsError}</p>
              <button type="button" onClick={openCreateForm} className="mt-1 font-medium underline decoration-red-300 underline-offset-2 hover:decoration-red-700">
                Retry loading suppliers and products
              </button>
            </div>
          )}
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
              disabled={creating || optionsLoading || Boolean(optionsError) || suppliers.length === 0 || products.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {creating ? 'Creating…' : 'Create Purchase Order'}
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={statusDialogRef}
        aria-labelledby="edit-purchase-order-status-title"
        aria-describedby="edit-purchase-order-status-description"
        onCancel={(event) => {
          if (updatingStatus) {
            event.preventDefault();
            return;
          }
          setSelectedStatusOrder(null);
          setStatusError('');
        }}
        onClose={() => setSelectedStatusOrder(null)}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-stone-200 bg-[#fffdf9] p-0 text-stone-900 shadow-2xl backdrop:bg-stone-950/40"
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-700">Inventory Operations</p>
            <h2 id="edit-purchase-order-status-title" className="mt-1 text-xl font-semibold tracking-tight">Update Purchase Order Status</h2>
            <p id="edit-purchase-order-status-description" className="mt-1 text-sm text-stone-600">
              Update purchase order #{selectedStatusOrder?.id}.
            </p>
          </div>
          <button
            type="button"
            onClick={closeStatusEditor}
            disabled={updatingStatus}
            aria-label="Close purchase order status editor"
            className="rounded-md px-2 py-1 text-xl leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-50"
          >
            ×
          </button>
        </div>
        <form onSubmit={savePurchaseOrderStatus}>
          <div className="px-5 py-5">
            <label htmlFor="edit-purchase-order-status" className="mb-1.5 block text-sm font-medium text-stone-800">Status</label>
            <select
              id="edit-purchase-order-status"
              value={selectedStatus}
              onChange={(event) => {
                setSelectedStatus(event.target.value);
                setStatusError('');
              }}
              disabled={updatingStatus}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-stone-100"
            >
              {[selectedStatusOrder?.status, ...(PURCHASE_ORDER_STATUS_TRANSITIONS[selectedStatusOrder?.status] ?? PURCHASE_ORDER_STATUSES)]
                .filter((status, index, statuses) => statuses.indexOf(status) === index)
                .map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          {statusError && (
            <p role="alert" className="mx-5 mb-4 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-900">
              {statusError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 border-t border-stone-200 bg-stone-50/70 px-5 py-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeStatusEditor} disabled={updatingStatus} className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60">
              Cancel
            </button>
            <button type="submit" disabled={updatingStatus || !selectedStatus} className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
              {updatingStatus && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {updatingStatus ? 'Saving…' : 'Save Status'}
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={deleteDialogRef}
        aria-labelledby="delete-purchase-order-title"
        aria-describedby="delete-purchase-order-description"
        onCancel={(event) => {
          if (deleting) {
            event.preventDefault();
            return;
          }
          setSelectedDeleteOrder(null);
          setDeleteError('');
        }}
        onClose={() => setSelectedDeleteOrder(null)}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-stone-200 bg-[#fffdf9] p-0 text-stone-900 shadow-2xl backdrop:bg-stone-950/40"
      >
        <div className="border-b border-stone-200 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-700">Confirm Deletion</p>
          <h2 id="delete-purchase-order-title" className="mt-1 text-xl font-semibold tracking-tight">Delete Purchase Order?</h2>
          <p id="delete-purchase-order-description" className="mt-2 text-sm text-stone-600">
            Purchase order #{selectedDeleteOrder?.id} will be permanently deleted. This action cannot be undone.
          </p>
        </div>
        {deleteError && (
          <p role="alert" className="mx-5 mt-4 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-900">
            {deleteError}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 border-t border-stone-200 bg-stone-50/70 px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={closeDeleteConfirmation} disabled={deleting} className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60">
            Cancel
          </button>
          <button type="button" onClick={deletePurchaseOrder} disabled={deleting || !selectedDeleteOrder || selectedDeleteOrder.status === 'Received'} className="inline-flex items-center justify-center gap-2 rounded-md bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
            {deleting && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {deleting ? 'Deleting…' : 'Delete Purchase Order'}
          </button>
        </div>
      </dialog>
    </div>
  );
}
