FROM python:3.9-slim

# Set up working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . /app/

# Set environment variables
ENV MODEL_NAME="briaai/RMBG-1.4"

# Expose port for API
EXPOSE 5000

# Command to run the server
CMD ["python", "server.py"]
