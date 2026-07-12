FROM grafana/grafana:11.4.0

ENV GF_INSTALL_PLUGINS=grafana-clickhouse-datasource

COPY provisioning /etc/grafana/provisioning
COPY branding /usr/share/grafana/public/img

USER root
RUN chown -R 472:0 /etc/grafana/provisioning /usr/share/grafana/public/img
USER grafana

EXPOSE 3000
