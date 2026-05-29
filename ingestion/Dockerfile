FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY load_to_bq.py .
CMD ["python", "load_to_bq.py"]
