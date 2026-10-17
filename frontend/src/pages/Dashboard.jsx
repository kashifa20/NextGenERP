import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';

const API_ENDPOINTS = [
  { key: 'products', label: 'Products', path: '/products/' },
  { key: 'categories', label: 'Categories', path: '/categories/' },
  { key: 'suppliers', label: 'Suppliers', path: '/suppliers/' },
  { key: 'orders', label: 'Sales orders', path: '/orders/' },
  { key: 'purchaseOrders', label: 'Purchase orders', path: '/purchase-orders/' },
];

const emptyDashboardData = {
  products: [],
  categories: [],
  suppliers: [],
  orders: [],
  purchaseOrders: [],
};

const numberFormatter = new Intl.NumberFormat('en-IN');
const quickActions = [
  { label: 'Add Product', path: '/products' },
  { label: 'New Sale', path: '/sales-orders' },
  { label: 'New Purchase Order', path: '/purchase-orders' },
  { label: 'Add Supplier', path: '/suppliers' },
];

async function requestCollection(endpoint) {
  const response = await apiFetch(endpoint.path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${endpoint.label} request failed (HTTP ${response.status}).`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`${endpoint.label} returned an unexpected response.`);
  }
  return data;
}

async function requestDashboardData() {
  const results = await Promise.allSettled(
    API_ENDPOINTS.map((endpoint) => requestCollection(endpoint)),
  );
  const failures = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason.message);

  if (failures.length > 0) {
    throw new Error(`Unable to load dashboard data: ${failures.join(' ')}`);
  }

  return Object.fromEntries(
    API_ENDPOINTS.map((endpoint, index) => [endpoint.key, results[index].value]),
  );
}

function getProductQuantity(product) {
  const quantity = Number(product.stock_quantity);
  return Number.isFinite(quantity) ? quantity : 0;
}

function getProductReorderLevel(product) {
  const reorderLevel = Number(product.reorder_level);
  return Number.isFinite(reorderLevel) ? reorderLevel : 0;
}

function getOrderStatusCount(orders, status) {
  return orders.filter((order) => order.status === status).length;
}

function getAttentionSummaries(data) {
  const lowStockProducts = data.products.filter((product) => {
    const quantity = getProductQuantity(product);
    return quantity > 0 && quantity <= getProductReorderLevel(product);
  });
  const outOfStockProducts = data.products.filter(
    (product) => getProductQuantity(product) === 0,
  );
  const pendingOrders = data.orders.filter((order) => order.status === 'Pending');
  const pendingPurchaseOrders = data.purchaseOrders.filter(
    (order) => order.status === 'Pending',
  );

  return [
    {
      title: 'Low-stock products',
      records: lowStockProducts,
      detail: lowStockProducts.length
        ? lowStockProducts.map((product) => `${product.name} (${product.stock_quantity} units)`).join(', ')
        : 'No products need reorder review.',
      tone: 'amber',
    },
    {
      title: 'Out-of-stock products',
      records: outOfStockProducts,
      detail: outOfStockProducts.length
        ? outOfStockProducts.map((product) => product.name).join(', ')
        : 'No products are out of stock.',
      tone: 'red',
    },
    {
      title: 'Pending sales orders',
      records: pendingOrders,
      detail: pendingOrders.length
        ? pendingOrders.map((order) => `#${order.id} · ${order.customer_name}`).join(', ')
        : 'No sales orders are pending.',
      tone: 'amber',
    },
    {
      title: 'Pending purchase orders',
      records: pendingPurchaseOrders,
      detail: pendingPurchaseOrders.length
        ? pendingPurchaseOrders
            .map((order) => `#${order.id} · supplier ${order.supplier_id}`)
            .join(', ')
        : 'No purchase orders are pending.',
      tone: 'amber',
    },
  ];
}

function getLatestById(records) {
  return [...records]
    .sort((first, second) => Number(second.id) - Number(first.id))
    .slice(0, 3);
}

