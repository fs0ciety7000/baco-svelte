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

USER pb
VOLUME /pb_data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1
# Les migrations s'appliquent automatiquement au démarrage.
CMD ["pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data", "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks"]
