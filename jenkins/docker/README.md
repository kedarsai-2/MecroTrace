# Optional: Jenkins + SonarQube via Docker

**Not required.** The main pipeline (`Jenkinsfile`) uses `agent any` with tools installed on your Jenkins machine.

Use this folder only if you want a local Jenkins controller in Docker:

```bash
cd jenkins/docker
export SONAR_TOKEN="squ_your_token"
docker compose up -d --build
```

- Jenkins: http://localhost:8080  
- SonarQube: http://localhost:9000  

Set `SONAR_HOST_URL=http://host.docker.internal:9000` on the Jenkins service if SonarQube runs on the host, not in compose.
