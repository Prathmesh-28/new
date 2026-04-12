-- Migration: Add Row-Level Security (RLS) for Multi-Tenancy Enforcement
-- Version: 1.1.0
-- Description: Implements database-level tenant isolation using PostgreSQL Row-Level Security

-- Enable RLS on all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_datapoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_raises ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- =======================
-- TENANTS
-- =======================
DROP POLICY IF EXISTS tenants_isolation ON tenants;
CREATE POLICY tenants_isolation ON tenants 
  AS PERMISSIVE 
  FOR ALL 
  USING (id = current_setting('app.current_tenant_id')::UUID);

-- =======================
-- USERS
-- =======================
DROP POLICY IF EXISTS users_isolation ON users;
CREATE POLICY users_isolation ON users 
  AS PERMISSIVE 
  FOR ALL 
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =======================
-- SESSIONS
-- =======================
DROP POLICY IF EXISTS sessions_isolation ON sessions;
CREATE POLICY sessions_isolation ON sessions 
  AS PERMISSIVE 
  FOR ALL 
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =======================
-- BANK CONNECTIONS
-- =======================
DROP POLICY IF EXISTS bank_connections_isolation ON bank_connections;
CREATE POLICY bank_connections_isolation ON bank_connections 
  AS PERMISSIVE 
  FOR ALL 
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =======================
-- TRANSACTIONS
-- =======================
DROP POLICY IF EXISTS transactions_isolation ON transactions;
CREATE POLICY transactions_isolation ON transactions 
  AS PERMISSIVE 
  FOR ALL 
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =======================
-- FORECASTS
-- =======================
DROP POLICY IF EXISTS forecasts_isolation ON forecasts;
CREATE POLICY forecasts_isolation ON forecasts 
  AS PERMISSIVE 
  FOR ALL 
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =======================
-- FORECAST DATAPOINTS
-- =======================
DROP POLICY IF EXISTS forecast_datapoints_isolation ON forecast_datapoints;
CREATE POLICY forecast_datapoints_isolation ON forecast_datapoints 
  AS PERMISSIVE 
  FOR SELECT 
  USING (
    forecast_id IN (
      SELECT id FROM forecasts 
      WHERE tenant_id = current_setting('app.current_tenant_id')::UUID
    )
  );

-- =======================
-- ALERTS
-- =======================
DROP POLICY IF EXISTS alerts_isolation ON alerts;
CREATE POLICY alerts_isolation ON alerts 
  AS PERMISSIVE 
  FOR ALL 
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =======================
-- CREDIT APPLICATIONS
-- =======================
DROP POLICY IF EXISTS credit_applications_isolation ON credit_applications;
CREATE POLICY credit_applications_isolation ON credit_applications 
  AS PERMISSIVE 
  FOR ALL 
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =======================
-- CREDIT OFFERS
-- =======================
DROP POLICY IF EXISTS credit_offers_isolation ON credit_offers;
CREATE POLICY credit_offers_isolation ON credit_offers 
  AS PERMISSIVE 
  FOR SELECT 
  USING (
    credit_application_id IN (
      SELECT id FROM credit_applications 
      WHERE tenant_id = current_setting('app.current_tenant_id')::UUID
    )
  );

-- =======================
-- CAPITAL RAISES
-- =======================
DROP POLICY IF EXISTS capital_raises_isolation ON capital_raises;
CREATE POLICY capital_raises_isolation ON capital_raises 
  AS PERMISSIVE 
  FOR ALL 
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =======================
-- CAPITAL INVESTORS
-- =======================
DROP POLICY IF EXISTS capital_investors_isolation ON capital_investors;
CREATE POLICY capital_investors_isolation ON capital_investors 
  AS PERMISSIVE 
  FOR SELECT 
  USING (
    capital_raise_id IN (
      SELECT id FROM capital_raises 
      WHERE tenant_id = current_setting('app.current_tenant_id')::UUID
    )
  );

-- =======================
-- AUDIT LOG
-- =======================
DROP POLICY IF EXISTS audit_log_isolation ON audit_log;
CREATE POLICY audit_log_isolation ON audit_log 
  AS PERMISSIVE 
  FOR ALL 
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =======================
-- EVENTS
-- =======================
DROP POLICY IF EXISTS events_isolation ON events;
CREATE POLICY events_isolation ON events 
  AS PERMISSIVE 
  FOR ALL 
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =======================
-- RATE LIMITS
-- =======================
DROP POLICY IF EXISTS rate_limits_isolation ON rate_limits;
CREATE POLICY rate_limits_isolation ON rate_limits 
  AS PERMISSIVE 
  FOR ALL 
  USING (
    user_id IN (
      SELECT id FROM users 
      WHERE tenant_id = current_setting('app.current_tenant_id')::UUID
    )
  );

-- =======================
-- ENHANCED CREDIT SCHEMA
-- =======================

-- Add enhanced underwriting fields to credit_applications
ALTER TABLE credit_applications 
ADD COLUMN IF NOT EXISTS underwriting_score INTEGER CHECK (underwriting_score >= 0 AND underwriting_score <= 100),
ADD COLUMN IF NOT EXISTS score_breakdown JSONB,
ADD COLUMN IF NOT EXISTS fraud_check_status VARCHAR(50) DEFAULT 'pending', -- pass | fail | review
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

-- Create credit_active_loans table for tracking accepted loans
CREATE TABLE IF NOT EXISTS credit_active_loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credit_offer_id UUID NOT NULL REFERENCES credit_offers(id),
  disbursed_amount DECIMAL(15, 2) NOT NULL,
  disbursed_at TIMESTAMP NOT NULL,
  total_repaid DECIMAL(15, 2) NOT NULL DEFAULT 0,
  outstanding_balance DECIMAL(15, 2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'current', -- current | paid_off | defaulted | in_review
  next_review_at TIMESTAMP,
  covenant_breach JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_credit_active_loans_tenant_id ON credit_active_loans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_credit_active_loans_status ON credit_active_loans(status);

-- Enable RLS on new table
ALTER TABLE credit_active_loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credit_active_loans_isolation ON credit_active_loans;
CREATE POLICY credit_active_loans_isolation ON credit_active_loans 
  AS PERMISSIVE 
  FOR ALL 
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =======================
-- ENHANCED FORECAST SCHEMA
-- =======================

-- Add strategy/scenarios support
CREATE TABLE IF NOT EXISTS forecast_scenarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- new_hire | contract | slow_month | loan | custom
  parameters JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forecast_scenarios_tenant_id ON forecast_scenarios(tenant_id);

-- Enable RLS on new table
ALTER TABLE forecast_scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS forecast_scenarios_isolation ON forecast_scenarios;
CREATE POLICY forecast_scenarios_isolation ON forecast_scenarios 
  AS PERMISSIVE 
  FOR ALL 
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =======================
-- MIGRATION VALIDATION
-- =======================

-- Create a function to set tenant context
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_id UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', tenant_id::text, false);
END;
$$ LANGUAGE plpgsql;

-- Migration completed successfully
COMMENT ON TABLE tenants IS 'Multi-tenancy anchor. All other tables reference this and have RLS policies enforcing tenant isolation.';
COMMENT ON TABLE users IS 'Users across all tenants. RLS ensures users can only see/modify their own tenant''s data.';
COMMENT ON TABLE credit_active_loans IS 'Active loan tracking with covenant monitoring and repayment tracking.';
COMMENT ON TABLE forecast_scenarios IS 'What-if scenario modeling for forecast alternatives.';
