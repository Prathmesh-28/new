// API client for Headroom services

const API_GATEWAY_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:3000/api';
const FORECAST_SERVICE_URL = process.env.NEXT_PUBLIC_FORECAST_SERVICE_URL || 'http://localhost:8001';
const CREDIT_SERVICE_URL = process.env.NEXT_PUBLIC_CREDIT_SERVICE_URL || 'http://localhost:8002';
const CAPITAL_SERVICE_URL = process.env.NEXT_PUBLIC_CAPITAL_SERVICE_URL || 'http://localhost:8003';

// Generic API call function
async function apiCall(endpoint: string, options: RequestInit = {}) {
  const url = `${API_GATEWAY_URL}${endpoint}`;

  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  // Add API key if available
  const apiKey = process.env.NEXT_PUBLIC_API_KEY;
  if (apiKey) {
    config.headers = {
      ...config.headers,
      'x-api-key': apiKey,
    };
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API call failed: ${response.status} ${error}`);
  }

  return response.json();
}

// Forecast Service API
export const forecastApi = {
  // Get forecast for a tenant
  async getForecast(tenantId: string) {
    return apiCall(`/forecast/forecast?tenant_id=${tenantId}`);
  },

  // Generate new forecast
  async generateForecast(tenantId: string, data: any) {
    return apiCall('/forecast/forecast', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId, ...data }),
    });
  },

  // Get forecast alerts
  async getAlerts(tenantId: string) {
    return apiCall(`/forecast/alerts?tenant_id=${tenantId}`);
  },
};

// Credit Service API
export const creditApi = {
  // Get credit applications for tenant
  async getApplications(tenantId: string) {
    return apiCall(`/credit/applications?tenant_id=${tenantId}`);
  },

  // Create credit application
  async createApplication(tenantId: string, data: any) {
    return apiCall('/credit/applications', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId, ...data }),
    });
  },

  // Get credit offers
  async getOffers(tenantId: string) {
    return apiCall(`/credit/offers?tenant_id=${tenantId}`);
  },
};

// Capital Service API
export const capitalApi = {
  // Get capital raises for tenant
  async getRaises(tenantId: string) {
    return apiCall(`/capital/raises?tenant_id=${tenantId}`);
  },

  // Create capital raise
  async createRaise(tenantId: string, data: any) {
    return apiCall('/capital/raises', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId, ...data }),
    });
  },

  // Get investors
  async getInvestors(raiseId: string) {
    return apiCall(`/capital/raises/${raiseId}/investors`);
  },
};

// Admin API (local Next.js API routes)
export const adminApi = {
  // Login
  async login(email: string, password: string) {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    return response.json();
  },

  // Logout
  async logout() {
    const response = await fetch('/api/admin/logout', {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Logout failed');
    }

    return response.json();
  },

  // Get current session
  async getSession() {
    const response = await fetch('/api/admin/session');

    if (!response.ok) {
      throw new Error('Session check failed');
    }

    return response.json();
  },
};