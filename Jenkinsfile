// SonarQube static analysis — no Docker, no tests.
//
// Jenkins agent requirements (install on the machine that runs the job):
//   - Java 21+  (for ./mvnw)
//   - sonar-scanner on PATH, or set SONAR_SCANNER_HOME
//
// Jenkins credentials:
//   sonar-token  — Secret text (SonarQube user token)
//
// Optional global env (Manage Jenkins → System):
//   SONAR_HOST_URL  — default http://localhost:9000

pipeline {
    agent any

    parameters {
        booleanParam(
            name: 'DEPLOY_UAT',
            defaultValue: false,
            description: 'Deploy to UAT after analysis (main only; requires UAT credentials).'
        )
        booleanParam(
            name: 'PROD_PACKAGE',
            defaultValue: false,
            description: 'Build production client + server JAR after SonarQube (no tests).'
        )
    }

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '30'))
        disableConcurrentBuilds(abortPrevious: false)
    }

    environment {
        SHORT_SHA = "${env.GIT_COMMIT?.take(7) ?: 'local'}"
        SONAR_HOST_URL = "${env.SONAR_HOST_URL ?: 'http://localhost:9000'}"
        DEPLOY_PATH = "${env.UAT_DEPLOY_PATH ?: '/var/www/uatmerco'}"
        SERVICE_NAME = "${env.UAT_SYSTEMD_SERVICE ?: 'uatmerco'}"
        SONAR_SCANNER = "${env.SONAR_SCANNER_HOME ? env.SONAR_SCANNER_HOME + '/bin/sonar-scanner' : 'sonar-scanner'}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Check tools') {
            steps {
                sh '''
                    set -e
                    echo "SONAR_HOST_URL=${SONAR_HOST_URL}"
                    java -version
                    test -x server/mvnw
                    if command -v sonar-scanner >/dev/null 2>&1; then
                      sonar-scanner -v
                    elif [ -n "${SONAR_SCANNER_HOME:-}" ] && [ -x "${SONAR_SCANNER_HOME}/bin/sonar-scanner" ]; then
                      "${SONAR_SCANNER_HOME}/bin/sonar-scanner" -v
                    else
                      echo "ERROR: sonar-scanner not found. Install CLI or set SONAR_SCANNER_HOME on the Jenkins agent." >&2
                      exit 1
                    fi
                '''
            }
        }

        stage('SonarQube') {
            stages {
                stage('Wait for SonarQube') {
                    steps {
                        sh 'bash jenkins/scripts/wait-for-sonarqube.sh "${SONAR_HOST_URL}"'
                    }
                }
                stage('Analyze') {
                    parallel {
                        stage('Server (Java)') {
                            steps {
                                withCredentials([
                                    string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN'),
                                ]) {
                                    dir('server') {
                                        sh '''
                                            ./mvnw -ntp -DskipTests -Dmodernizer.skip=true compile sonar:sonar \
                                              -Dsonar.host.url="${SONAR_HOST_URL}" \
                                              -Dsonar.token="${SONAR_TOKEN}" \
                                              -Dsonar.projectVersion="${SHORT_SHA}"
                                        '''
                                    }
                                }
                            }
                        }
                        stage('Client (TypeScript)') {
                            steps {
                                withCredentials([
                                    string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN'),
                                ]) {
                                    dir('client') {
                                        sh '''
                                            "${SONAR_SCANNER}" \
                                              -Dsonar.host.url="${SONAR_HOST_URL}" \
                                              -Dsonar.token="${SONAR_TOKEN}" \
                                              -Dsonar.projectVersion="${SHORT_SHA}"
                                        '''
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        stage('Package (prod)') {
            when {
                expression { params.PROD_PACKAGE }
            }
            steps {
                parallel {
                    stage('Client build') {
                        steps {
                            dir('client') {
                                script {
                                    def viteApiUrl = env.VITE_API_URL?.trim() ?: 'http://localhost:8080'
                                    try {
                                        withCredentials([
                                            string(credentialsId: 'uat-vite-api-url', variable: 'CRED_VITE_API_URL'),
                                        ]) {
                                            viteApiUrl = CRED_VITE_API_URL
                                        }
                                    } catch (ignored) {
                                        echo "uat-vite-api-url not set, using ${viteApiUrl}"
                                    }
                                    withEnv(["VITE_API_URL=${viteApiUrl}"]) {
                                        sh 'npm ci && npm run build'
                                    }
                                }
                            }
                        }
                    }
                    stage('Server package') {
                        steps {
                            dir('server') {
                                sh './mvnw -ntp -Pprod -DskipTests -Dmodernizer.skip=true package'
                            }
                        }
                    }
                }
            }
        }

        stage('Deploy UAT') {
            when {
                allOf {
                    branch 'main'
                    expression { params.DEPLOY_UAT }
                }
            }
            steps {
                script {
                    def sshUser = env.UAT_SSH_USER?.trim()
                    def sshHost = env.UAT_SSH_HOST?.trim()
                    if (!sshUser || !sshHost) {
                        error 'Set UAT_SSH_USER and UAT_SSH_HOST on the Jenkins controller or job.'
                    }
                }
                sshagent(credentials: ['uat-ssh']) {
                    sh '''
                        set -euo pipefail
                        JAR_LOCAL="$(find server/target -name 'mercotrace-*.jar' -type f ! -name '*-sources.jar' | head -1)"
                        test -n "$JAR_LOCAL" || { echo "No server JAR — enable PROD_PACKAGE"; exit 1; }
                        test -d client/dist || { echo "No client/dist — enable PROD_PACKAGE"; exit 1; }

                        rsync -avz -e ssh "${JAR_LOCAL}" \
                          "${UAT_SSH_USER}@${UAT_SSH_HOST}:${DEPLOY_PATH}/backend/releases/mercotrace-${SHORT_SHA}.jar"
                        ssh "${UAT_SSH_USER}@${UAT_SSH_HOST}" \
                          "mkdir -p '${DEPLOY_PATH}/frontend/releases/${SHORT_SHA}'"
                        rsync -avz --delete -e ssh client/dist/ \
                          "${UAT_SSH_USER}@${UAT_SSH_HOST}:${DEPLOY_PATH}/frontend/releases/${SHORT_SHA}/"
                        scp scripts/deploy-uat-remote.sh \
                          "${UAT_SSH_USER}@${UAT_SSH_HOST}:/tmp/deploy-uat-remote-${SHORT_SHA}.sh"
                        ssh "${UAT_SSH_USER}@${UAT_SSH_HOST}" \
                          "chmod +x /tmp/deploy-uat-remote-${SHORT_SHA}.sh && \
                           DEPLOY_ROOT='${DEPLOY_PATH}' RELEASE_ID='${SHORT_SHA}' SERVICE_NAME='${SERVICE_NAME}' \
                           bash /tmp/deploy-uat-remote-${SHORT_SHA}.sh && \
                           rm -f /tmp/deploy-uat-remote-${SHORT_SHA}.sh"
                    '''
                }
            }
        }
    }

    post {
        success {
            echo "SonarQube analysis completed for ${SHORT_SHA} — ${SONAR_HOST_URL}"
        }
        failure {
            echo 'Pipeline failed — check logs, sonar-token credential, and agent tools (Java 21, sonar-scanner).'
        }
    }
}
