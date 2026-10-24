FROM docker.io/regolo/brick:2.3.1@sha256:2455aae4f79da96a4d069acceceaf61b1dd5930cb407e7202b145d0ee7537276

RUN hf download regolo/modernbert-capability-classifier \
    --revision 117a42479a0dd8c126cfb0d02eec0719468e4027 \
    --local-dir /app/models/modernbert-capability-classifier

COPY config.yaml /app/config/config.yaml
COPY classifier.py /app/classifier.py
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

ENTRYPOINT ["/app/start.sh"]
