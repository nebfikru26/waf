FROM ghcr.io/coreruleset/coraza-crs:nginx

USER root
# Install Lua module and resty HTTP library
RUN apk update && \
    apk add --no-cache \
        nginx-mod-http-lua \
        lua5.1-cjson \
        luarocks \
        curl && \
    luarocks --lua-version=5.1 install lua-resty-http

# Prepare directories with correct permissions for nginx user
RUN mkdir -p /var/run/shared /usr/local/nginx/lua && \
    chown -R nginx:nginx /var/run/shared /usr/local/nginx/lua

USER nginx
