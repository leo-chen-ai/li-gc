ALTER TABLE construction_workers
    ALTER COLUMN unit_price TYPE BIGINT USING ROUND(unit_price)::BIGINT;

ALTER TABLE construction_units
    ALTER COLUMN contract_amount TYPE BIGINT USING ROUND(contract_amount)::BIGINT;

ALTER TABLE construction_projects
    ALTER COLUMN invest_total TYPE BIGINT USING ROUND(invest_total)::BIGINT,
    ALTER COLUMN labor_cost TYPE BIGINT USING ROUND(labor_cost)::BIGINT,
    ALTER COLUMN contract_amount TYPE BIGINT USING ROUND(contract_amount)::BIGINT,
    ALTER COLUMN margin_amount TYPE BIGINT USING ROUND(margin_amount)::BIGINT;
