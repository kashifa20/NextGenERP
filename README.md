# NextGenERP

NextGenERP is an inventory and procurement ERP application for managing product catalogs, stock, sales orders, and purchasing workflows. This repository contains a React frontend and a FastAPI backend backed by PostgreSQL in Docker Compose.

## Current functionality

- **Dashboard:** live catalog/order summaries, low-stock and out-of-stock attention lists, pending-order summaries, and shortcuts to operational screens. These are operational metrics, not forecasts.
- **Authentication:** account registration and sign-in with 30-minute JWT bearer tokens. Passwords are hashed with Argon2id. Tokens are held in browser session storage. All registered accounts currently have equal permissions; there is no default administrator or role-based access control.
- **Catalog:** create, view, update, and delete products, categories, and suppliers, subject to existing relationship protections.
- **Sales orders:** create and view sales orders, update customer details, and progress orders through `Pending → Confirmed → Shipped → Delivered`. Pending or confirmed orders can be cancelled; cancellation restores stock. Sales order history cannot be deleted.
- **Purchase orders:** create and view purchase orders and progress them through `Pending → Approved → Ordered → Received`. Receiving adds stock once. Unreceived orders can be cancelled or deleted.
- **Inventory operations:** record stock-in and stock-out transactions with a reason and view transaction history. Stock-out operations reject quantities greater than available inventory.
- **API health:** the `/health` endpoint checks database connectivity.

### Not included / pending

- Demand forecasting and all other machine-learning/model-training functionality belong to a separate ML module/team and are intentionally not implemented or changed here.
- The dashboard search field and notification control are presentation-only; they do not currently perform search or deliver notifications.
- User roles, account administration, password reset, and login rate limiting are not implemented.
- Database schema creation uses SQLAlchemy `create_all`; a versioned migration system is not configured.

## Technology and architecture

| Layer | Technology |
| --- | --- |
| Frontend | React 19, React Router, Vite, Tailwind CSS |
| Backend/API | Python 3.13, FastAPI, Pydantic, SQLAlchemy |
| Authentication | PyJWT bearer tokens, Argon2id password hashing |
| Runtime database | PostgreSQL 17 (Compose); tests use temporary SQLite |
| Web serving | Nginx serves the built SPA and proxies API paths to FastAPI |
| Local tooling | Node.js 22, npm, pytest |

The browser SPA calls the backend through same-origin API paths in production; the Nginx frontend container proxies those paths to the backend container. During local Vite development, Vite proxies API paths to `http://127.0.0.1:8000` by default. The backend connects to the configured SQLAlchemy `DATABASE_URL`. The Docker Compose PostgreSQL service uses a named persistent volume.

## Prerequisites

- Python 3.13 for running the backend and tests directly.
- Node.js 22 and npm for frontend development/builds.
- Docker Engine with the Docker Compose plugin for the containerized stack.
- A PostgreSQL database for a direct backend run, or the included Compose PostgreSQL service.

## Local development

### Backend

Use the database URL for your local development database. The backend loads a `.env` file from its current directory if present, and requires `DATABASE_URL` and a `JWT_SECRET_KEY` of at least 32 characters.

```powershell
py -3.13 -m venv backend\venv
backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Set-Location backend
$env:DATABASE_URL = "postgresql+psycopg://<user>:<url-encoded-password>@127.0.0.1:5432/<database>"
$env:JWT_SECRET_KEY = "<unique-random-secret-at-least-32-characters>"
$env:CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
.\venv\Scripts\python.exe -m uvicorn main:app --reload
```

If you already have an ignored `backend\.env` or local database configuration, preserve it; do not replace it with example values. The environment variables set in the terminal take precedence over values loaded from `.env`.

### Frontend

In a second terminal:

```powershell
Set-Location frontend
npm ci
$env:API_PROXY_TARGET = "http://127.0.0.1:8000"
npm run dev
```

Open <http://localhost:5173>. `API_PROXY_TARGET` configures the local Vite proxy. `VITE_API_BASE_URL` is optional and defaults to an empty string (same-origin paths); set it only when the browser should call a separately hosted API directly.

