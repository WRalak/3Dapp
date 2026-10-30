-- Least-privilege database roles for production.
-- Run once as a superuser (replace the passwords). The app connects as atelier_app,
-- migrations run as atelier_migrator. The app role cannot alter schema, drop tables,
-- or bypass the append-only triggers on "AuditLog" / "OrderStatusHistory".

CREATE ROLE atelier_migrator LOGIN PASSWORD 'change-me-migrator';
CREATE ROLE atelier_app LOGIN PASSWORD 'change-me-app';

GRANT CONNECT ON DATABASE atelier TO atelier_migrator, atelier_app;
GRANT USAGE, CREATE ON SCHEMA public TO atelier_migrator;
GRANT USAGE ON SCHEMA public TO atelier_app;

-- Data access only (no DDL, no TRUNCATE, no TRIGGER management).
ALTER DEFAULT PRIVILEGES FOR ROLE atelier_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atelier_app;
ALTER DEFAULT PRIVILEGES FOR ROLE atelier_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO atelier_app;
ALTER DEFAULT PRIVILEGES FOR ROLE atelier_migrator IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO atelier_app;

-- For an existing database whose tables were created by another owner:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO atelier_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO atelier_app;

-- Audit trail and order history are append-only at the privilege level too.
-- (Run after migrations have created the tables.)
-- REVOKE UPDATE, DELETE ON "AuditLog", "OrderStatusHistory" FROM atelier_app;
