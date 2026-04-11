package com.mercotrace.web.rest;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mercotrace.IntegrationTest;
import com.mercotrace.domain.Patti;
import com.mercotrace.repository.PattiRepository;
import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.dto.SettlementDTOs.*;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for the {@link SettlementResource} REST controller.
 * Requires ROLE_AUCTIONS_VIEW; context trader 101.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(authorities = { AuthoritiesConstants.AUCTIONS_VIEW })
class SettlementResourceIT {

    private static final String BASE_URL = "/api/settlements";

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private MockMvc restSettlementMockMvc;

    @Autowired
    private PattiRepository pattiRepository;

    @AfterEach
    void cleanup() {
        pattiRepository.deleteAll();
    }

    @Test
    @Transactional
    void listSellersReturnsOk() throws Exception {
        restSettlementMockMvc
            .perform(get(BASE_URL + "/sellers?page=0&size=10"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(header().exists("X-Total-Count"))
            .andExpect(jsonPath("$").isArray());
    }

    @Test
    @Transactional
    void listPattisReturnsOk() throws Exception {
        restSettlementMockMvc
            .perform(get(BASE_URL + "/pattis?page=0&size=10"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(header().exists("X-Total-Count"))
            .andExpect(jsonPath("$").isArray());
    }

    @Test
    @Transactional
    void createPattiReturns200WithPattiId() throws Exception {
        PattiSaveRequest request = new PattiSaveRequest();
        request.setSellerId("S1");
        request.setPattiBaseNumber("2255");
        request.setSellerSequenceNumber(1);
        request.setSellerName("Settlement Test Seller");
        request.setGrossAmount(new BigDecimal("50000"));
        request.setTotalDeductions(new BigDecimal("2000"));
        request.setNetPayable(new BigDecimal("48000"));
        request.setUseAverageWeight(false);
        RateClusterDTO rc = new RateClusterDTO();
        rc.setRate(new BigDecimal("100"));
        rc.setTotalQuantity(100);
        rc.setTotalWeight(new BigDecimal("5000"));
        rc.setAmount(new BigDecimal("500000"));
        request.setRateClusters(List.of(rc));
        DeductionItemDTO d = new DeductionItemDTO();
        d.setKey("coolie");
        d.setLabel("Coolie");
        d.setAmount(new BigDecimal("2000"));
        d.setEditable(true);
        d.setAutoPulled(false);
        request.setDeductions(List.of(d));

        String responseBody = restSettlementMockMvc
            .perform(
                post(BASE_URL + "/pattis")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(request))
            )
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.pattiId").value("2255-1"))
            .andExpect(jsonPath("$.pattiBaseNumber").value("2255"))
            .andExpect(jsonPath("$.sellerSequenceNumber").value(1))
            .andExpect(jsonPath("$.sellerName").value("Settlement Test Seller"))
            .andExpect(jsonPath("$.grossAmount").value(50000))
            .andExpect(jsonPath("$.netPayable").value(48000))
            .andExpect(jsonPath("$.rateClusters", hasSize(1)))
            .andExpect(jsonPath("$.deductions", hasSize(1)))
            .andReturn()
            .getResponse()
            .getContentAsString();

        Long id = objectMapper.readTree(responseBody).get("id").asLong();
        restSettlementMockMvc
            .perform(get(BASE_URL + "/pattis/" + id))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(id.intValue()))
            .andExpect(jsonPath("$.sellerName").value("Settlement Test Seller"));
    }

    @Test
    @Transactional
    void getPattiByIdReturns404WhenNotFound() throws Exception {
        restSettlementMockMvc.perform(get(BASE_URL + "/pattis/999999")).andExpect(status().isNotFound());
    }
}
