ALTER TABLE construction_projects
    ALTER COLUMN invest_total TYPE NUMERIC(16,2) USING ROUND(invest_total::numeric, 2),
    ALTER COLUMN labor_cost TYPE NUMERIC(16,2) USING ROUND(labor_cost::numeric, 2),
    ALTER COLUMN contract_amount TYPE NUMERIC(16,2) USING ROUND(contract_amount::numeric, 2),
    ALTER COLUMN margin_amount TYPE NUMERIC(16,2) USING ROUND(margin_amount::numeric, 2);

ALTER TABLE construction_units
    ALTER COLUMN contract_amount TYPE NUMERIC(16,2) USING ROUND(contract_amount::numeric, 2);

ALTER TABLE construction_workers
    ALTER COLUMN unit_price TYPE NUMERIC(16,2) USING ROUND(unit_price::numeric, 2);
