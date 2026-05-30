{% set boutiques = [('sed', 'SED', 'LYON PRESQUILE'), ('acc', 'ACC', 'NANTES COMMERCE')] %}

WITH unioned AS (
{% for code_lower, code_upper, bname in boutiques %}
  SELECT
    '{{ code_upper }}'                                                      AS boutique_id,
    '{{ bname }}'                                                           AS boutique_name,
    CAST(Id AS STRING)                                                      AS id,
    CAST(DocumentNumber AS STRING)                                          AS document_number,
    SAFE_CAST(SUBSTR(CAST(DocumentDate AS STRING), 1, 10) AS DATE)         AS document_date,
    SAFE_CAST(DocumentType AS INT64)                                        AS document_type,
    CASE SAFE_CAST(DocumentType AS INT64)
      WHEN 2 THEN 'Facture'
      WHEN 3 THEN 'Avoir'
      WHEN 1 THEN 'Commande'
      ELSE 'Autre'
    END                                                                     AS document_type_label,
    SAFE_CAST(DocumentType AS INT64) = 2                                    AS is_valid_sale,
    CAST(CustomerId AS STRING)                                              AS customer_id,
    CONCAT('{{ code_upper }}', '|', CAST(CustomerId AS STRING))             AS customer_key,
    CAST(StorehouseId AS STRING)                                            AS storehouse_id,
    SAFE_CAST(AmountVatExcluded AS FLOAT64)                                 AS amount_ht,
    SAFE_CAST(AmountVatIncluded AS FLOAT64)                                 AS amount_ttc,
    SAFE_CAST(DiscountRate AS FLOAT64)                                      AS discount_rate,
    SAFE_CAST(CommitmentsBalanceDue AS FLOAT64)                             AS balance_due
  FROM `{{ env_var('GCP_PROJECT_ID') }}.demo_raw.raw_{{ code_lower }}_saledocument`
  WHERE Id IS NOT NULL AND CAST(Id AS STRING) != ''
    AND CustomerId IS NOT NULL AND CAST(CustomerId AS STRING) != ''
{% if not loop.last %} UNION ALL {% endif %}
{% endfor %}
)

SELECT * FROM unioned
