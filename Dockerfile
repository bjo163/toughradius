FROM --platform=$BUILDPLATFORM node:20-bookworm AS frontend-builder

COPY web/package*.json /web/
WORKDIR /web
RUN npm ci

COPY web/ /web/
RUN npm run build && \
     echo "Frontend build completed:" && \
     ls -lah dist/

FROM --platform=$BUILDPLATFORM golang:1.24-bookworm AS builder

ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH

COPY . /src
WORKDIR /src

# Copy built frontend from frontend-builder stage
COPY --from=frontend-builder /web/dist /src/web/dist

# Verify frontend is present (built to dist/admin/)
RUN test -f /src/web/dist/admin/index.html || (echo "ERROR: Frontend not found!" && exit 1)

# Build for target platform
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -a -ldflags \
     '-s -w -extldflags "-static"' -o /toughradius main.go

FROM alpine:latest

RUN apk add --no-cache curl ca-certificates tzdata bash

COPY --from=builder /toughradius /usr/local/bin/toughradius
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/toughradius /usr/local/bin/docker-entrypoint.sh

# Expose required ports:
# 1816 - Web/Admin API (HTTP)
# 1812 - RADIUS Authentication (UDP)
# 1813 - RADIUS Accounting (UDP)
# 2083 - RadSec (RADIUS over TLS)
EXPOSE 1816/tcp 1812/udp 1813/udp 2083/tcp

# Create working directory
WORKDIR /data

# Use entrypoint script
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]