## Environment configuration

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Backend | Required SQLAlchemy connection URL. The Compose backend builds its internal URL from the PostgreSQL variables below. |
| `JWT_SECRET_KEY` | Backend | Required unique signing secret, at least 32 characters. Never commit or reuse it. |
| `CORS_ORIGINS` | Backend | Comma-separated explicit browser origins; do not use `*`. Defaults to local Vite origins. |
| `POSTGRES_USER` | Compose database | PostgreSQL role name. |
| `POSTGRES_PASSWORD` | Compose database | PostgreSQL password; use a random value and protect it as a secret. |
| `POSTGRES_DB` | Compose database | Database name. |
| `POSTGRES_PORT` | Compose database | Optional host port; the Compose binding is loopback-only and defaults to `5432`. |
| `API_PROXY_TARGET` | Vite development server | Optional backend origin for the local API proxy; defaults to `http://127.0.0.1:8000`. |
| `VITE_API_BASE_URL` | Frontend build | Optional API base URL compiled into the frontend. Leave empty when using same-origin Nginx proxying. |

The root [`.env.example`](./.env.example) is a placeholder template for Docker Compose, not a credential store and not a complete direct-backend configuration.

## Docker Compose

Compose starts PostgreSQL, the backend, and the frontend. Before starting it, copy the example environment file and replace every placeholder with appropriate local values:

```powershell
Copy-Item .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"
```

Generate separate random values for `POSTGRES_PASSWORD` and `JWT_SECRET_KEY`. Then run:

```powershell
docker compose up --build
```

Open <http://localhost:8080>. The database persists in the `nextgenerp-postgres-data` named volume. PostgreSQL is bound to `127.0.0.1` only for local database tools; the backend is not host-published. Use `docker compose down` to stop the stack without deleting records. Do not use `docker compose down -v` unless you intentionally want to delete that Compose database. Compose is a local/containerized starting point, not a complete internet-facing production configuration; see the [deployment guide](./docs/deployment.md).

## API documentation

When running the backend directly for local development, interactive OpenAPI documentation is available at <http://localhost:8000/docs>, and the schema is at <http://localhost:8000/openapi.json>. Docker Compose does not publish the backend port on the host; its documentation endpoints remain on the private Compose network.

| API path | Methods and purpose |
| --- | --- |
| `/auth/register`, `/auth/login` | Register and obtain a token / sign in and obtain a token |
| `/auth/me` | Get the authenticated account |
| `/products/`, `/products/{product_id}` | Product collection and item operations |
| `/categories/`, `/categories/{category_id}` | Category collection and item operations |
| `/suppliers/`, `/suppliers/{supplier_id}` | Supplier collection and item operations |
| `/orders/`, `/orders/{order_id}`, `/orders/{order_id}/status` | Sales order operations and status transitions |
| `/purchase-orders/`, `/purchase-orders/{purchase_order_id}`, `/purchase-orders/{purchase_order_id}/status` | Purchase order operations and status transitions |
| `/inventory-transactions/` | Create and list inventory transactions |
| `/health` | Database-backed readiness check |

Business-resource routes require `Authorization: Bearer <token>`. Registration accepts a username of 3–80 letters/digits/periods/underscores/hyphens and a password of 12–128 characters. There is no default account; register an account through the UI or API.

## Tests and production build

Backend tests create and discard a temporary SQLite database and use a test-only JWT secret; they do not connect to the configured development database:

```powershell
Set-Location backend
python -m pip install -r requirements.txt
python -m pytest -q
```

Build the frontend production bundle:

```powershell
Set-Location frontend
npm ci
npm run build
```

## Deployment

For production configuration, secrets, database access, CORS, and HTTPS requirements, follow the [deployment guide](./docs/deployment.md). Do not expose PostgreSQL directly to the public internet.

## Demo checklist

- [ ] Sign in or register an account; verify sign-out and protected access.
- [ ] Review dashboard inventory, low-stock/out-of-stock, and pending-order summaries.
- [ ] Create or update a product, category, and supplier; confirm relationship protections on deletion.
- [ ] Create a sales order, progress its status, and confirm stock changes and cancellation behavior.
- [ ] Create a purchase order, progress it through receipt, and confirm stock is added once.
- [ ] Record stock-in and stock-out operations, then inspect inventory transaction history.
- [ ] Confirm no demand-forecasting/model-training screens are represented as implemented; that work belongs to the separate ML team.
