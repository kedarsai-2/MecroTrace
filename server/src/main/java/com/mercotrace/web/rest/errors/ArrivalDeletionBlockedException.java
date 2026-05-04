package com.mercotrace.web.rest.errors;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;
import tech.jhipster.web.rest.errors.ProblemDetailWithCause;
import tech.jhipster.web.rest.errors.ProblemDetailWithCause.ProblemDetailWithCauseBuilder;

/**
 * Returned when an arrival (or its lots) cannot be deleted because downstream rows still reference them.
 */
@SuppressWarnings("java:S110")
public class ArrivalDeletionBlockedException extends ErrorResponseException {

    private static final long serialVersionUID = 1L;

    private final List<String> blockerCodes;

    public ArrivalDeletionBlockedException(String defaultMessage, List<String> blockerCodes) {
        super(
            HttpStatus.CONFLICT,
            ProblemDetailWithCauseBuilder.instance()
                .withStatus(HttpStatus.CONFLICT.value())
                .withType(ErrorConstants.DEFAULT_TYPE)
                .withTitle("Conflict")
                .withDetail(defaultMessage)
                .withProperty("message", "error.arrivalDeletionBlocked")
                .withProperty("params", "arrival")
                .withProperty("blockers", new ArrayList<>(blockerCodes))
                .build(),
            null
        );
        this.blockerCodes = List.copyOf(blockerCodes);
    }

    public ArrivalDeletionBlockedException(URI type, String defaultMessage, List<String> blockerCodes) {
        super(
            HttpStatus.CONFLICT,
            ProblemDetailWithCauseBuilder.instance()
                .withStatus(HttpStatus.CONFLICT.value())
                .withType(type)
                .withTitle("Conflict")
                .withDetail(defaultMessage)
                .withProperty("message", "error.arrivalDeletionBlocked")
                .withProperty("params", "arrival")
                .withProperty("blockers", new ArrayList<>(blockerCodes))
                .build(),
            null
        );
        this.blockerCodes = List.copyOf(blockerCodes);
    }

    public List<String> getBlockerCodes() {
        return blockerCodes;
    }

    public ProblemDetailWithCause getProblemDetailWithCause() {
        return (ProblemDetailWithCause) this.getBody();
    }
}
