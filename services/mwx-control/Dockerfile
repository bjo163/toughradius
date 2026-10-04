FROM golang:1.26-alpine AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/mwx-control .

FROM alpine:3.24

RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S -g 10001 mwxcontrol && \
    adduser -S -D -H -u 10001 -G mwxcontrol mwxcontrol
COPY --from=builder /out/mwx-control /usr/local/bin/mwx-control
USER 10001:10001
EXPOSE 7946/tcp 7946/udp 8080/tcp
ENTRYPOINT ["/usr/local/bin/mwx-control"]
