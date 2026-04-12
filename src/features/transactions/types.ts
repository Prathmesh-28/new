export interface Transaction {
  id:            string;
  tenant_id:     string;
  account_id:    string;
  date:          string;
  amount:        number;
  currency:      string;
  description:   string;
  merchant_name: string | null;
  category:      string | null;
  source:        string;
  created_at:    string;
}
