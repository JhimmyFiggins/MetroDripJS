# Architecture and Operations

**Status:** Verified Operational Topology & Infrastructure Plan  
**Project:** MetroDripJS Urban Streetwear E-Commerce Platform  
**Target Environment:** Docker Compose / Containerized Microservices & Local Dev Runbook  
**Date:** 2026-09-27  

---

## 1. System Topology and Container Architecture

MetroDripJS follows a decoupled, asynchronous microservices architecture. All external traffic from mobile clients and web consoles enters through a single **API Gateway** on Port `8000`, which handles reverse proxying, distributed tracing header injection, and path-based routing to private service containers on an isolated internal network.

```
                              ┌───────────────────────────────────┐
                              │        Client Applications        │
                              │ Expo Mobile App / Web Consoles    │
                              └─────────────────┬─────────────────┘
                                                │ HTTP / Port 8000
                                                ▼
                              ┌───────────────────────────────────┐
                              │        API Gateway (Edge)         │
                              │ Nginx / Python Dev Proxy (:8000)  │
                              └─────────────────┬─────────────────┘
                                                │ Injects X-Correlation-ID
             ┌──────────────────┬───────────────┼───────────────┬──────────────────┐
             │ :8001            │ :8002         │ :8003         │ :8004            │ :8005
             ▼                  ▼               ▼               ▼                  ▼
      ┌─────────────┐    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    ┌─────────────┐
      │  Identity   │    │   Catalog   │ │   Orders    │ │ Fulfillment │    │   Content   │
      │   Service   │    │   Service   │ │   Service   │ │   Service   │    │   Service   │
      └──────┬──────┘    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘    └──────┬──────┘
             │                  │               │               │                  │
             ▼                  ▼               ▼               ▼                  ▼
      ┌─────────────┐    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    ┌─────────────┐
      │ db_identity │    │ db_catalog  │ │  db_orders  │ │db_fulfillmnt│    │ db_content  │
      └─────────────┘    └─────────────┘ └─────────────┘ └─────────────┘    └─────────────┘
```

---

## 2. Port Allocations & Gateway Routing Matrix

| Container / Service | Host Port | Internal Port | Target Database | Directory / Config | Path Routing Rules |
|---|---|---|---|---|---|
| **API Gateway** | `8000` | `8000` | N/A (Stateless) | [gateway/](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/gateway) | Proxies all `/api/` prefixes; aggregates `/health/` |
| **Identity Service** | `8001` | `8001` | `db_identity` | [services/identity/](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/services/identity) | `/api/v1/auth/` |
| **Catalog Service** | `8002` | `8002` | `db_catalog` | [services/catalog/](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/services/catalog) | `/api/v1/catalog/` |
| **Orders Service** | `8003` | `8003` | `db_orders` | [services/orders/](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/services/orders) | `/api/v1/orders/`, `/api/merchant/orders/` |
| **Fulfillment Service** | `8004` | `8004` | `db_fulfillment` | [services/fulfillment/](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/services/fulfillment) | `/api/v1/fulfillment/` |
| **Content Service** | `8005` | `8005` | `db_content` | [services/content/](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/services/content) | `/api/v1/content/`, `/api/merchant/banners/` |
| **PostgreSQL 16** | `5432` | `5432` | 5 Databases | [database/](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/database) | Private database container on Docker internal bridge |

---

## 3. Technology Stack & Design Decisions

### Stack Rationale
- **Core Framework**: Python 3.11+ with Django 5.x & Django REST Framework (DRF). Provides proven ORM capabilities, robust database migrations, and mature security primitives.
- **Relational Database**: PostgreSQL 16. Multi-database setup (`db_identity`, `db_catalog`, etc.) provides physical schema isolation and supports ACID transactions with `select_for_update` row locking for stock holds.
- **Edge Reverse Proxy**: Nginx (Production) and Python HTTP Gateway ([gateway/gateway.py](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/gateway/gateway.py)) for local development. Injects distributed tracing headers (`X-Correlation-ID`) across all requests.
- **Mobile Frontend**: React Native & Expo SDK 52. Cross-platform native mobile experience with adaptive web fallbacks for review.
- **Web Consoles**: Vanilla HTML5, CSS3, and ES6 JavaScript. Zero heavy build tools required for merchant operations; fast loading and zero bundle vulnerabilities.

