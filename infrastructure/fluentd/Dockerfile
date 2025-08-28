# Fluentd Docker Image for BarnHand Log Aggregation
FROM fluent/fluentd:v1.16-1

USER root

# Install required gems for log processing
RUN apk add --no-cache --update --virtual .build-deps \
        sudo build-base ruby-dev \
    && sudo gem install \
        fluent-plugin-elasticsearch \
        fluent-plugin-postgresql \
        fluent-plugin-prometheus \
        fluent-plugin-record-modifier \
        fluent-plugin-multi-format-parser \
    && sudo gem sources --clear-all \
    && apk del .build-deps \
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/* /var/tmp/* /usr/lib/ruby/gems/*/cache/*.gem

# Copy configuration files
COPY fluent.conf /fluentd/etc/
COPY plugins /fluentd/plugins

# Create directories for logs
RUN mkdir -p /fluentd/log /fluentd/buffer

# Set proper permissions
RUN chown -R fluent:fluent /fluentd

USER fluent

EXPOSE 24224 24224/udp 9880

CMD ["fluentd"]