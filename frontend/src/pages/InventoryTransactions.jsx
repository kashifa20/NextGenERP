
import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import { apiFetch } from '../api';

async function fetchInventory(path, options) {
  try {
    return await apiFetch(path, options);
  } catch (error) {
    if (error instanceof TypeError) {
      const target = API_BASE_URL || 'the frontend API proxy';
      throw new Error(
        `Cannot connect to ${target}. Verify that the backend is running and the frontend API proxy is configured.`,
      );
    }
    throw error;
  }
}

function getResponseError(data, fallback) {
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((issue) => issue.msg)
      .filter(Boolean)
      .join(' ');
  }
  return fallback;
}

async function requestInventoryData() {
  const [productResponse, transactionResponse] = await Promise.all([
    fetchInventory('/products/'),
    fetchInventory('/inventory-transactions/'),
  ]);

  if (!productResponse.ok || !transactionResponse.ok) {
    const failedResponse = !productResponse.ok ? productResponse : transactionResponse;
    const data = await failedResponse.json().catch(() => ({}));
    throw new Error(
      getResponseError(data, `Could not load inventory data (HTTP ${failedResponse.status}).`),
    );
  }

  const productData = await productResponse.json();
  const transactionData = await transactionResponse.json();

  return {
    products: productData,
    transactions: Array.isArray(transactionData)
      ? transactionData
      : transactionData.items || [],
  };
}

function InventoryTransactions() {
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [type, setType] = useState('Stock In');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  async function loadData() {
    setDataLoading(true);
    try {
      const inventoryData = await requestInventoryData();
      setProducts(inventoryData.products);
      setTransactions(inventoryData.transactions);
    } catch (error) {
      setMessage(error.message);
      setMessageIsError(true);
    } finally {
      setDataLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    requestInventoryData()
      .then((inventoryData) => {
        if (!active) return;
        setProducts(inventoryData.products);
        setTransactions(inventoryData.transactions);
      })
      .catch((error) => {
        if (active) {
          setMessage(error.message);
          setMessageIsError(true);
        }
      })
      .finally(() => {
        if (active) setDataLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    setMessageIsError(false);

    if (
      !productId
      || !Number.isInteger(Number(quantity))
      || Number(quantity) <= 0
      || !reason.trim()
    ) {
      setMessage('Select a product, enter a positive quantity, and provide a reason.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetchInventory('/inventory-transactions/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: Number(productId),
          transaction_type: type,
          quantity: Number(quantity),
          reason: reason.trim()
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          getResponseError(data, `Inventory transaction failed (HTTP ${response.status}).`),
        );
      }

      setMessage('Inventory updated successfully.');
      setMessageIsError(false);
      setQuantity('');
      setReason('');
      await loadData();
    } catch (error) {
      setMessage(error.message);
      setMessageIsError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-6">
      <h1 className="mb-2 text-2xl font-bold">Inventory Operations</h1>
      <p className="mb-6 text-stone-500">
        Record stock movements and review inventory history.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mb-8 grid gap-4 rounded-xl border border-stone-200 bg-white p-5 md:grid-cols-2"
      >
        <label className="grid gap-2 text-sm">
          Transaction Type
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="rounded-md border p-2"
          >
            <option value="Stock In">Stock In</option>
            <option value="Stock Out">Stock Out</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm">
          Product
          <select
            required
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            className="rounded-md border p-2"
          >
            <option value="">Select a product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} — Stock: {product.stock_quantity}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm">
          Quantity
          <input
            required
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="rounded-md border p-2"
          />
        </label>

        <label className="grid gap-2 text-sm">
          Reason
          <input
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. New shipment or damaged goods"
            className="rounded-md border p-2"
          />
        </label>

        <button
          disabled={loading}
          className="rounded-md bg-teal-700 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Record Stock Movement'}
        </button>

        {message && (
          <p
            role={messageIsError ? 'alert' : 'status'}
            className={`self-center text-sm ${messageIsError ? 'text-red-800' : 'text-teal-800'}`}
          >
            {message}
          </p>
        )}
      </form>

      <h2 className="mb-3 text-lg font-semibold">Stock History</h2>
      {dataLoading && (
        <p role="status" className="mb-3 text-sm text-stone-600">Loading products and stock history…</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-100">
            <tr>
              {['Product', 'Type', 'Quantity', 'Previous Stock', 'New Stock', 'Reason', 'Date'].map((heading) => (
                <th key={heading} className="whitespace-nowrap p-3">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-3">{item.product_name || item.product?.name || item.product_id}</td>
                <td className="p-3">{item.transaction_type}</td>
                <td className="p-3">{item.quantity}</td>
                <td className="p-3">{item.previous_stock}</td>
                <td className="p-3">{item.new_stock}</td>
                <td className="p-3">{item.reason}</td>
                <td className="whitespace-nowrap p-3">
                  {item.created_at ? new Date(item.created_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
            {!dataLoading && transactions.length === 0 && (
              <tr>
                <td colSpan="7" className="p-5 text-center text-stone-500">
                  No inventory transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

export default InventoryTransactions;
