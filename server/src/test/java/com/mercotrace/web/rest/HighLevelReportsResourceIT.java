package com.mercotrace.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.mercotrace.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Integration tests for {@link HighLevelReportsResource}.
 */
@IntegrationTest
@AutoConfigureMockMvc
class HighLevelReportsResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void dailySalesSummaryEndpointReturnsOk() throws Exception {
        mockMvc.perform(
                get("/api/reports/daily-sales-summary")
                    .param("dateFrom", "2025-01-01")
                    .param("dateTo", "2025-01-31")
                    .accept(MediaType.APPLICATION_JSON)
            )
            .andExpect(status().isOk());
    }
}

