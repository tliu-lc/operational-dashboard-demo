{% set boutiques = [('hip', 'HIP'), ('sed', 'SED'), ('hpc', 'HPC'), ('acc', 'ACC')] %}

WITH unioned AS (
{% for code_lower, code_upper in boutiques %}
  SELECT
    '{{ code_upper }}'                              AS boutique_id,
    CAST(Id AS STRING)                              AS id,
    CAST(Caption AS STRING)                         AS caption,
    SAFE_CAST(Main AS BOOL)                         AS is_main,
    CAST(Address_ZipCode AS STRING)                 AS zip_code,
    CAST(Address_City AS STRING)                    AS city,
    SAFE_CAST(Address_Longitude AS FLOAT64)         AS longitude,
    SAFE_CAST(Address_Latitude AS FLOAT64)          AS latitude
  FROM `{{ env_var('GCP_PROJECT_ID') }}.hippocampe_raw.raw_{{ code_lower }}_storehouse`
  WHERE Id IS NOT NULL
{% if not loop.last %} UNION ALL {% endif %}
{% endfor %}
)

SELECT * FROM unioned