function StatCard({ label, value, detail, tone = 'teal', loading }) {
  const valueStyles = {
    teal: 'text-stone-900',
    amber: 'text-amber-800',
    red: 'text-red-800',
  };

  return (
    <div className="min-h-24 rounded-xl border border-stone-200 bg-[#fffdf9] p-3 shadow-sm">
      <p className="text-[10px] font-medium uppercase leading-snug tracking-[0.16em] text-stone-500">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className={`text-2xl font-semibold leading-none tracking-tight ${valueStyles[tone]}`} aria-live="polite">
          {loading ? '—' : numberFormatter.format(value)}
        </p>
        <p className="text-right text-[11px] leading-tight text-stone-500">{detail}</p>
      </div>
    </div>
  );
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function loadDashboard(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      setData(await requestDashboardData());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to connect to one or more dashboard services.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    requestDashboardData()
      .then((dashboardData) => {
        if (active) setData(dashboardData);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to connect to one or more dashboard services.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const dashboardData = data ?? emptyDashboardData;

  const lowStockProducts = useMemo(
    () =>
      dashboardData.products
        .filter(
          (product) =>
            getProductQuantity(product) <= getProductReorderLevel(product),
        )
        .sort(
          (first, second) =>
            getProductQuantity(first) - getProductQuantity(second),
        ),
    [dashboardData.products],
  );

  const metrics = useMemo(() => {
    const lowStockCount = dashboardData.products.filter((product) => {
      const quantity = getProductQuantity(product);
      return quantity > 0 && quantity <= getProductReorderLevel(product);
    }).length;
    const outOfStockCount = dashboardData.products.filter(
      (product) => getProductQuantity(product) === 0,
    ).length;

    return {
      lowStockCount,
      outOfStockCount,
      totalUnits: dashboardData.products.reduce(
        (total, product) => total + getProductQuantity(product),
        0,
      ),
      pendingOrders: getOrderStatusCount(dashboardData.orders, 'Pending'),
      confirmedOrders: getOrderStatusCount(dashboardData.orders, 'Confirmed'),
      deliveredOrders: getOrderStatusCount(dashboardData.orders, 'Delivered'),
      pendingPurchaseOrders: getOrderStatusCount(dashboardData.purchaseOrders, 'Pending'),
      receivedPurchaseOrders: getOrderStatusCount(dashboardData.purchaseOrders, 'Received'),
    };
  }, [dashboardData]);

  const inventoryHealth = useMemo(() => {
    const groups = [
      {
        label: 'In Stock',
        tone: 'teal',
        products: dashboardData.products.filter((product) => {
          const quantity = getProductQuantity(product);
          return quantity > getProductReorderLevel(product);
        }),
      },
      {
        label: 'Low Stock',
        tone: 'amber',
        products: dashboardData.products.filter((product) => {
          const quantity = getProductQuantity(product);
          return quantity > 0 && quantity <= getProductReorderLevel(product);
        }),
      },
      {
        label: 'Out of Stock',
        tone: 'red',
        products: dashboardData.products.filter(
          (product) => getProductQuantity(product) === 0,
        ),
      },
    ];
    const productCount = dashboardData.products.length;

    return groups.map((group) => {
      const units = group.products.reduce(
        (total, product) => total + getProductQuantity(product),
        0,
      );

      return {
        ...group,
        value: productCount
          ? `${Math.round((group.products.length / productCount) * 100)}%`
          : '0%',
        amount: `${numberFormatter.format(group.products.length)} ${group.products.length === 1 ? 'product' : 'products'} · ${numberFormatter.format(units)} units`,
      };
    });
  }, [dashboardData]);

  const attentionSummaries = useMemo(
    () => getAttentionSummaries(dashboardData),
    [dashboardData],
  );
  const recentSalesOrders = useMemo(
    () => getLatestById(dashboardData.orders),
    [dashboardData.orders],
  );
  const recentPurchaseOrders = useMemo(
    () => getLatestById(dashboardData.purchaseOrders),
    [dashboardData.purchaseOrders],
  );

  const inventoryStats = [
    { label: 'Total Products', value: dashboardData.products.length, detail: 'products', tone: 'teal' },
    { label: 'Total Categories', value: dashboardData.categories.length, detail: 'categories', tone: 'teal' },
    { label: 'Low Stock', value: metrics.lowStockCount, detail: 'products to review', tone: 'amber' },
    { label: 'Out of Stock', value: metrics.outOfStockCount, detail: 'products unavailable', tone: 'red' },
    { label: 'Total Units', value: metrics.totalUnits, detail: 'units on hand', tone: 'teal' },
  ];
  const salesStats = [
    { label: 'Total Orders', value: dashboardData.orders.length, detail: 'sales orders', tone: 'teal' },
    { label: 'Pending Orders', value: metrics.pendingOrders, detail: 'awaiting action', tone: 'amber' },
    { label: 'Confirmed Orders', value: metrics.confirmedOrders, detail: 'confirmed', tone: 'teal' },
    { label: 'Delivered Orders', value: metrics.deliveredOrders, detail: 'delivered', tone: 'teal' },
  ];
  const procurementStats = [
    { label: 'Total Purchase Orders', value: dashboardData.purchaseOrders.length, detail: 'purchase orders', tone: 'teal' },
    { label: 'Pending Purchase Orders', value: metrics.pendingPurchaseOrders, detail: 'awaiting action', tone: 'amber' },
    { label: 'Received Purchase Orders', value: metrics.receivedPurchaseOrders, detail: 'received', tone: 'teal' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-teal-700">
            Operations Overview
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
            Dashboard
          </h1>
        </div>
        <button
          type="button"
          onClick={() => loadDashboard(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-[#fffdf9] px-3 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-teal-500 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span aria-hidden="true" className={refreshing ? 'animate-spin' : ''}>↻</span>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading && (
        <p className="text-sm text-stone-600" role="status">
          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-teal-700 align-[-3px]" />
          Loading dashboard data…
        </p>
      )}

      {error && (
        <div role="alert" className="flex flex-col gap-2 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => loadDashboard(Boolean(data))}
            disabled={refreshing}
            className="w-fit font-medium text-red-900 underline decoration-red-300 underline-offset-2 hover:decoration-red-700 disabled:opacity-60"
          >
            Try again
          </button>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-500">Inventory</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {inventoryStats.map((stat) => (
            <StatCard key={stat.label} {...stat} loading={loading || !data} />
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-[#fffdf9] shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 p-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Low-stock alerts</h2>
            <p className="text-xs text-stone-500">
              Products at or below their reorder level
            </p>
          </div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
            {loading || !data ? '—' : numberFormatter.format(lowStockProducts.length)}
          </span>
        </div>

        {!data ? (
          <p className="p-4 text-sm text-stone-600">
            {loading ? 'Loading stock alerts…' : 'Stock alerts are unavailable.'}
          </p>
        ) : lowStockProducts.length === 0 ? (
          <p className="p-4 text-sm text-stone-600">
            No products are at or below their reorder level.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-100 text-xs uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 text-right font-medium">Current quantity</th>
                  <th className="px-4 py-3 text-right font-medium">Reorder level</th>
                </tr>
              </thead>
              <tbody>
                {lowStockProducts.map((product) => {
                  const quantity = getProductQuantity(product);
                  const outOfStock = quantity <= 0;
                  return (
                    <tr key={product.id} className="border-t border-stone-200">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                            outOfStock
                              ? 'bg-red-50 text-red-800'
                              : 'bg-amber-50 text-amber-900'
                          }`}
                        >
                          {outOfStock ? 'Out of stock' : 'Low stock'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-800">{product.name}</td>
                      <td className="px-4 py-3 text-stone-600">{product.sku || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {numberFormatter.format(quantity)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {numberFormatter.format(getProductReorderLevel(product))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-500">Sales</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {salesStats.map((stat) => (
            <StatCard key={stat.label} {...stat} loading={loading || !data} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-500">Procurement & Suppliers</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ...procurementStats,
            {
              label: 'Total Suppliers',
              value: dashboardData.suppliers.length,
              detail: 'suppliers',
              tone: 'teal',
            },
          ].map((stat) => (
            <StatCard key={stat.label} {...stat} loading={loading || !data} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-xl border border-stone-200 bg-[#fffdf9] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-stone-900">Inventory Health</h2>
              <p className="text-xs text-stone-500">Stock level by product count</p>
            </div>
            <span className="rounded-full bg-teal-50 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-teal-700">
              Live data
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {inventoryHealth.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-stone-700">{item.label}</span>
                  <span className="text-stone-500">{loading || !data ? '—' : item.value}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-200">
                  <div
                    className={`h-full rounded-full ${
                      item.tone === 'teal'
                        ? 'bg-teal-500'
                        : item.tone === 'amber'
                          ? 'bg-amber-400'
                          : 'bg-red-500'
                    }`}
                    style={{ width: loading || !data ? '0%' : item.value }}
                  />
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  {loading
                    ? 'Loading product levels…'
                    : !data
                      ? 'Product levels are unavailable.'
                      : item.amount}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-[#fffdf9] p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-900">Attention Required</h2>
          <div className="mt-4 space-y-3">
            {attentionSummaries.map((alert) => (
              <div
                key={alert.title}
                className={`rounded-md border-l-4 bg-stone-50 p-3 ${
                  alert.tone === 'amber' ? 'border-amber-400' : 'border-red-500'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-stone-800">{alert.title}</p>
                  <span className={`text-xs font-semibold tabular-nums ${alert.tone === 'amber' ? 'text-amber-800' : 'text-red-800'}`}>
                    {loading || !data ? '—' : numberFormatter.format(alert.records.length)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-stone-600">
                  {loading
                    ? 'Loading…'
                    : !data
                      ? 'Dashboard data is unavailable.'
                      : alert.detail}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-stone-200 bg-[#fffdf9] p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">Quick Actions</h2>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              to={action.path}
              className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
            >
              {action.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-[#fffdf9] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Recent Activity</h2>
            <p className="text-xs text-stone-500">Latest sales and purchase orders by ID</p>
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Live data</span>
        </div>

        {!data ? (
          <p className="mt-4 text-sm text-stone-600" role="status">
            {loading ? 'Loading recent orders…' : 'Recent orders are unavailable.'}
          </p>
        ) : (
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">Sales Orders</h3>
              {recentSalesOrders.length ? (
                <div className="space-y-3">
                  {recentSalesOrders.map((order) => (
                    <div key={order.id} className="flex items-start gap-3">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-teal-500" />
                      <div className="flex-1 border-b border-stone-200 pb-2 last:border-b-0 last:pb-0">
                        <p className="text-sm font-medium text-stone-700">
                          Order #{order.id} · {order.customer_name}
                        </p>
                        <p className="text-xs text-stone-500">{order.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-stone-500">No sales orders available.</p>
              )}
            </div>

            <div>
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">Purchase Orders</h3>
              {recentPurchaseOrders.length ? (
                <div className="space-y-3">
                  {recentPurchaseOrders.map((order) => (
                    <div key={order.id} className="flex items-start gap-3">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-amber-400" />
                      <div className="flex-1 border-b border-stone-200 pb-2 last:border-b-0 last:pb-0">
                        <p className="text-sm font-medium text-stone-700">
                          Purchase order #{order.id} · Supplier {order.supplier_id}
                        </p>
                        <p className="text-xs text-stone-500">{order.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-stone-500">No purchase orders available.</p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default Dashboard;
