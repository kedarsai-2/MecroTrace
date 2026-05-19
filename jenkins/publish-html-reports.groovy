#!/usr/bin/env groovy
/**
 * Publish MercoTrace HTML artifacts with the Jenkins HTML Publisher plugin.
 * Usage in Jenkinsfile: load('jenkins/publish-html-reports.groovy').publishAll(this)
 *
 * Requires: https://plugins.jenkins.io/htmlpublisher/
 * Skips missing reports and continues if the plugin is not installed.
 */

def publishAll(def steps) {
    def reports = [
        [
            name : 'Unit tests — overview',
            dir  : 'server/target/unit-test-html',
            files: 'index.html',
        ],
        [
            name    : 'Server unit tests (Surefire)',
            dir     : 'server/target/surefire-reports',
            files   : 'surefire-report.html',
            altFiles: 'surefire-report.html.html',
        ],
        [
            name : 'Client unit tests (Vitest)',
            dir  : 'client/target/vitest-report',
            files: 'index.html',
        ],
        [
            name : 'OpenAPI / Swagger UI',
            dir  : 'server/target/swagger-html',
            files: 'index.html',
        ],
    ]

    reports.each { publishOne(steps, it) }
    publishJavadoc(steps)
}

def publishJavadoc(def steps) {
    def dir = 'server/target/javadoc-html-site'
    if (!steps.fileExists("${dir}/index.html")) {
        steps.echo 'Skipping HTML publish (JavaDoc): server/target/javadoc-html-site/index.html not found'
        return
    }
    publishOne(steps, [name: 'JavaDoc', dir: dir, files: 'index.html'])
}

def publishOne(def steps, Map report) {
    def reportFiles = report.files
    if (report.altFiles && !steps.fileExists("${report.dir}/${reportFiles}")) {
        reportFiles = report.altFiles
    }
    if (!steps.fileExists("${report.dir}/${reportFiles}")) {
        steps.echo "Skipping HTML publish (${report.name}): ${report.dir}/${reportFiles} not found"
        return
    }
    try {
        steps.publishHTML([
            allowMissing             : true,
            alwaysLinkToLastBuild    : true,
            keepAll                  : true,
            reportDir                : report.dir,
            reportFiles              : reportFiles,
            reportName               : report.name,
            useWrapperFileDirectly   : true,
        ])
        steps.echo "Published HTML report: ${report.name}"
    } catch (Throwable err) {
        steps.echo "HTML Publisher failed for ${report.name} (install htmlpublisher plugin): ${err.message}"
    }
}

return this
