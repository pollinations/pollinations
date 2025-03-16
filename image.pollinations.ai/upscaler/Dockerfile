FROM python:3.12-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Run Gunicorn for production
CMD ["gunicorn", "-c", "gunicorn_config.py", "app:app"]
