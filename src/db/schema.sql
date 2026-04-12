-- Headroom Production Database Schema (PostgreSQL Multi-Tenant)
-- Version: 1.0.0

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =======================
-- MULTI-TENANCY FOUNDATION
-- =======================

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  company_name VARCHAR(255),
  subscription_tier VARCHAR(50) NOT NULL DEFAULT 'starter', -- starter, growth, pro, capital
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, inactive, suspended
  max_bank_connections INTEGER DEFAULT 2,
  features JSONB DEFAULT '{}', -- Feature flags per tier
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_tenants_status ON tenants(status);

-- =======================
-- USERS & AUTHENTICATION
-- =======================

CREATE TYPE user_role AS ENUM ('owner', 'accountant', 'investor', 'admin');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  full_name VARCHAR(255),
  role user_role NOT NULL DEFAULT 'owner',
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, inactive, invited
  external_id VARCHAR(255), -- For OAuth/SSO integration
  last_login TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(tenant_id, email),
  CONSTRAINT valid_email CHECK (email ~ '^[^@]+@[^@]+\.[^@]+$')
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE sessions (
  token VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_tenant_id ON sessions(tenant_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- =======================
-- BANK DATA INGESTION
-- =======================

CREATE TYPE bank_connection_status AS ENUM ('pending', 'connected', 'disconnected', 'error');

CREATE TABLE bank_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(100) NOT NULL, -- plaid, stripe, wave, quickbooks, xero
  account_name VARCHAR(255),
  account_number VARCHAR(50),
  status bank_connection_status NOT NULL DEFAULT 'pending',
  access_token VARCHAR(500),
  refresh_token VARCHAR(500),
  expires_at TIMESTAMP,
  last_sync TIMESTAMP,
  sync_error VARCHAR(500),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bank_connections_tenant_id ON bank_connections(tenant_id);
CREATE INDEX idx_bank_connections_status ON bank_connections(status);

-- =======================
-- NORMALIZED TRANSACTIONS
-- =======================

CREATE TYPE transaction_category AS ENUM (
  'revenue', 'operating_expense', 'capital_expense', 'payroll', 
  'loan_payment', 'tax', 'transfer', 'other'
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_connection_id UUID REFERENCES bank_connections(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  description VARCHAR(500),
  category transaction_category,
  counterparty VARCHAR(255),
  is_recurring BOOLEAN DEFAULT FALSE,
  frequency VARCHAR(50), -- daily, weekly, monthly, quarterly, annual
  confidence_score DECIMAL(3, 2), -- 0-1 score for recurring prediction
  source_id VARCHAR(255) UNIQUE, -- External transaction ID (used for upsert)
  raw_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_tenant_id ON transactions(tenant_id);
CREATE INDEX idx_transactions_bank_connection_id ON transactions(bank_connection_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_category ON transactions(category);

-- =======================
-- FORECASTING ENGINE
-- =======================

CREATE TABLE forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  forecast_date DATE NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  base_model_version VARCHAR(50),
  days_forecasted INTEGER DEFAULT 90,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, complete, error
  model_error VARCHAR(500),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_forecasts_tenant_id ON forecasts(tenant_id);
CREATE INDEX idx_forecasts_forecast_date ON forecasts(forecast_date);

CREATE TABLE forecast_datapoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  forecast_id UUID NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  best_case DECIMAL(15, 2),
  expected_case DECIMAL(15, 2),
  downside_case DECIMAL(15, 2),
  confidence_level DECIMAL(3, 2),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_forecast_datapoints_forecast_id ON forecast_datapoints(forecast_id);
CREATE INDEX idx_forecast_datapoints_date ON forecast_datapoints(date);

-- =======================
-- FORECAST SCENARIOS (versioned, additive overlays)
-- =======================

CREATE TABLE forecast_scenarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('new_hire','contract_won','loan_draw','custom')),
  parameters JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_forecast_scenarios_tenant_id ON forecast_scenarios(tenant_id);
CREATE INDEX idx_forecast_scenarios_active ON forecast_scenarios(active);

-- =======================
-- FUTURE OBLIGATIONS (known outflows: invoices due, tax dates, loan repayments)
-- =======================

CREATE TABLE future_obligations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,    -- negative = outflow, positive = inflow
  obligation_type VARCHAR(100),       -- invoice_due, tax_payment, loan_repayment
  description VARCHAR(500),
  source_ref VARCHAR(255),           -- external ID (invoice number, etc.)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_future_obligations_tenant_id ON future_obligations(tenant_id);
CREATE INDEX idx_future_obligations_due_date ON future_obligations(due_date);

-- =======================
-- ALERTS & INSIGHTS
-- =======================

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_type VARCHAR(100), -- low_cash_warning, anomaly_detected, etc
  severity VARCHAR(50), -- critical, high, medium, low
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  action_url VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alerts_tenant_id ON alerts(tenant_id);
CREATE INDEX idx_alerts_is_read ON alerts(is_read);

-- =======================
-- CREDIT MARKETPLACE
-- =======================

CREATE TYPE credit_app_status AS ENUM (
  'draft', 'submitted', 'approved', 'rejected', 'funded', 'repaid'
);

CREATE TABLE credit_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status credit_app_status NOT NULL DEFAULT 'draft',
  loan_amount DECIMAL(15, 2),
  interest_rate DECIMAL(5, 3),
  term_months INTEGER,
  monthly_payment DECIMAL(15, 2),
  credit_score INTEGER,
  underwriting_score INTEGER CHECK (underwriting_score >= 0 AND underwriting_score <= 100),
  score_breakdown JSONB, -- Signal-by-signal breakdown (cash_flow_stability, revenue_growth, etc.)
  fraud_check_status VARCHAR(50) DEFAULT 'pending', -- pass | fail | review
  funded_date TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_credit_applications_tenant_id ON credit_applications(tenant_id);
CREATE INDEX idx_credit_applications_status ON credit_applications(status);

CREATE TABLE credit_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_application_id UUID NOT NULL REFERENCES credit_applications(id) ON DELETE CASCADE,
  lender_partner VARCHAR(255) NOT NULL, -- stripe_capital, fundbox, capchase, unit, etc.
  product_type VARCHAR(100) NOT NULL, -- revenue_advance, invoice_finance, credit_line, term_loan
  offer_amount DECIMAL(15, 2),
  factor_rate DECIMAL(5, 4), -- e.g., 1.2400
  apr_equivalent DECIMAL(6, 4), -- e.g., 0.2800 = 28%
  repayment_pct DECIMAL(5, 4), -- % of monthly revenue
  repayment_floor DECIMAL(15, 2), -- minimum monthly repayment
  repayment_ceil_pct DECIMAL(5, 4), -- max % of revenue
  term_months_est INTEGER,
  expires_at TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_credit_offers_credit_application_id ON credit_offers(credit_application_id);
CREATE INDEX idx_credit_offers_status ON credit_offers(status);

-- =======================
-- CAPITAL RAISING
-- =======================

CREATE TYPE capital_track AS ENUM ('rev_share', 'reg_cf', 'reg_a_plus');

CREATE TABLE capital_raises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  track capital_track NOT NULL,
  target_amount DECIMAL(15, 2),
  raised_amount DECIMAL(15, 2) DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, active, closed, funded
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_capital_raises_tenant_id ON capital_raises(tenant_id);
CREATE INDEX idx_capital_raises_status ON capital_raises(status);

CREATE TABLE capital_investors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  capital_raise_id UUID NOT NULL REFERENCES capital_raises(id) ON DELETE CASCADE,
  investor_email VARCHAR(255),
  investment_amount DECIMAL(15, 2),
  equity_percentage DECIMAL(5, 2),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- AUDIT LOG
-- =======================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100),
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  changes JSONB,
  ip_address VARCHAR(45),
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_tenant_id ON audit_log(tenant_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);

-- =======================
-- EVENT BUS
-- =======================

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  error_message VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

CREATE INDEX idx_events_tenant_id ON events(tenant_id);
CREATE INDEX idx_events_event_type ON events(event_type);
CREATE INDEX idx_events_processed ON events(processed);

-- =======================
-- RATE LIMITING
-- =======================

CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint VARCHAR(255) NOT NULL,
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  
  UNIQUE(user_id, endpoint, window_start)
);

CREATE INDEX idx_rate_limits_expires_at ON rate_limits(expires_at);
