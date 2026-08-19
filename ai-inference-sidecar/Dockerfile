# Build Stage — CGO enabled for ONNX Runtime linking
FROM --platform=linux/amd64 golang:1.25 AS builder

# DNS configuration is managed by Docker; no manual resolv.conf edit needed

# Install build tools for CGO and wget (glibc base)
RUN apt-get update && apt-get install -y --no-install-recommends gcc wget ca-certificates curl libstdc++6 libgomp1 && rm -rf /var/lib/apt/lists/*

# Install ONNX Runtime for Linux x86_64 (glibc). Adjust architecture if needed.
ARG ONNX_VERSION=1.20.0
RUN curl -L --retry 3 -o onnxruntime-linux-x64-${ONNX_VERSION}.tgz https://github.com/microsoft/onnxruntime/releases/download/v${ONNX_VERSION}/onnxruntime-linux-x64-${ONNX_VERSION}.tgz \
    && tar -xzf onnxruntime-linux-x64-${ONNX_VERSION}.tgz \
    && cp onnxruntime-linux-x64-${ONNX_VERSION}/lib/libonnxruntime.so.${ONNX_VERSION} /usr/lib/libonnxruntime.so \
    && rm -rf onnxruntime-linux-x64-${ONNX_VERSION}*

ENV GOARCH=amd64
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-w -s" -o ai-waf-sidecar main.go

# Execution Stage
FROM --platform=linux/amd64 debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 libgomp1 ca-certificates curl && rm -rf /var/lib/apt/lists/*

# Install ONNX Runtime x86_64
# Install ONNX Runtime in execution stage
ARG ONNX_VERSION=1.20.0
RUN curl -L --retry 3 -o onnxruntime-linux-x64-${ONNX_VERSION}.tgz https://github.com/microsoft/onnxruntime/releases/download/v${ONNX_VERSION}/onnxruntime-linux-x64-${ONNX_VERSION}.tgz \
    && tar -xzf onnxruntime-linux-x64-${ONNX_VERSION}.tgz \
    && cp onnxruntime-linux-x64-${ONNX_VERSION}/lib/libonnxruntime.so.${ONNX_VERSION} /usr/lib/libonnxruntime.so \
    && rm -rf onnxruntime-linux-x64-${ONNX_VERSION}*

# Copy compiled binary and certificates
COPY --from=builder /app/ai-waf-sidecar /ai-waf-sidecar
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN mkdir -p /var/run/shared /models && chmod 777 /var/run/shared /models

ENV LD_LIBRARY_PATH=/usr/lib
ENV ONNX_LIB_PATH=/usr/lib/libonnxruntime.so

ENTRYPOINT ["/ai-waf-sidecar"]
