// CI pipeline — unit tests only (no Docker DB), optional OpenAPI HTML, JavaDoc, SonarQube, deploy.
//
// Tools: Java 21, Node 20 (client tests only), curl/python3 (OpenAPI/Postman), SonarQubeScanner
// Credential: sonar-token (Secret text)
// Env: SONAR_HOST_URL (default http://localhost:9000)

pipeline {
    agent any

    parameters {
        booleanParam(
            name: 'RUN_UNIT_TESTS',
            defaultValue: true,
            description: 'Master switch: run any unit tests below (no Docker / DB).'
        )
        booleanParam(
            name: 'RUN_SERVER_UNIT_TESTS',
            defaultValue: true,
            description: 'Server: ./mvnw -Punit-tests-ci test (Surefire only, excludes integration).'
        )
        booleanParam(
            name: 'RUN_CLIENT_UNIT_TESTS',
            defaultValue: true,
            description: 'Client: npm run test (Vitest, no Docker).'
        )
        booleanParam(
            name: 'GENERATE_JAVADOC',
            defaultValue: true,
            description: 'Generate downloadable HTML JavaDoc zip.'
        )
        booleanParam(
            name: 'GENERATE_OPENAPI_HTML',
            defaultValue: true,
            description: 'Export OpenAPI spec, Postman collection, and Swagger UI HTML zip (no Docker DB).'
        )
        booleanParam(
            name: 'RUN_SONAR',
            defaultValue: true,
            description: 'Publish server + client analysis to SonarQube.'
        )
        booleanParam(
            name: 'SONAR_ONLY',
            defaultValue: true,
            description: 'Skip production package and UAT deploy (tests + quality gates only).'
        )
        booleanParam(
            name: 'PROD_PACKAGE',
            defaultValue: false,
            description: 'Build production JARs (when SONAR_ONLY is false).'
        )
        booleanParam(
            name: 'DEPLOY_UAT',
            defaultValue: false,
            description: 'Deploy to UAT on main (when SONAR_ONLY is false).'
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
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Unit tests') {
            when {
                expression {
                    params.RUN_UNIT_TESTS && (params.RUN_SERVER_UNIT_TESTS || params.RUN_CLIENT_UNIT_TESTS)
                }
            }
            parallel {
                stage('Server (unit)') {
                    when {
                        expression { params.RUN_UNIT_TESTS && params.RUN_SERVER_UNIT_TESTS }
                    }
                    steps {
                        dir('server') {
                            sh '''
                                ./mvnw -ntp -Punit-tests-ci -Dmodernizer.skip=true test
                            '''
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: 'server/target/surefire-reports/*.xml'
                        }
                    }
                }
                stage('Client (unit)') {
                    when {
                        expression { params.RUN_UNIT_TESTS && params.RUN_CLIENT_UNIT_TESTS }
                    }
                    steps {
                        dir('client') {
                            sh 'npm ci && CI=true npm run test'
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: 'client/target/vitest-junit.xml'
                        }
                    }
                }
            }
            post {
                always {
                    script {
                        if (params.RUN_UNIT_TESTS && (params.RUN_SERVER_UNIT_TESTS || params.RUN_CLIENT_UNIT_TESTS)) {
                            sh 'bash jenkins/scripts/package-unit-test-reports.sh . "${SHORT_SHA}"'
                            archiveArtifacts artifacts: 'server/mercotrace-unit-tests-*.zip', fingerprint: true, allowEmptyArchive: true
                            archiveArtifacts artifacts: 'server/target/unit-test-html/**', fingerprint: true, allowEmptyArchive: true
                            try {
                                if (params.RUN_SERVER_UNIT_TESTS) {
                                    def serverReport = 'server/target/surefire-reports/surefire-report.html'
                                    if (!fileExists(serverReport)) {
                                        serverReport = 'server/target/surefire-reports/surefire-report.html.html'
                                    }
                                    if (fileExists(serverReport)) {
                                        publishHTML([
                                            allowMissing: true,
                                            alwaysLinkToLastBuild: true,
                                            keepAll: true,
                                            reportDir: 'server/target/surefire-reports',
                                            reportFiles: serverReport.contains('.html.html') ? 'surefire-report.html.html' : 'surefire-report.html',
                                            reportName: 'Server unit tests (HTML)',
                                            useWrapperFileDirectly: true,
                                        ])
                                    }
                                }
                                if (params.RUN_CLIENT_UNIT_TESTS && fileExists('client/target/vitest-report/index.html')) {
                                    publishHTML([
                                        allowMissing: true,
                                        alwaysLinkToLastBuild: true,
                                        keepAll: true,
                                        reportDir: 'client/target/vitest-report',
                                        reportFiles: 'index.html',
                                        reportName: 'Client unit tests (HTML)',
                                        useWrapperFileDirectly: true,
                                    ])
                                }
                            } catch (Throwable publishErr) {
                                echo "HTML Publisher plugin not available (install it for in-Jenkins report links): ${publishErr.message}"
                            }
                        }
                    }
                }
            }
        }

        stage('Prepare SonarQube scanner') {
            when {
                expression { params.RUN_SONAR }
            }
            steps {
                script {
                    env.SONAR_RUNNER_HOME = tool 'SonarQubeScanner'
                }
                sh '''
                    set -e
                    test -n "${SONAR_RUNNER_HOME}"
                    "${SONAR_RUNNER_HOME}/bin/sonar-scanner" -v
                '''
            }
        }

        stage('OpenAPI (Swagger HTML + Postman)') {
            when {
                expression { params.GENERATE_OPENAPI_HTML }
            }
            steps {
                sh '''
                    set -euo pipefail
                    command -v java >/dev/null || { echo "java not found on PATH" >&2; exit 1; }
                    command -v curl >/dev/null || { echo "curl not found on PATH" >&2; exit 1; }
                    command -v python3 >/dev/null || { echo "python3 not found on PATH" >&2; exit 1; }
                    bash jenkins/scripts/generate-openapi.sh .
                    bash jenkins/scripts/generate-postman-collection.sh . "${SHORT_SHA}"
                    bash jenkins/scripts/package-openapi-html.sh . "${SHORT_SHA}"
                '''
                archiveArtifacts artifacts: 'server/mercotrace-openapi-*.zip', fingerprint: true, onlyIfSuccessful: true
                archiveArtifacts artifacts: 'server/mercotrace-postman-*.json', fingerprint: true, onlyIfSuccessful: true
                archiveArtifacts artifacts: 'server/target/swagger-html/**', fingerprint: true, onlyIfSuccessful: true
            }
        }

        stage('JavaDoc') {
            when {
                expression { params.GENERATE_JAVADOC }
            }
            steps {
                dir('server') {
                    sh '''
                        ./mvnw -ntp -DskipTests -Pjavadoc-ci compile javadoc:javadoc checkstyle:check@verify-rest-javadoc
                    '''
                }
                sh 'bash jenkins/scripts/package-javadoc.sh . "${SHORT_SHA}"'
                archiveArtifacts artifacts: 'server/mercotrace-javadoc-*.zip', fingerprint: true, onlyIfSuccessful: true
                archiveArtifacts artifacts: 'server/target/javadoc-html/**', fingerprint: true, onlyIfSuccessful: true
            }
        }

        stage('SonarQube') {
            when {
                expression { params.RUN_SONAR }
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
                                            SONAR_EXTRA=""
                                            if [ -d target/surefire-reports ]; then
                                              SONAR_EXTRA="-Dsonar.junit.reportPaths=target/surefire-reports"
                                            fi
                                            ./mvnw -ntp -DskipTests -Dmodernizer.skip=true compile sonar:sonar \
                                              -Dsonar.host.url="${SONAR_HOST_URL}" \
                                              -Dsonar.token="${SONAR_TOKEN}" \
                                              -Dsonar.projectVersion="${SHORT_SHA}" \
                                              ${SONAR_EXTRA}
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
                                            "${SONAR_RUNNER_HOME}/bin/sonar-scanner" \
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
                allOf {
                    expression { !params.SONAR_ONLY }
                    expression { params.PROD_PACKAGE }
                }
            }
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

        stage('Deploy UAT') {
            when {
                allOf {
                    expression { !params.SONAR_ONLY }
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
            echo "Build ${SHORT_SHA} finished."
        }
        failure {
            echo 'Pipeline failed — see stage logs (unit tests need Java 21 + Node 20 only; no Docker DB).'
        }
    }
}
