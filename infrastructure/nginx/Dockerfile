# Nginx reverse proxy for production
FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create directories for certificates
RUN mkdir -p /etc/nginx/certs

# Create nginx user if not exists
RUN adduser -D -s /bin/false nginx || true

# Set proper permissions
RUN chown -R nginx:nginx /var/cache/nginx
RUN chown -R nginx:nginx /var/log/nginx
RUN chown -R nginx:nginx /etc/nginx/certs

# Create pid directory
RUN mkdir -p /var/run/nginx
RUN chown -R nginx:nginx /var/run/nginx

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

# Expose ports
EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]