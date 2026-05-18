package com.mercotrace.web.rest.errors;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * Standard JSON error envelope used by several module controllers (message, HTTP status, field errors).
 */
@Schema(description = "Standard error JSON: message, numeric status, and errors array")
public class ApiErrorBody {

    private String message;

    private Integer status;

    private List<ApiFieldError> errors;

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public Integer getStatus() {
        return status;
    }

    public void setStatus(Integer status) {
        this.status = status;
    }

    public List<ApiFieldError> getErrors() {
        return errors;
    }

    public void setErrors(List<ApiFieldError> errors) {
        this.errors = errors;
    }
}
