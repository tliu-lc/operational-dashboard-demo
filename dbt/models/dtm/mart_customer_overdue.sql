-- Clients avec des factures impayées (balance_due > 0) — utilisé par le router payments
SELECT
    d.customer_key,
    d.boutique_id,
    d.customer_id,
    c.name                          AS customer_name,
    c.city,
    COUNT(DISTINCT d.id)            AS nb_invoices_overdue,
    SUM(d.balance_due)              AS total_overdue_ht,
    MIN(d.document_date)            AS oldest_overdue_date,
    MAX(d.document_date)            AS latest_overdue_date
FROM {{ ref('stg_sale_documents') }} d
JOIN {{ ref('stg_customers') }} c
    ON c.customer_key = d.customer_key
WHERE d.document_type = 2
  AND d.is_valid_sale = TRUE
  AND d.balance_due > 0
GROUP BY
    d.customer_key,
    d.boutique_id,
    d.customer_id,
    c.name,
    c.city
ORDER BY total_overdue_ht DESC
