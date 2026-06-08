"use client";

import {
  Admin, Resource, List, Datagrid, TextField, DateField, EmailField,
  NumberField, BooleanField, SelectField, Show, SimpleShowLayout,
  Edit, SimpleForm, TextInput, SelectInput, NumberInput, BooleanInput,
  Create, ReferenceField, FunctionField, useRecordContext,
  defaultDarkTheme,
} from "react-admin";
import { adminDataProvider } from "@/lib/adminDataProvider";
import { adminAuthProvider } from "@/lib/adminAuthProvider";

const theme = {
  ...defaultDarkTheme,
  palette: {
    ...defaultDarkTheme.palette,
    mode: "dark" as const,
    primary:    { main: "#C9A227" },
    secondary:  { main: "#8A7A5A" },
    background: { default: "#131310", paper: "#1e1e14" },
  },
  components: {
    ...defaultDarkTheme.components,
    MuiAppBar: { styleOverrides: { root: { backgroundColor: "#1e1e14", borderBottom: "1px solid #3a3820" } } },
    MuiDrawer: { styleOverrides: { paper: { backgroundColor: "#131310", borderRight: "1px solid #3a3820" } } },
  },
};

// ── Severity badge ────────────────────────────────────────────────────────────
const SeverityBadge = () => {
  const record = useRecordContext();
  if (!record) return null;
  const colors: Record<string, string> = { critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e" };
  return (
    <span style={{ color: colors[record.severity] ?? "#999", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>
      {record.severity}
    </span>
  );
};

// ── Tenants ───────────────────────────────────────────────────────────────────
const TenantList = () => (
  <List perPage={25} sort={{ field: "created_at", order: "DESC" }}>
    <Datagrid rowClick="show">
      <TextField source="name" />
      <TextField source="company_name" />
      <SelectField source="subscription_tier" choices={[
        { id: "starter", name: "Starter" }, { id: "growth", name: "Growth" },
        { id: "pro", name: "Pro" }, { id: "capital", name: "Capital" },
      ]} />
      <SelectField source="status" choices={[
        { id: "active", name: "Active" }, { id: "suspended", name: "Suspended" },
        { id: "trial", name: "Trial" },
      ]} />
      <DateField source="created_at" showTime />
    </Datagrid>
  </List>
);

const TenantShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" />
      <TextField source="name" />
      <TextField source="company_name" />
      <TextField source="subscription_tier" />
      <TextField source="status" />
      <DateField source="created_at" showTime />
    </SimpleShowLayout>
  </Show>
);

const TenantEdit = () => (
  <Edit>
    <SimpleForm>
      <TextInput source="name" />
      <TextInput source="company_name" />
      <SelectInput source="subscription_tier" choices={[
        { id: "starter", name: "Starter" }, { id: "growth", name: "Growth" },
        { id: "pro", name: "Pro" }, { id: "capital", name: "Capital" },
      ]} />
      <SelectInput source="status" choices={[
        { id: "active", name: "Active" }, { id: "suspended", name: "Suspended" }, { id: "trial", name: "Trial" },
      ]} />
    </SimpleForm>
  </Edit>
);

// ── Users ─────────────────────────────────────────────────────────────────────
const UserList = () => (
  <List perPage={25} sort={{ field: "created_at", order: "DESC" }}>
    <Datagrid rowClick="show">
      <EmailField source="email" />
      <TextField source="full_name" />
      <SelectField source="role" choices={[
        { id: "owner", name: "Owner" }, { id: "accountant", name: "Accountant" },
        { id: "investor", name: "Investor" }, { id: "admin", name: "Admin" },
      ]} />
      <SelectField source="status" choices={[
        { id: "active", name: "Active" }, { id: "inactive", name: "Inactive" },
      ]} />
      <BooleanField source="is_staff" label="Staff" />
      <DateField source="created_at" showTime />
    </Datagrid>
  </List>
);

const UserEdit = () => (
  <Edit>
    <SimpleForm>
      <TextInput source="email" />
      <TextInput source="full_name" />
      <SelectInput source="role" choices={[
        { id: "owner", name: "Owner" }, { id: "accountant", name: "Accountant" },
        { id: "investor", name: "Investor" }, { id: "admin", name: "Admin" },
      ]} />
      <SelectInput source="status" choices={[
        { id: "active", name: "Active" }, { id: "inactive", name: "Inactive" },
      ]} />
      <BooleanInput source="is_staff" label="Staff access" />
    </SimpleForm>
  </Edit>
);

// ── Alerts ────────────────────────────────────────────────────────────────────
const AlertList = () => (
  <List perPage={25} sort={{ field: "created_at", order: "DESC" }}>
    <Datagrid rowClick="show">
      <TextField source="alert_type" />
      <FunctionField label="Severity" render={() => <SeverityBadge />} />
      <TextField source="message" />
      <BooleanField source="is_read" label="Read" />
      <DateField source="created_at" showTime />
    </Datagrid>
  </List>
);

// ── Credit Applications ───────────────────────────────────────────────────────
const CreditList = () => (
  <List perPage={25} sort={{ field: "created_at", order: "DESC" }}>
    <Datagrid rowClick="show">
      <TextField source="status" />
      <NumberField source="loan_amount" options={{ style: "currency", currency: "INR" }} />
      <NumberField source="underwriting_score" />
      <TextField source="fraud_check_status" />
      <DateField source="created_at" showTime />
    </Datagrid>
  </List>
);

// ── Capital Raises ────────────────────────────────────────────────────────────
const CapitalList = () => (
  <List perPage={25} sort={{ field: "created_at", order: "DESC" }}>
    <Datagrid rowClick="show">
      <TextField source="track" />
      <TextField source="status" />
      <NumberField source="target_amount" options={{ style: "currency", currency: "INR" }} />
      <NumberField source="raised_amount" options={{ style: "currency", currency: "INR" }} />
      <DateField source="created_at" showTime />
    </Datagrid>
  </List>
);

// ── Bank Connections ──────────────────────────────────────────────────────────
const BankList = () => (
  <List perPage={25}>
    <Datagrid rowClick="show">
      <TextField source="provider" />
      <TextField source="account_name" />
      <TextField source="status" />
      <DateField source="last_sync" showTime />
    </Datagrid>
  </List>
);

// ── Transactions ──────────────────────────────────────────────────────────────
const TransactionList = () => (
  <List perPage={25} sort={{ field: "date", order: "DESC" }}>
    <Datagrid>
      <DateField source="date" />
      <NumberField source="amount" options={{ style: "currency", currency: "INR" }} />
      <TextField source="category" />
      <TextField source="description" />
      <TextField source="counterparty" />
      <BooleanField source="is_recurring" label="Recurring" />
    </Datagrid>
  </List>
);

// ── Audit Logs ────────────────────────────────────────────────────────────────
const AuditList = () => (
  <List perPage={25} sort={{ field: "timestamp", order: "DESC" }}>
    <Datagrid>
      <TextField source="action" />
      <TextField source="resource_type" />
      <TextField source="resource_id" />
      <DateField source="timestamp" showTime />
    </Datagrid>
  </List>
);

// ── App ───────────────────────────────────────────────────────────────────────
export default function AdminApp() {
  return (
    <Admin
      dataProvider={adminDataProvider}
      authProvider={adminAuthProvider}
      theme={theme}
      title="Headroom Super Admin"
      loginPage={false}
      basename="/admin/panel"
    >
      <Resource name="tenants"             options={{ label: "Tenants" }}              list={TenantList}      show={TenantShow}  edit={TenantEdit} />
      <Resource name="users"               options={{ label: "Users" }}                list={UserList}                           edit={UserEdit}   />
      <Resource name="alerts"              options={{ label: "Alerts" }}               list={AlertList}       />
      <Resource name="credit-applications" options={{ label: "Credit Applications" }}  list={CreditList}      />
      <Resource name="capital-raises"      options={{ label: "Capital Raises" }}       list={CapitalList}     />
      <Resource name="bank-connections"    options={{ label: "Bank Connections" }}     list={BankList}        />
      <Resource name="transactions"        options={{ label: "Transactions" }}         list={TransactionList} />
      <Resource name="audit-logs"          options={{ label: "Audit Logs" }}           list={AuditList}       />
    </Admin>
  );
}
