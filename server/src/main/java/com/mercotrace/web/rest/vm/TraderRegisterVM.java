package com.mercotrace.web.rest.vm;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * ViewModel for trader registration used by /api/auth/register.
 * Aligned with frontend payload used in RegisterScreen/AuthContext:
 * {
 *   business_name, owner_name, mobile, email, password,
 *   address, city, state, pin_code, category
 * }
 */
@Schema(
    name = "TraderRegister",
    description = "Trader self-registration. JSON uses snake_case for business_name, owner_name, pin_code, gst_number, rmc_apmc_code, shop_photos."
)
public class TraderRegisterVM {

    @JsonProperty("business_name")
    @NotBlank
    private String businessName;

    @JsonProperty("owner_name")
    @NotBlank
    private String ownerName;

    @NotBlank
    private String mobile;

    @NotBlank
    @Email
    private String email;

    @NotBlank
    @Size(min = 6, max = 100)
    private String password;

    @NotBlank
    private String address;

    @NotBlank
    private String city;

    @NotBlank
    private String state;

    @JsonProperty("pin_code")
    private String pinCode;

    @NotBlank
    private String category;

    @JsonProperty("gst_number")
    @Size(max = 15)
    @Pattern(
        regexp = "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$",
        message = "Invalid GST number"
    )
    private String gstNumber;

    @JsonProperty("rmc_apmc_code")
    @Size(max = 64)
    private String rmcApmcCode;

    @JsonProperty("shop_photos")
    @Size(max = 4)
    private String[] shopPhotos;

    public String getBusinessName() {
        return businessName;
    }

    public void setBusinessName(String businessName) {
        this.businessName = businessName;
    }

    public String getOwnerName() {
        return ownerName;
    }

    public void setOwnerName(String ownerName) {
        this.ownerName = ownerName;
    }

    public String getMobile() {
        return mobile;
    }

    public void setMobile(String mobile) {
        this.mobile = mobile;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getCity() {
        return city;
    }

    public void setCity(String city) {
        this.city = city;
    }

    public String getState() {
        return state;
    }

    public void setState(String state) {
        this.state = state;
    }

    public String getPinCode() {
        return pinCode;
    }

    public void setPinCode(String pinCode) {
        this.pinCode = pinCode;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getGstNumber() {
        return gstNumber;
    }

    public void setGstNumber(String gstNumber) {
        this.gstNumber = gstNumber;
    }

    public String getRmcApmcCode() {
        return rmcApmcCode;
    }

    public void setRmcApmcCode(String rmcApmcCode) {
        this.rmcApmcCode = rmcApmcCode;
    }

    public String[] getShopPhotos() {
        return shopPhotos;
    }

    public void setShopPhotos(String[] shopPhotos) {
        this.shopPhotos = shopPhotos;
    }
}

