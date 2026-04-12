-- Seed data for Headroom development/testing
-- This file populates initial tenants, users, and test data

-- Insert default demo tenant
INSERT INTO tenants (name, company_name, subscription_tier, status, features)
VALUES (
  'demo-tenant',
  'Headroom Demo Company',
  'pro',
  'active',
  '{
    "has_forecasting": true,
    "has_credit": true,
    "has_capital": true,
    "has_custom_alerts": true,
    "has_api_access": true
  }'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- Get the tenant ID for subsequent inserts
DO $$
DECLARE
  tenant_id UUID;
  admin_password_hash VARCHAR(255);
BEGIN
  -- Get demo tenant ID
  SELECT id INTO tenant_id FROM tenants WHERE name = 'demo-tenant' LIMIT 1;
  
  IF tenant_id IS NOT NULL THEN
    -- Hash the default password (bcryptjs will be used in app, this is placeholder)
    -- In production, this should be done by the application layer
    admin_password_hash := crypt('headroom@2024', gen_salt('bf'));
    
    -- Insert default admin user
    INSERT INTO users (tenant_id, email, password_hash, full_name, role, status)
    VALUES (
      tenant_id,
      'admin@headroom.local',
      admin_password_hash,
      'Headroom Admin',
      'admin',
      'active'
    ) ON CONFLICT (tenant_id, email) DO NOTHING;
    
    -- Insert demo owner user
    INSERT INTO users (tenant_id, email, password_hash, full_name, role, status)
    VALUES (
      tenant_id,
      'owner@headroom.local',
      admin_password_hash,
      'Demo Business Owner',
      'owner',
      'active'
    ) ON CONFLICT (tenant_id, email) DO NOTHING;
    
    -- Insert demo accountant user
    INSERT INTO users (tenant_id, email, password_hash, full_name, role, status)
    VALUES (
      tenant_id,
      'accountant@headroom.local',
      admin_password_hash,
      'Demo Accountant',
      'accountant',
      'active'
    ) ON CONFLICT (tenant_id, email) DO NOTHING;
  END IF;
END $$;
