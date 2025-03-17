gunicorn -c gunicorn_config.py app:app & 
sudo systemctl restart nginx & 
docker build -t upscaler-service . &
docker run -p 5000:5000 upscaler-service