### Windows Dev Resolution: IPv4 Explicit Binding
In local Windows environments, requests to `localhost` can incur an initial 2000ms delay due to dual-stack IPv6 DNS resolution fallback (`::1` failing before `127.0.0.1`). All local run scripts, gateway routes, and inter-service HTTP configurations explicitly bind to `http://127.0.0.1:<port>`.

---

## 4. Operational Runbooks

### Runbook 1: Automated Local Verification
To execute the complete end-to-end integration suite verifying all 5 services, the gateway, COD saga checkout, stock decrements, and merchant UI parity:

```powershell
metrodrip_backend\.venv\Scripts\python.exe scripts\verify_microservices_e2e.py
```

### Runbook 2: Starting Local Microservices Individually

```powershell
# Service 1: Identity (Port 8001)
cd services\identity
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8001 --noreload

# Service 2: Catalog (Port 8002)
cd services\catalog
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8002 --noreload

# Service 3: Orders (Port 8003)
cd services\orders
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8003 --noreload

# Service 4: Fulfillment (Port 8004)
cd services\fulfillment
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8004 --noreload

# Service 5: Content (Port 8005)
cd services\content
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8005 --noreload

# Service 6: API Gateway (Port 8000)
python gateway\gateway.py
```

### Runbook 3: Production Docker Compose Deployment
The root repository includes [docker-compose.microservices.yml](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/docker-compose.microservices.yml) orchestrating the complete stack:

```sh
# Build and launch all 5 microservices, PostgreSQL 16, and Nginx gateway
docker compose -f docker-compose.microservices.yml up --build -d

# Verify aggregated health
curl -i http://localhost:8000/health/
```

### Runbook 4: Expired Stock Holds Sweeper
Abandoned reservations are freed automatically via the catalog hold sweeper. To manually trigger the cleanup:

```powershell
# Method A: Via Catalog Management Command
cd services\catalog
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py release_expired_holds

# Method B: Via Standalone Sweeper Script
metrodrip_backend\.venv\Scripts\python.exe scripts\sweep_expired_holds.py
```

---

## 5. Observability, Health Checks, and Incident Response

### Gateway Health Check Aggregator
The API Gateway exposes an aggregated health check endpoint at `GET /health/`:
```json
{
  "status": "healthy",
  "gateway": "online",
  "services": {
    "identity": {"status": "healthy", "port": 8001},
    "catalog": {"status": "healthy", "port": 8002},
    "orders": {"status": "healthy", "port": 8003},
    "fulfillment": {"status": "healthy", "port": 8004},
    "content": {"status": "healthy", "port": 8005}
  }
}
```
If any downstream microservice fails, the gateway returns `503 Service Unavailable` with details on the offending container.

### Distributed Tracing with Correlation IDs
Every incoming request through the Gateway receives a unique correlation header:
```http
X-Correlation-ID: c5e4b2d1-9f8a-4c3e-b1a2-8d7e6f5a4b3c
```
This header is propagated across inter-service calls (Orders → Catalog, Orders → Fulfillment), allowing unified log correlation in central log collectors (Grafana Loki, ELK, Datadog).

---

## 6. Disaster Recovery & Rollback Procedures

1. **Service Container Failure**:
   - Docker Compose declares `restart: unless-stopped`. Crashed containers automatically reboot.
   - If a specific service deployment is defective, rollback that single container image without redeploying the remaining 4 services.
2. **Database Backup & Recovery**:
   - Baseline monolithic backup preserved at `metrodrip_backend/db.sqlite3.baseline.bak`.
   - PostgreSQL volume `pgdata` can be backed up via standard `pg_dump`:
     ```sh
     docker exec -t metrodrip_postgres pg_dump -U postgres db_orders > backup_orders_$(date +%Y%m%d).sql
     ```
3. **Rollback Window**:
   - Service releases are zero-downtime using rolling updates.
   - If schema rollback is needed, each service maintains an independent Django migration timeline (`python manage.py migrate <app_name> <target_migration>`).
