import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../api';

const ORDERS_URL = '/orders/';
const PRODUCTS_URL = '/products/';
const ORDER_STATUSES = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
const ORDER_STATUS_TRANSITIONS = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered'],
  Delivered: [],
  Cancelled: [],
};
const EMPTY_ORDER_FORM = {
  customer_name: '',
  customer_email: '',
  product_id: '',
  quantity: '1',
};

const numberFormatter = new Intl.NumberFormat('en-IN');
const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const statusStyles = {
  Pending: 'bg-amber-50 text-amber-900 ring-amber-200',
  Confirmed: 'bg-teal-50 text-teal-800 ring-teal-200',
  Shipped: 'bg-sky-50 text-sky-800 ring-sky-200',
  Delivered: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  Cancelled: 'bg-red-50 text-red-800 ring-red-200',
};

async function requestOrders() {
  const response = await apiFetch(ORDERS_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Sales orders could not be loaded (HTTP ${response.status}).`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('The sales orders service returned an unexpected response.');
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

async function requestProducts() {
  const response = await apiFetch(PRODUCTS_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Products could not be loaded'));
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
    : 'Unable to connect to the sales orders service.';
}

function getStatusStyle(status) {
  return statusStyles[status] ?? 'bg-stone-100 text-stone-700 ring-stone-300';
}

export default function SalesOrders() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const [orderForm, setOrderForm] = useState(EMPTY_ORDER_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedStatusOrder, setSelectedStatusOrder] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusUpdateError, setStatusUpdateError] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const dialogRef = useRef(null);
  const statusDialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
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
    if (!successMessage) return undefined;
    const timeoutId = window.setTimeout(() => setSuccessMessage(''), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  async function loadOrders(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      setOrders(await requestOrders());
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    requestOrders()
      .then((data) => {
        if (active) setOrders(data);
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

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return orders;
    return orders.filter((order) =>
      [order.customer_name, order.customer_email].some((value) =>
        String(value ?? '').toLocaleLowerCase().includes(query),
      ),
    );
  }, [orders, search]);

  async function openCreateForm() {
    setOrderForm(EMPTY_ORDER_FORM);
    setFormErrors({});
    setCreateError('');
    setProductsError('');
    setSuccessMessage('');
    setIsCreateOpen(true);

    if (products.length > 0) return;
    setProductsLoading(true);
    try {
      setProducts(await requestProducts());
    } catch (requestError) {
      setProductsError(getErrorMessage(requestError));
    } finally {
      setProductsLoading(false);
    }
  }

  function closeCreateForm() {
    if (creating) return;
    setIsCreateOpen(false);
  }

  function updateOrderField(event) {
    const { name, value } = event.target;
    setOrderForm((currentForm) => ({ ...currentForm, [name]: value }));
    setFormErrors((currentErrors) => ({ ...currentErrors, [name]: undefined }));
    setCreateError('');
  }

  async function saveOrder(event) {
    event.preventDefault();
    const validationErrors = {};
    if (!orderForm.customer_name.trim()) {
      validationErrors.customer_name = 'Customer name is required.';
    }
    if (orderForm.customer_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orderForm.customer_email.trim())) {
      validationErrors.customer_email = 'Enter a valid email address.';
    }
    if (!orderForm.product_id) {
      validationErrors.product_id = 'Select a product.';
    }
    if (!/^[1-9]\d*$/.test(orderForm.quantity.trim())) {
      validationErrors.quantity = 'Quantity must be a positive whole number.';
    }
    setFormErrors(validationErrors);
    setCreateError('');
    if (Object.keys(validationErrors).length > 0) return;

    setCreating(true);
    try {
      const response = await apiFetch(ORDERS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: orderForm.customer_name.trim(),
          customer_email: orderForm.customer_email.trim() || null,
          product_id: Number(orderForm.product_id),
          quantity: Number(orderForm.quantity),
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Sales order could not be created'));
      }

      setIsCreateOpen(false);
      setOrderForm(EMPTY_ORDER_FORM);
      setFormErrors({});
      setSuccessMessage('Sales order created successfully.');
      await loadOrders(true);
    } catch (requestError) {
      setCreateError(getErrorMessage(requestError));
    } finally {
      setCreating(false);
    }
  }

  function openStatusEditor(order) {
    setSelectedStatusOrder(order);
    setSelectedStatus(order.status);
    setStatusUpdateError('');
  }

  function closeStatusEditor() {
    if (updatingStatus) return;
    setSelectedStatusOrder(null);
    setStatusUpdateError('');
  }

  async function saveOrderStatus(event) {
    event.preventDefault();
    if (!selectedStatusOrder) return;

    setUpdatingStatus(true);
    setStatusUpdateError('');
    try {
      const response = await apiFetch(`${ORDERS_URL}${selectedStatusOrder.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: selectedStatus }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Sales order status could not be updated'));
      }

      const updatedOrder = selectedStatusOrder;
      setSelectedStatusOrder(null);
      setSuccessMessage(`Sales order #${updatedOrder.id} status updated to ${selectedStatus}.`);
      await loadOrders(true);
    } catch (requestError) {
      setStatusUpdateError(getErrorMessage(requestError));
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-teal-700">
            Inventory Operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Sales Orders</h1>
          <p className="mt-1 text-sm text-stone-600">Review customer orders and their fulfillment status.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="min-w-28 border-l-2 border-teal-500 pl-3">
            <p className="text-2xl font-semibold leading-none tracking-tight text-stone-900" aria-live="polite">
              {loading ? '—' : numberFormatter.format(orders.length)}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.17em] text-stone-500">
              {orders.length === 1 ? 'Order' : 'Orders'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openCreateForm}
              disabled={productsLoading}
              className="inline-flex items-center gap-2 rounded-md bg-teal-800 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span aria-hidden="true">+</span>
              New Sale
            </button>
            <button
              type="button"
              onClick={() => loadOrders(true)}
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
            <h2 className="text-base font-semibold text-stone-900">Sales order register</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {loading
                ? 'Loading sales orders…'
                : search
                  ? `${numberFormatter.format(filteredOrders.length)} of ${numberFormatter.format(orders.length)} orders`
                  : 'Current customer orders and fulfillment status'}
            </p>
          </div>
          <label className="flex w-full items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-500 focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100 sm:w-80">
            <span aria-hidden="true" className="text-base leading-none text-stone-400">⌕</span>
            <span className="sr-only">Search orders by customer name or email</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer name or email"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:ring-0"
            />
          </label>
        </div>

        {error && (
          <div role="alert" className="mx-4 mt-4 flex flex-col gap-2 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => loadOrders(Boolean(orders.length))}
              disabled={refreshing}
              className="w-fit font-medium text-red-900 underline decoration-red-300 underline-offset-2 hover:decoration-red-700 disabled:opacity-60"
            >
              Try again
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] border-collapse text-left">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/80">
                {['Order ID', 'Customer Name', 'Customer Email', 'Product ID', 'Quantity', 'Total Amount', 'Status', 'Action'].map((heading) => (
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
                    Loading orders from sales…
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <p className="text-sm font-medium text-stone-800">
                      {error && orders.length === 0
                        ? 'Sales orders are unavailable right now.'
                        : orders.length === 0
                          ? 'No sales orders have been placed yet.'
                          : 'No orders match your search.'}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {orders.length > 0
                        ? 'Try a different customer name or email.'
                        : 'Refresh to check for the latest orders.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-stone-50/80">
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs tabular-nums text-stone-500">#{order.id}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm font-medium text-stone-900">{order.customer_name}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-stone-600">{order.customer_email || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums text-stone-600">{order.product_id}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums text-stone-800">{order.quantity}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums text-stone-800">
                      {Number.isFinite(Number(order.total_amount))
                        ? currencyFormatter.format(Number(order.total_amount))
                        : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset ${getStatusStyle(order.status)}`}>
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                        {order.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => openStatusEditor(order)}
                        disabled={updatingStatus}
                        className="rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Edit Status
                      </button>
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
        ref={dialogRef}
        aria-labelledby="create-order-title"
        aria-describedby="create-order-description"
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
            <h2 id="create-order-title" className="mt-1 text-xl font-semibold tracking-tight">New Sales Order</h2>
            <p id="create-order-description" className="mt-1 text-sm text-stone-600">
              Record a customer purchase from available inventory.
            </p>
          </div>
          <button
            type="button"
            onClick={closeCreateForm}
            disabled={creating}
            aria-label="Close new sales order form"
            className="rounded-md px-2 py-1 text-xl leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <form onSubmit={saveOrder} noValidate>
          <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
            <div>
              <label htmlFor="order-customer-name" className="mb-1.5 block text-sm font-medium text-stone-800">
                Customer Name <span className="ml-1 text-red-700" aria-hidden="true">*</span>
              </label>
              <input
                id="order-customer-name"
                name="customer_name"
                type="text"
                value={orderForm.customer_name}
                onChange={updateOrderField}
                required
                autoComplete="name"
                autoFocus
                aria-invalid={Boolean(formErrors.customer_name)}
                aria-describedby={formErrors.customer_name ? 'order-customer-name-error' : undefined}
                className={`w-full rounded-md border bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:ring-2 ${
                  formErrors.customer_name
                    ? 'border-red-400 focus:border-red-600 focus:ring-red-100'
                    : 'border-stone-300 focus:border-teal-600 focus:ring-teal-100'
                }`}
              />
              {formErrors.customer_name && <p id="order-customer-name-error" className="mt-1 text-xs text-red-800">{formErrors.customer_name}</p>}
            </div>

            <div>
              <label htmlFor="order-customer-email" className="mb-1.5 block text-sm font-medium text-stone-800">
                Customer Email <span className="font-normal text-stone-500">(optional)</span>
              </label>
              <input
                id="order-customer-email"
                name="customer_email"
                type="email"
                value={orderForm.customer_email}
                onChange={updateOrderField}
                autoComplete="email"
                aria-invalid={Boolean(formErrors.customer_email)}
                aria-describedby={formErrors.customer_email ? 'order-customer-email-error' : undefined}
                className={`w-full rounded-md border bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:ring-2 ${
                  formErrors.customer_email
                    ? 'border-red-400 focus:border-red-600 focus:ring-red-100'
                    : 'border-stone-300 focus:border-teal-600 focus:ring-teal-100'
                }`}
              />
              {formErrors.customer_email && <p id="order-customer-email-error" className="mt-1 text-xs text-red-800">{formErrors.customer_email}</p>}
            </div>

            <div>
              <label htmlFor="order-product" className="mb-1.5 block text-sm font-medium text-stone-800">
                Product <span className="ml-1 text-red-700" aria-hidden="true">*</span>
              </label>
              <select
                id="order-product"
                name="product_id"
                value={orderForm.product_id}
                onChange={updateOrderField}
                required
                disabled={productsLoading || productsError || products.length === 0}
                aria-invalid={Boolean(formErrors.product_id)}
                aria-describedby={formErrors.product_id ? 'order-product-error' : undefined}
                className={`w-full rounded-md border bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:bg-stone-100 ${
                  formErrors.product_id
                    ? 'border-red-400 focus:border-red-600 focus:ring-red-100'
                    : 'border-stone-300 focus:border-teal-600 focus:ring-teal-100'
                }`}
              >
                <option value="">
                  {productsLoading ? 'Loading products…' : productsError ? 'Products unavailable' : 'Choose a product'}
                </option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {product.sku} · {Number(product.stock_quantity ?? 0)} in stock
                  </option>
                ))}
              </select>
              {formErrors.product_id && <p id="order-product-error" className="mt-1 text-xs text-red-800">{formErrors.product_id}</p>}
              {productsError && <p role="alert" className="mt-1 text-xs text-red-800">{productsError}</p>}
              {!productsLoading && !productsError && products.length === 0 && (
                <p className="mt-1 text-xs text-stone-500">Add a product to inventory before creating a sale.</p>
              )}
            </div>

            <div>
              <label htmlFor="order-quantity" className="mb-1.5 block text-sm font-medium text-stone-800">
                Quantity <span className="ml-1 text-red-700" aria-hidden="true">*</span>
              </label>
              <input
                id="order-quantity"
                name="quantity"
                type="number"
                value={orderForm.quantity}
                onChange={updateOrderField}
                required
                min="1"
                step="1"
                inputMode="numeric"
                aria-invalid={Boolean(formErrors.quantity)}
                aria-describedby={formErrors.quantity ? 'order-quantity-error' : undefined}
                className={`w-full rounded-md border bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:ring-2 ${
                  formErrors.quantity
                    ? 'border-red-400 focus:border-red-600 focus:ring-red-100'
                    : 'border-stone-300 focus:border-teal-600 focus:ring-teal-100'
                }`}
              />
              {formErrors.quantity && <p id="order-quantity-error" className="mt-1 text-xs text-red-800">{formErrors.quantity}</p>}
            </div>
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
              disabled={creating || productsLoading || Boolean(productsError) || products.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {creating ? 'Creating…' : 'Create Sale'}
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={statusDialogRef}
        aria-labelledby="edit-order-status-title"
        aria-describedby="edit-order-status-description"
        onCancel={(event) => {
          if (updatingStatus) {
            event.preventDefault();
            return;
          }
          setSelectedStatusOrder(null);
          setStatusUpdateError('');
        }}
        onClose={() => setSelectedStatusOrder(null)}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-stone-200 bg-[#fffdf9] p-0 text-stone-900 shadow-2xl backdrop:bg-stone-950/40"
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-700">Inventory Operations</p>
            <h2 id="edit-order-status-title" className="mt-1 text-xl font-semibold tracking-tight">Edit Order Status</h2>
            <p id="edit-order-status-description" className="mt-1 text-sm text-stone-600">
              {selectedStatusOrder?.status === 'Cancelled'
                ? `Sales order #${selectedStatusOrder.id} is cancelled and cannot be reopened.`
                : `Update sales order #${selectedStatusOrder?.id}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={closeStatusEditor}
            disabled={updatingStatus}
            aria-label="Close status editor"
            className="rounded-md px-2 py-1 text-xl leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <form onSubmit={saveOrderStatus}>
          <div className="px-5 py-5">
            <label htmlFor="edit-order-status" className="mb-1.5 block text-sm font-medium text-stone-800">
              Status
            </label>
            <select
              id="edit-order-status"
              value={selectedStatus}
              onChange={(event) => {
                setSelectedStatus(event.target.value);
                setStatusUpdateError('');
              }}
              disabled={updatingStatus}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-stone-100"
            >
              {[selectedStatusOrder?.status, ...(ORDER_STATUS_TRANSITIONS[selectedStatusOrder?.status] ?? ORDER_STATUSES)]
                .filter((status, index, statuses) => statuses.indexOf(status) === index)
                .map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          {statusUpdateError && (
            <p role="alert" className="mx-5 mb-4 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-900">
              {statusUpdateError}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-stone-200 bg-stone-50/70 px-5 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeStatusEditor}
              disabled={updatingStatus}
              className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updatingStatus || !selectedStatus || selectedStatus === selectedStatusOrder?.status}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updatingStatus && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {updatingStatus ? 'Saving…' : 'Save Status'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
