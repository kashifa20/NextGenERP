import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../api';

const CATEGORIES_URL = '/categories/';
const EMPTY_CATEGORY_FORM = { name: '', description: '' };

const numberFormatter = new Intl.NumberFormat('en-IN');

async function requestCategories() {
  const response = await apiFetch(CATEGORIES_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Categories could not be loaded (HTTP ${response.status}).`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('The categories service returned an unexpected response.');
  }
  return data;
}

function getErrorMessage(requestError) {
  return requestError instanceof Error
    ? requestError.message
    : 'Unable to connect to the categories service.';
}

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isViewMode, setIsViewMode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const dialogRef = useRef(null);
  const categoryRequestIdRef = useRef(0);

  async function loadCategories(isRefresh = false) {
    const requestId = ++categoryRequestIdRef.current;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const data = await requestCategories();
      if (requestId === categoryRequestIdRef.current) setCategories(data);
    } catch (requestError) {
      if (requestId === categoryRequestIdRef.current) setError(getErrorMessage(requestError));
    } finally {
      if (requestId === categoryRequestIdRef.current) {
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
    const requestId = ++categoryRequestIdRef.current;
    requestCategories()
      .then((data) => {
        if (active && requestId === categoryRequestIdRef.current) setCategories(data);
      })
      .catch((requestError) => {
        if (active && requestId === categoryRequestIdRef.current) setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active && requestId === categoryRequestIdRef.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function openCreateForm() {
    setCategoryForm(EMPTY_CATEGORY_FORM);
    setFormErrors({});
    setCreateError('');
    setSuccessMessage('');
    setSelectedCategory(null);
    setIsEditMode(false);
    setIsViewMode(false);
    setIsCreateOpen(true);
  }

  function closeCreateForm() {
    if (creating) return;
    setIsCreateOpen(false);
    setIsViewMode(false);
  }

  function openEditForm(category) {
    setCategoryForm({
      name: category.name ?? '',
      description: category.description ?? '',
    });
    setFormErrors({});
    setCreateError('');
    setSuccessMessage('');
    setSelectedCategory(category);
    setIsEditMode(true);
    setIsViewMode(false);
    setIsCreateOpen(true);
  }

  function openCategoryDetails(category) {
    setSelectedCategory(category);
    setCreateError('');
    setIsEditMode(false);
    setIsViewMode(true);
    setIsCreateOpen(true);
  }

  function updateCategoryField(event) {
    const { name, value } = event.target;
    setCategoryForm((currentForm) => ({ ...currentForm, [name]: value }));
    setFormErrors((currentErrors) => ({ ...currentErrors, [name]: undefined }));
    setCreateError('');
  }

  async function saveCategory(event) {
    event.preventDefault();
    const name = categoryForm.name.trim();
    const validationErrors = name ? {} : { name: 'Category name is required.' };
    setFormErrors(validationErrors);
    setCreateError('');
    if (Object.keys(validationErrors).length > 0) return;

    setCreating(true);
    try {
      const description = categoryForm.description.trim();
      const query = new URLSearchParams({ name, description });
      const isEdit = isEditMode;
      const url = isEdit
        ? `${CATEGORIES_URL}${selectedCategory.id}?${query.toString().replace(/\+/g, '%20')}`
        : `${CATEGORIES_URL}?${query.toString().replace(/\+/g, '%20')}`;
      const response = await apiFetch(url, { method: isEdit ? 'PUT' : 'POST' });

      if (!response.ok) {
        let message = `Category could not be ${isEdit ? 'updated' : 'created'} (HTTP ${response.status}).`;
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
      setCategoryForm(EMPTY_CATEGORY_FORM);
      setFormErrors({});
      setSuccessMessage(`Category ${isEdit ? 'updated' : 'created'} successfully.`);
      await loadCategories(true);
    } catch (requestError) {
      setCreateError(getErrorMessage(requestError));
    } finally {
      setCreating(false);
    }
  }

  async function deleteCategory(category) {
    if (!window.confirm(`Delete category "${category.name}"? This cannot be undone.`)) return;
    setDeletingCategoryId(category.id);
    setError('');
    try {
      const response = await apiFetch(`${CATEGORIES_URL}${category.id}`, { method: 'DELETE' });
      if (!response.ok) {
        let message = `Category could not be deleted (HTTP ${response.status}).`;
        try {
          const responseBody = await response.json();
          if (typeof responseBody.detail === 'string') message = responseBody.detail;
        } catch {
          // Keep the HTTP status message if the response has no JSON body.
        }
        throw new Error(message);
      }
      setSuccessMessage('Category deleted successfully.');
      await loadCategories(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setDeletingCategoryId(null);
    }
  }

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return categories;
    return categories.filter((category) =>
      String(category.name ?? '').toLocaleLowerCase().includes(query),
    );
  }, [categories, search]);

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-teal-700">
            Inventory Operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Categories</h1>
          <p className="mt-1 text-sm text-stone-600">Review the categories used to organize your inventory.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-28 border-l-2 border-teal-500 pl-3">
            <p className="text-2xl font-semibold leading-none tracking-tight text-stone-900" aria-live="polite">
              {loading ? '—' : numberFormatter.format(categories.length)}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.17em] text-stone-500">
              {categories.length === 1 ? 'Category' : 'Categories'}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 rounded-md bg-teal-800 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
          >
            <span aria-hidden="true" className="text-base leading-none">+</span>
            Add Category
          </button>
          <button
            type="button"
            onClick={() => loadCategories(true)}
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
            <h2 className="text-base font-semibold text-stone-900">Category directory</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {loading
                ? 'Loading categories…'
                : search
                  ? `${numberFormatter.format(filteredCategories.length)} of ${numberFormatter.format(categories.length)} categories`
                  : 'Current inventory categories'}
            </p>
          </div>
          <label className="flex w-full items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-500 focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100 sm:w-72">
            <span aria-hidden="true" className="text-base leading-none text-stone-400">⌕</span>
            <span className="sr-only">Search categories by name</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search category name"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:ring-0"
            />
          </label>
        </div>

        {error && (
          <div role="alert" className="mx-4 mt-4 flex flex-col gap-2 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => loadCategories(Boolean(categories.length))}
              disabled={refreshing}
              className="w-fit font-medium text-red-900 underline decoration-red-300 underline-offset-2 hover:decoration-red-700 disabled:opacity-60"
            >
              Try again
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/80">
                {['Category ID', 'Category Name', 'Description', 'Actions'].map((heading) => (
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
                  <td colSpan={4} className="px-4 py-16 text-center text-sm text-stone-600" role="status">
                    <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-teal-700 align-[-3px]" />
                    Loading categories from inventory…
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center">
                    <p className="text-sm font-medium text-stone-800">
                      {error && categories.length === 0
                        ? 'Categories are unavailable right now.'
                        : categories.length === 0
                          ? 'No categories have been added yet.'
                          : 'No categories match your search.'}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {categories.length > 0
                        ? 'Try a different category name.'
                        : 'Refresh to check for the latest categories.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredCategories.map((category) => (
                  <tr key={category.id} className="transition-colors hover:bg-stone-50/80">
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs tabular-nums text-stone-500">#{category.id}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm font-medium text-stone-900">{category.name}</td>
                    <td className="px-4 py-3.5 text-sm text-stone-600">{category.description || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openCategoryDetails(category)}
                          className="rounded border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-700 hover:border-teal-500 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditForm(category)}
                          className="rounded border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-700 hover:border-teal-500 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCategory(category)}
                          disabled={deletingCategoryId === category.id}
                          className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60"
                        >
                          {deletingCategoryId === category.id ? 'Deleting…' : 'Delete'}
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
        ref={dialogRef}
        aria-labelledby="create-category-title"
        aria-describedby="create-category-description"
        onCancel={(event) => {
          if (creating) {
            event.preventDefault();
            return;
          }
          setIsCreateOpen(false);
          setIsViewMode(false);
        }}
        onClose={() => setIsCreateOpen(false)}
        className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-xl border border-stone-200 bg-[#fffdf9] p-0 text-stone-900 shadow-2xl backdrop:bg-stone-950/40"
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-700">Inventory Operations</p>
            <h2 id="create-category-title" className="mt-1 text-xl font-semibold tracking-tight">
              {isViewMode ? 'Category Details' : isEditMode ? 'Edit Category' : 'Add Category'}
            </h2>
            <p id="create-category-description" className="mt-1 text-sm text-stone-600">
              {isViewMode ? 'Category information used to organize inventory.' : isEditMode ? 'Update the category details.' : 'Add a category to organize your inventory.'}
            </p>
          </div>
          <button
            type="button"
            onClick={closeCreateForm}
            disabled={creating}
            aria-label="Close category form"
            className="rounded-md px-2 py-1 text-xl leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        {isViewMode ? (
          <div className="px-5 py-5 sm:px-6">
            <dl className="space-y-4">
              {[
                ['Category ID', selectedCategory?.id == null ? '—' : `#${selectedCategory.id}`],
                ['Name', selectedCategory?.name ?? '—'],
                ['Description', selectedCategory?.description || '—'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-stone-200 bg-white px-3 py-2.5">
                  <dt className="text-xs font-medium text-stone-500">{label}</dt>
                  <dd className="mt-1 break-words text-sm text-stone-900">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex justify-end border-t border-stone-200 pt-4">
              <button type="button" onClick={closeCreateForm} className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
                Close
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={saveCategory} noValidate>
          <div className="space-y-4 px-5 py-5 sm:px-6">
            <div>
              <label htmlFor="category-name" className="mb-1.5 block text-sm font-medium text-stone-800">
                Category Name
                <span className="ml-1 text-red-700" aria-hidden="true">*</span>
              </label>
              <input
                id="category-name"
                name="name"
                type="text"
                value={categoryForm.name}
                onChange={updateCategoryField}
                required
                autoComplete="off"
                autoFocus
                aria-invalid={Boolean(formErrors.name)}
                aria-describedby={formErrors.name ? 'category-name-error' : undefined}
                className={`w-full rounded-md border bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition placeholder:text-stone-400 focus:ring-2 ${
                  formErrors.name
                    ? 'border-red-400 focus:border-red-600 focus:ring-red-100'
                    : 'border-stone-300 focus:border-teal-600 focus:ring-teal-100'
                }`}
              />
              {formErrors.name && (
                <p id="category-name-error" className="mt-1 text-xs text-red-800">
                  {formErrors.name}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="category-description" className="mb-1.5 block text-sm font-medium text-stone-800">
                Description <span className="font-normal text-stone-500">(optional)</span>
              </label>
              <textarea
                id="category-description"
                name="description"
                value={categoryForm.description}
                onChange={updateCategoryField}
                rows={3}
                className="w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
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
              disabled={creating}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {creating ? 'Saving…' : isEditMode ? 'Save Changes' : 'Save Category'}
            </button>
          </div>
        </form>
        )}
      </dialog>
    </div>
  );
}
