FROM grafana/grafana:11.4.0

# Install at build time: GF_INSTALL_PLUGINS would download the plugin on every
# cold start, because the container disk is ephemeral.
RUN grafana cli --pluginsDir "$GF_PATHS_PLUGINS" plugins install grafana-clickhouse-datasource 4.22.1

COPY provisioning /etc/grafana/provisioning
COPY branding /usr/share/grafana/public/img

USER root
RUN chown -R 472:0 /etc/grafana/provisioning /usr/share/grafana/public/img
USER grafana

EXPOSE 3000
