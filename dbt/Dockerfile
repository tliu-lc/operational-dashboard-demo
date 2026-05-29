FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir dbt-bigquery==1.8.*
COPY . .
RUN dbt deps --profiles-dir . --project-dir .
CMD ["sh", "-c", "dbt seed --profiles-dir . --project-dir . && dbt run --profiles-dir . --project-dir ."]
