FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o /bin/javi-dashboard ./cmd/server

FROM alpine:3.20
COPY --from=builder /bin/javi-dashboard /bin/javi-dashboard
EXPOSE 8080
ENTRYPOINT ["/bin/javi-dashboard"]
