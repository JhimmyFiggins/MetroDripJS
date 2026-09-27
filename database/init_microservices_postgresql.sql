-- PostgreSQL Multi-Database Initialization for MetroDripJS Microservices
-- Enforces database-per-service isolation with dedicated credentials per service.

-- 1. Create dedicated database users
CREATE USER identity_user WITH ENCRYPTED PASSWORD 'identity_dev_secret_2026';
CREATE USER catalog_user WITH ENCRYPTED PASSWORD 'catalog_dev_secret_2026';
CREATE USER orders_user WITH ENCRYPTED PASSWORD 'orders_dev_secret_2026';
CREATE USER fulfillment_user WITH ENCRYPTED PASSWORD 'fulfillment_dev_secret_2026';
CREATE USER content_user WITH ENCRYPTED PASSWORD 'content_dev_secret_2026';

-- 2. Create isolated databases
CREATE DATABASE db_identity OWNER identity_user;
CREATE DATABASE db_catalog OWNER catalog_user;
CREATE DATABASE db_orders OWNER orders_user;
CREATE DATABASE db_fulfillment OWNER fulfillment_user;
CREATE DATABASE db_content OWNER content_user;

-- 3. Revoke public connect privileges and restrict to owning role
REVOKE ALL ON DATABASE db_identity FROM PUBLIC;
GRANT ALL PRIVILEGES ON DATABASE db_identity TO identity_user;

REVOKE ALL ON DATABASE db_catalog FROM PUBLIC;
GRANT ALL PRIVILEGES ON DATABASE db_catalog TO catalog_user;

REVOKE ALL ON DATABASE db_orders FROM PUBLIC;
GRANT ALL PRIVILEGES ON DATABASE db_orders TO orders_user;

REVOKE ALL ON DATABASE db_fulfillment FROM PUBLIC;
GRANT ALL PRIVILEGES ON DATABASE db_fulfillment TO fulfillment_user;

REVOKE ALL ON DATABASE db_content FROM PUBLIC;
GRANT ALL PRIVILEGES ON DATABASE db_content TO content_user;
