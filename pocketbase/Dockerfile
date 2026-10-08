# syntax=docker/dockerfile:1
# PocketBase dédié à CSM (Coolify : ressource csm-pocketbase, volume persistant monté sur /pb_data).
FROM alpine:3.22

ARG PB_VERSION=0.40.4
RUN apk add --no-cache ca-certificates unzip wget \
 && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
 && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/checksums.txt" \
 && grep "pocketbase_${PB_VERSION}_linux_amd64.zip" checksums.txt | sha256sum -c - \
 && unzip -q "pocketbase_${PB_VERSION}_linux_amd64.zip" pocketbase -d /usr/local/bin \
 && rm -f ./*.zip checksums.txt \
 && addgroup -S pb && adduser -S -G pb pb \
 && mkdir -p /pb_data && chown pb:pb /pb_data

COPY --chown=pb:pb pb_migrations /pb/pb_migrations
COPY --chown=pb:pb pb_hooks /pb/pb_hooks
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER pb
VOLUME /pb_data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1
# Migrations appliquées au démarrage ; superuser créé depuis PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD (Coolify).
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
