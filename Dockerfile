FROM node:20-alpine AS frontend
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /cmd/server/web/dist ./cmd/server/web/dist
RUN go build -o /bin/javi-dashboard ./cmd/server

FROM alpine:3.20
COPY --from=builder /bin/javi-dashboard /bin/javi-dashboard
EXPOSE 8080
ENTRYPOINT ["/bin/javi-dashboard"]
