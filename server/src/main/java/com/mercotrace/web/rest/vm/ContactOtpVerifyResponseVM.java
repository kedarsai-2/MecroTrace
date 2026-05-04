package com.mercotrace.web.rest.vm;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.mercotrace.service.dto.ContactDTO;

/**
 * Response payload for /api/portal/auth/otp/verify.
 *
 * For existing contacts, guest=false and contact is populated. For guest
 * logins, guest=true and contact is null; the phone field always carries
 * the normalized mobile used for OTP.
 */
public record ContactOtpVerifyResponseVM(boolean guest, String phone, ContactDTO contact, @JsonProperty("refresh_token") String refreshToken) {
    public ContactOtpVerifyResponseVM(boolean guest, String phone, ContactDTO contact) {
        this(guest, phone, contact, null);
    }
}
