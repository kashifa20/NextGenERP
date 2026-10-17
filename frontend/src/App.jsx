import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';

import Dashboard from './pages/Dashboard';
import Auth from './pages/Auth';
import Categories from './pages/Categories';
import Products from './pages/Products';
import Suppliers from './pages/Suppliers';
import SalesOrders from './pages/SalesOrders';
import PurchaseOrders from './pages/PurchaseOrders';
import InventoryTransactions from './pages/InventoryTransactions';

const navigation = [
  { name: 'Dashboard', path: '/', icon: 'â–£' },
  { name: 'Products', path: '/products', icon: 'â—«' },
  { name: 'Inventory Operations', path: '/inventory-operations', icon: '↕' },
  { name: 'Categories', path: '/categories', icon: 'â–¤' },
  { name: 'Suppliers', path: '/suppliers', icon: 'â—' },
  { name: 'Sales Orders', path: '/sales-orders', icon: 'â—Œ' },
  { name: 'Purchase Orders', path: '/purchase-orders', icon: 'â–¨' },
];

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('access_token'));

  useEffect(() => {
    function handleExpiredToken() {
      setToken(null);
    }

    window.addEventListener('auth:expired', handleExpiredToken);
    return () => window.removeEventListener('auth:expired', handleExpiredToken);
  }, []);

  function handleAuthenticated(accessToken) {
    sessionStorage.setItem('access_token', accessToken);
    setToken(accessToken);
  }

  function handleLogout() {
    sessionStorage.removeItem('access_token');
    setToken(null);
  }

  if (!token) {
    return <Auth onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="flex min-h-screen bg-[#f3efe8] text-stone-800">
      <aside className="w-64 border-r border-stone-800 bg-[#1b1d20] text-stone-200">
        <div className="flex items-center gap-3 border-b border-stone-700 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#1ec7b7] text-sm font-bold text-[#0f172a]">
            N
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight text-white">NextGenERP</p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-stone-400">Ops Center</p>
          </div>
        </div>

        <nav className="mt-6 space-y-1 px-3">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `group flex items-center gap-3 border-l-2 px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'border-teal-400 bg-stone-800 text-white'
                    : 'border-transparent text-stone-300 hover:border-stone-600 hover:bg-stone-800 hover:text-white'
                }`
              }
            >
              <span className="text-base text-teal-300">{item.icon}</span>
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-stone-200 bg-[#fffdf9] px-5 py-3 shadow-[0_1px_0_rgba(24,24,27,0.04)]">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-stone-500">
              Inventory Command Center
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-500">
              <span className="text-stone-400">âŒ•</span>
              <input
                type="text"
                placeholder="Search"
                className="w-32 border-0 bg-transparent text-sm text-stone-700 outline-none placeholder:text-stone-400"
              />
            </div>
            <button className="flex h-9 w-9 items-center justify-center rounded-md border border-stone-200 bg-white text-base text-stone-600 shadow-sm">
              ðŸ””
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dfeae8] text-sm font-semibold text-stone-700">
              AS
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-teal-500 hover:text-teal-800"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="p-5">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/sales-orders" element={<SalesOrders />} />
            <Route path="/purchase-orders" element={<PurchaseOrders />} />
            <Route path="/inventory-operations" element={<InventoryTransactions />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
