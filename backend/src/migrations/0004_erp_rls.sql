-- RLS rollout, Phase 3: the ERP (manufacturing) module — the first MONEY-tier module.
-- All 16 erp_* tables carry tenant_id; every query path (43 reads via q() + 12 multi-
-- statement transactions via withTenant) was routed through lib/tenantDb in the same
-- change. book_* tables stay un-RLS'd (the GL-posting design reads/writes them on
-- separate connections), so enabling FORCE RLS here can't strand a query.
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'erp_boms','erp_bom_items','erp_bom_operations',
    'erp_work_orders','erp_work_order_items','erp_work_order_operations','erp_job_cards',
    'erp_material_requests','erp_material_request_items',
    'erp_production_plans','erp_production_plan_items','erp_production_plan_materials',
    'erp_warehouses','erp_putaway_rules','erp_supplier_price_breaks','erp_item_valuation'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$, t);
  END LOOP;
END
$rls$;
