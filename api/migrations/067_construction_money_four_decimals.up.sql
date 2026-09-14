ALTER TABLE construction_projects
    ALTER COLUMN invest_total TYPE NUMERIC(18,4) USING invest_total::numeric(18,4),
    ALTER COLUMN labor_cost TYPE NUMERIC(18,4) USING labor_cost::numeric(18,4),
    ALTER COLUMN contract_amount TYPE NUMERIC(18,4) USING contract_amount::numeric(18,4),
    ALTER COLUMN margin_amount TYPE NUMERIC(18,4) USING margin_amount::numeric(18,4);

ALTER TABLE construction_units
    ALTER COLUMN contract_amount TYPE NUMERIC(18,4) USING contract_amount::numeric(18,4);

ALTER TABLE construction_workers
    ALTER COLUMN unit_price TYPE NUMERIC(18,4) USING unit_price::numeric(18,4);

COMMENT ON COLUMN construction_projects.invest_total IS '项目总投资金额，单位万元，最多保留4位小数';
COMMENT ON COLUMN construction_projects.labor_cost IS '项目总劳务费金额，单位万元，最多保留4位小数';
COMMENT ON COLUMN construction_projects.contract_amount IS '项目合同金额，单位万元，最多保留4位小数';
COMMENT ON COLUMN construction_projects.margin_amount IS '项目保证金金额，单位万元，最多保留4位小数';
COMMENT ON COLUMN construction_units.contract_amount IS '参建单位合同金额，单位万元，最多保留4位小数';
COMMENT ON COLUMN construction_workers.unit_price IS '工人计量单价，最多保留4位小数';
