FROM golang:1.26 AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o devboard-backend .

FROM golang:1.26-alpine

WORKDIR /app

COPY --from=builder /app/devboard-backend ./devboard-backend

# Ensure binary is executable
RUN chmod +x ./devboard-backend

# DHI image runs as nonroot by default
USER nobody

EXPOSE 8080

# Use exec form for proper signal handling
CMD ["./devboard-backend"]
