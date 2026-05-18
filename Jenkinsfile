// MercoTrace CI/CD — mirrors .github/workflows/deploy-uat.yml where noted.
// Runs on the Jenkins agent (agent any). Local docker-compose image includes Node 20 + JDK 21 + sonar-scanner.
// Credential IDs (configure in Jenkins → Manage Credentials):
//   uat-ssh          SSH Username with private key (UAT VPS)
//   uat-vite-api-url Secret text — VITE_API_URL for client prod build
//   sonar-token      Secret text — SonarQube analysis token
// Optional env:
//   SONAR_HOST_URL (default http://sonarqube:9000 for jenkins/docker-compose.yml)
//   UAT_SSH_USER, UAT_SSH_HOST, UAT_DEPLOY_PATH, UAT_SYSTEMD_SERVICE, UAT_HEALTH_URL

pipeline {
    agent any

    parameters {
        booleanParam(
            name: 'DEPLOY_UAT',
            defaultValue: false,
            description: 'After a successful main build, rsync artifacts to UAT and restart systemd (requires credentials).'
        )
        booleanParam(
            name: 'SKIP_TESTS',
            defaultValue: false,
            description: 'Skip client unit tests and Maven verify (faster package-only runs).'
        )
        booleanParam(
            name: 'PROD_PACKAGE',
            defaultValue: true,
            description: 'Build production client bundle and server JAR (-Pprod, tests skipped on server).'
        )
        booleanParam(
            name: 'RUN_SONAR',
            defaultValue: false,
            description: 'Publish server (Maven) and client (sonar-scanner) analysis to SonarQube (requires sonar-token).'
        )
    }

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '10'))
        disableConcurrentBuilds(abortPrevious: false)
    }

    environment {
        CI = 'true'
        SHORT_SHA = "${env.GIT_COMMIT?.take(7) ?: 'local'}"
        DEPLOY_PATH = "${env.UAT_DEPLOY_PATH ?: '/var/www/uatmerco'}"
        SERVICE_NAME = "${env.UAT_SYSTEMD_SERVICE ?: 'uatmerco'}"
        SONAR_HOST_URL = "${env.SONAR_HOST_URL ?: 'http://sonarqube:9000'}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build & Test') {
            parallel {
                stage('Client') {
                    steps {
                        dir('client') {
                            sh 'npm ci'
                            sh 'npm run lint'
                            script {
                                if (!params.SKIP_TESTS) {
                                    sh 'npm run test'
                                }
                            }
                            script {
                                if (params.PROD_PACKAGE) {
                                    def viteApiUrl = env.VITE_API_URL?.trim()
                                    if (!viteApiUrl) {
                                        try {
                                            withCredentials([
                                                string(credentialsId: 'uat-vite-api-url', variable: 'CRED_VITE_API_URL'),
                                            ]) {
                                                viteApiUrl = CRED_VITE_API_URL
                                            }
                                        } catch (ignored) {
                                            echo 'uat-vite-api-url credential not set — using http://localhost:8080 for VITE_API_URL'
                                            viteApiUrl = 'http://localhost:8080'
                                        }
                                    }
                                    withEnv(["VITE_API_URL=${viteApiUrl}"]) {
                                        sh 'npm run build'
                                    }
                                } else {
                                    sh 'npm run build:dev'
                                }
                            }
                        }
                    }
                }

                stage('Server') {
                    steps {
                        dir('server') {
                            script {
                                if (params.SKIP_TESTS) {
                                    sh './mvnw -ntp -DskipTests compile'
                                } else {
                                    sh './mvnw -ntp -Dmodernizer.skip=true verify'
                                }
                            }
                        }
                    }
                }
            }
        }

        stage('SonarQube') {
            when {
                allOf {
                    expression { params.RUN_SONAR }
                    not { expression { params.SKIP_TESTS } }
                }
            }
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
                                            ./mvnw -ntp -Dmodernizer.skip=true sonar:sonar \
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
                                            sonar-scanner \
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
                dir('server') {
                    sh './mvnw -ntp -Pprod -DskipTests -Dmodernizer.skip=true package'
                }
            }
        }

        stage('Archive artifacts') {
            when {
                expression { params.PROD_PACKAGE }
            }
            steps {
                archiveArtifacts artifacts: 'client/dist/**', fingerprint: true, allowEmptyArchive: false
                archiveArtifacts artifacts: 'server/target/mercotrace-*.jar', fingerprint: true, allowEmptyArchive: false
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
                        error 'Set UAT_SSH_USER and UAT_SSH_HOST on the Jenkins job or controller (Manage Jenkins → System).'
                    }
                }
                sshagent(credentials: ['uat-ssh']) {
                    sh '''
                        set -euo pipefail
                        JAR_LOCAL="$(find server/target -name 'mercotrace-*.jar' -type f ! -name '*-sources.jar' | head -1)"
                        test -n "$JAR_LOCAL" || { echo "No server JAR under server/target"; exit 1; }
                        test -d client/dist || { echo "Missing client/dist — run PROD_PACKAGE build first"; exit 1; }

                        echo "Deploying ${SHORT_SHA} to ${DEPLOY_PATH} as ${UAT_SSH_USER}@${UAT_SSH_HOST}"

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
                script {
                    def healthUrl = env.UAT_HEALTH_URL?.trim()
                    if (healthUrl) {
                        sh """
                            curl -fsS --retry 5 --retry-delay 3 --retry-all-errors '${healthUrl}'
                        """
                    } else {
                        echo 'UAT_HEALTH_URL not set — skipping smoke check'
                    }
                }
            }
        }
    }

    post {
        always {
            junit allowEmptyResults: true, testResults: 'server/target/surefire-reports/*.xml,server/target/failsafe-reports/*.xml'
        }
        failure {
            echo 'Pipeline failed — see stage logs above.'
        }
        success {
            echo "Build ${env.BUILD_NUMBER} (${SHORT_SHA}) completed successfully."
        }
    }
}
