ALTER TABLE construction_workers
    ALTER COLUMN unit_price TYPE NUMERIC(16,2) USING ROUND(unit_price::numeric, 2);

ALTER TABLE construction_units
    ALTER COLUMN contract_amount TYPE NUMERIC(16,2) USING ROUND(contract_amount::numeric, 2);

ALTER TABLE construction_projects
    ALTER COLUMN invest_total TYPE NUMERIC(16,2) USING ROUND(invest_total::numeric, 2),
    ALTER COLUMN labor_cost TYPE NUMERIC(16,2) USING ROUND(labor_cost::numeric, 2),
    ALTER COLUMN contract_amount TYPE NUMERIC(16,2) USING ROUND(contract_amount::numeric, 2),
    ALTER COLUMN margin_amount TYPE NUMERIC(16,2) USING ROUND(margin_amount::numeric, 2);

COMMENT ON COLUMN construction_projects.invest_total IS '项目总投资金额，单位万元，最多保留2位小数';
COMMENT ON COLUMN construction_projects.labor_cost IS '项目总劳务费金额，单位万元，最多保留2位小数';
COMMENT ON COLUMN construction_projects.contract_amount IS '项目合同金额，单位万元，最多保留2位小数';
COMMENT ON COLUMN construction_projects.margin_amount IS '项目保证金金额，单位万元，最多保留2位小数';
COMMENT ON COLUMN construction_units.contract_amount IS '参建单位合同金额，单位万元，最多保留2位小数';
COMMENT ON COLUMN construction_workers.unit_price IS '工人计量单价，最多保留2位小数';
