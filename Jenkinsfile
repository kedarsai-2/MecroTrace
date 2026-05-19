// CI pipeline — unit tests, optional OpenAPI HTML, JavaDoc; SonarQube only via SONAR_ONLY (no deploy).
//
// Tools: Java 21, Node 20 (client tests), curl/python3 (OpenAPI/Postman), SonarQubeScanner (SONAR_ONLY)
// Credential: sonar-token (Secret text) — required when SONAR_ONLY is enabled

pipeline {
    agent any

    parameters {
        booleanParam(
            name: 'SONAR_ONLY',
            defaultValue: false,
            description: 'Sonar-only build: run server + client unit tests, then publish both to SonarQube (skips OpenAPI/JavaDoc).'
        )
        booleanParam(
            name: 'RUN_SERVER_UNIT_TESTS',
            defaultValue: true,
            description: 'Server: ./mvnw -Punit-tests-ci test (ignored when SONAR_ONLY — tests always run).'
        )
        booleanParam(
            name: 'RUN_CLIENT_UNIT_TESTS',
            defaultValue: true,
            description: 'Client: Vitest unit tests (ignored when SONAR_ONLY — tests always run).'
        )
        booleanParam(
            name: 'GENERATE_JAVADOC',
            defaultValue: true,
            description: 'Generate downloadable HTML JavaDoc zip (skipped when SONAR_ONLY).'
        )
        booleanParam(
            name: 'GENERATE_OPENAPI_HTML',
            defaultValue: true,
            description: 'Export OpenAPI spec, Postman collection, and Swagger UI HTML zip (skipped when SONAR_ONLY).'
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
        OPENAPI_PUBLIC_URL = "${env.OPENAPI_PUBLIC_URL ?: 'https://uat-merco.qualityoutsidethebox.org'}"
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
                    params.SONAR_ONLY ||
                        params.RUN_SERVER_UNIT_TESTS ||
                        params.RUN_CLIENT_UNIT_TESTS
                }
            }
            parallel {
                stage('Server (unit)') {
                    when {
                        expression {
                            params.SONAR_ONLY || params.RUN_SERVER_UNIT_TESTS
                        }
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
                        expression {
                            params.SONAR_ONLY || params.RUN_CLIENT_UNIT_TESTS
                        }
                    }
                    steps {
                        script {
                            def nodeTool = env.JENKINS_NODEJS_INSTALLATION?.trim() ?: 'nodejs20'
                            try {
                                env.NODEJS_HOME = tool nodeTool
                                env.PATH = "${env.NODEJS_HOME}/bin:${env.PATH}"
                                echo "Using Jenkins Node.js tool: ${nodeTool}"
                            } catch (ignored) {
                                echo "Node.js tool '${nodeTool}' not configured — using node/npm from agent PATH"
                            }
                        }
                        sh 'bash jenkins/scripts/run-client-unit-tests.sh .'
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
                        if (!params.SONAR_ONLY &&
                            (params.RUN_SERVER_UNIT_TESTS || params.RUN_CLIENT_UNIT_TESTS)) {
                            sh 'bash jenkins/scripts/package-unit-test-reports.sh . "${SHORT_SHA}"'
                            archiveArtifacts artifacts: 'server/mercotrace-unit-tests-*.zip', fingerprint: true, allowEmptyArchive: true
                            archiveArtifacts artifacts: 'server/target/unit-test-html/**', fingerprint: true, allowEmptyArchive: true
                        }
                    }
                }
            }
        }

        stage('OpenAPI (Swagger HTML + Postman)') {
            when {
                expression { !params.SONAR_ONLY && params.GENERATE_OPENAPI_HTML }
            }
            steps {
                sh '''#!/usr/bin/env bash
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
                expression { !params.SONAR_ONLY && params.GENERATE_JAVADOC }
            }
            steps {
                sh 'bash jenkins/scripts/generate-javadoc.sh . "${SHORT_SHA}"'
                archiveArtifacts artifacts: 'server/mercotrace-javadoc-*.zip', fingerprint: true, onlyIfSuccessful: true
                archiveArtifacts artifacts: 'server/target/javadoc-html-site/**', fingerprint: true, allowEmptyArchive: true
            }
        }

        stage('SonarQube') {
            when {
                expression { params.SONAR_ONLY }
            }
            stages {
                stage('Prepare scanner') {
                    steps {
                        script {
                            env.SONAR_RUNNER_HOME = tool 'SonarQubeScanner'
                            sh '''
                                set -e
                                test -n "${SONAR_RUNNER_HOME}"
                                "${SONAR_RUNNER_HOME}/bin/sonar-scanner" -v
                            '''
                        }
                    }
                }
                stage('Wait for SonarQube') {
                    steps {
                        sh 'bash jenkins/scripts/wait-for-sonarqube.sh "${SONAR_HOST_URL}"'
                    }
                }
                stage('Analyze') {
                    steps {
                        withCredentials([
                            string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN'),
                        ]) {
                            sh 'bash jenkins/scripts/run-sonarqube.sh . "${SHORT_SHA}"'
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            script {
                if (!params.SONAR_ONLY) {
                    load('jenkins/publish-html-reports.groovy').publishAll(this)
                }
            }
        }
        success {
            echo "Build ${SHORT_SHA} finished."
        }
        failure {
            echo 'Pipeline failed — expand the first red stage in the log.'
        }
        unstable {
            echo "Build ${SHORT_SHA} finished with warnings."
        }
    }
}
