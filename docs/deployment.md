# NextGenERP deployment guide

This guide describes production configuration for the existing Dockerized React, FastAPI, and PostgreSQL application. It does not deploy resources. The checked-in Compose file is intended for local use and must not be exposed directly as a public production service.

## Production topology

Use a private application network with:

1. A PostgreSQL service reachable only from the backend application network.
2. The FastAPI backend with a private connection to PostgreSQL.
3. The Nginx frontend behind a production ingress or reverse proxy that terminates HTTPS.

The frontend Nginx configuration serves the SPA and proxies supported API paths to the backend. Prefer same-origin browser requests through this proxy; keep the backend and PostgreSQL out of the public ingress. The Compose frontend currently publishes port `8080` without TLS and its PostgreSQL port is intended only for local development. Do not make either plain-HTTP service an internet-facing endpoint.

## Required configuration

Provide runtime values through the hosting platform's secret/configuration facility. Do not commit a production `.env` file, put secrets in container images, or expose them in build logs.

| Variable | Required | Production guidance |
| --- | --- | --- |
| `DATABASE_URL` | Yes, backend | SQLAlchemy URL using the `postgresql+psycopg` driver. Use a dedicated least-privilege database role, URL-encode special characters in credentials, and require TLS for managed/external PostgreSQL (for example, the provider's required `sslmode` setting). Keep the hostname private to the application network. |
| `JWT_SECRET_KEY` | Yes, backend | At least 32 random characters; use a unique value per environment, store it in a secret manager, and plan for the effect of rotation (existing tokens stop validating). |
| `CORS_ORIGINS` | Yes, backend | Comma-separated exact browser origins, including scheme and any non-default port, with no path and no wildcard. For same-origin production access, configure the real frontend origin (for example, `https://erp.example.com`). If the browser calls a separate API origin directly, list the frontend origin, not the API origin. |
| `POSTGRES_USER` | Compose database only | Used to initialize the Compose database. For production-managed PostgreSQL, use that service's credential/role configuration instead. |
| `POSTGRES_PASSWORD` | Compose database only | Local Compose database initialization only. Never use a placeholder or commit this value. |
| `POSTGRES_DB` | Compose database only | Local Compose database name. |
| `POSTGRES_PORT` | Compose database only | Local host port only; the provided Compose file binds it to loopback. Do not publish PostgreSQL publicly. |
| `VITE_API_BASE_URL` | Frontend build, optional | Leave empty for same-origin proxying. If building for a separate API origin, supply the public HTTPS API base URL at build time; this is public configuration, not a secret. |

`API_PROXY_TARGET` is for the Vite development server and is not the production API routing mechanism.

## Database access and persistence

- Use a managed/private PostgreSQL service or a private database container with persistent storage, backups, retention, and tested restore procedures.
- Allow inbound database traffic only from the backend's network identity/security group. Do not create a public PostgreSQL endpoint or bind the database to a public host interface.
- Use an application role with only the required database privileges; keep administrative credentials separate.
- The current application creates missing tables with SQLAlchemy `create_all` at startup. It does not include a versioned schema migration system. Review schema changes and existing data carefully before upgrading; take a restorable backup and plan migrations explicitly rather than assuming startup upgrades existing tables.
- The Compose named volume is for local persistence only. Protect and back up production data independently.

## CORS and HTTPS

- Set `CORS_ORIGINS` to the exact HTTPS origin used by users, such as `https://erp.example.com`. Separate multiple origins with commas. The backend rejects `*`.
- Keep TLS termination at a trusted ingress/reverse proxy and redirect HTTP to HTTPS. Use valid certificates and renew them automatically.
- Forward the original host and protocol from the trusted proxy. Configure the platform so direct public access to backend and database ports is blocked.
- Add ingress-level login rate limiting before public launch. Application-level rate limiting, user roles, and account administration are not implemented in this repository.
- The current frontend stores the access token in session storage. Review the deployment's browser security policy and exposure model before launch.

## Deployment checklist

1. Build backend and frontend images from reviewed source; pin and scan release dependencies/images according to your organization's process.
2. Configure `DATABASE_URL`, `JWT_SECRET_KEY`, and `CORS_ORIGINS` in the backend runtime environment. Do not bake secrets into images or Vite build variables.
3. Provision private PostgreSQL access, durable storage, backups, and monitoring before connecting the backend.
4. Place the frontend behind an HTTPS ingress; route browser API paths through the configured frontend proxy to the private backend.
5. Ensure only the HTTPS ingress is externally reachable. Do not publish PostgreSQL, and do not expose the backend port directly.
6. Run the backend test suite and frontend production build, then verify `/health`, authentication, and the demo workflows in the target environment.
7. Document backup restoration, JWT key rotation, and application/database upgrade procedures for operators.

No cloud resources are created by these steps. Demand forecasting and other machine-learning/model-training workloads are owned by the separate ML module/team and are outside this application's deployment scope.
