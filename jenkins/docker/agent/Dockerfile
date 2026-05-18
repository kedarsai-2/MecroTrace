# Optional standalone CI image (same tools as jenkins/Dockerfile).
# The Jenkinsfile uses agent any on the controller; use this image only if you run a separate Jenkins agent container.
FROM eclipse-temurin:21-jdk-jammy

ARG NODE_MAJOR=20
ARG SONAR_SCANNER_VERSION=6.2.1.4610

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        openssh-client \
        rsync \
        unzip \
    && curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL "https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-${SONAR_SCANNER_VERSION}-linux-x64.zip" -o /tmp/sonar-scanner.zip \
    && unzip -q /tmp/sonar-scanner.zip -d /opt \
    && ln -sf "/opt/sonar-scanner-${SONAR_SCANNER_VERSION}-linux-x64" /opt/sonar-scanner \
    && ln -sf /opt/sonar-scanner/bin/sonar-scanner /usr/local/bin/sonar-scanner \
    && rm -f /tmp/sonar-scanner.zip

WORKDIR /home/jenkins/agent
USER root
