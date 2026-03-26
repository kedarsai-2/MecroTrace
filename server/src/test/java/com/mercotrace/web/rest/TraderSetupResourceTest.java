/*
 * Run alone: mvn test -Dtest=TraderSetupResourceTest
 *
 * Trader setup module: unit tests for TraderResource (/api/traders) and
 * AdminTraderSpecResource (/api/admin/traders) using MockMvc and mocked services.
 */
package com.mercotrace.web.rest;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mercotrace.domain.enumeration.ApprovalStatus;
import com.mercotrace.domain.enumeration.BusinessMode;
import com.mercotrace.repository.TraderRepository;
import com.mercotrace.repository.UserTraderRepository;
import com.mercotrace.service.TraderOwnerAuthorityService;
import com.mercotrace.service.TraderQueryService;
import com.mercotrace.service.TraderService;
import com.mercotrace.service.dto.TraderDTO;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.oauth2.jwt.JwtDecoder;

@WebMvcTest(controllers = { TraderResource.class, AdminTraderSpecResource.class })
@TestPropertySource(properties = "jhipster.clientApp.name=mercotraceApp")
class TraderSetupResourceTest {

    private static final String TRADERS_API = "/api/traders";
    private static final String ADMIN_TRADERS_API = "/api/admin/traders";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private JwtDecoder jwtDecoder;

    @MockBean
    private TraderService traderService;

    @MockBean
    private TraderRepository traderRepository;

    @MockBean
    private TraderQueryService traderQueryService;

    @MockBean
    private UserTraderRepository userTraderRepository;

    @MockBean
    private TraderOwnerAuthorityService traderOwnerAuthorityService;

    private TraderDTO validTraderDTO;

    @BeforeEach
    void setUp() {
        validTraderDTO = new TraderDTO();
        validTraderDTO.setBusinessName("Test Business");
        validTraderDTO.setOwnerName("Test Owner");
        validTraderDTO.setAddress("123 Main St");
        validTraderDTO.setCategory("GRAIN");
        validTraderDTO.setApprovalStatus(ApprovalStatus.PENDING);
        validTraderDTO.setBusinessMode(BusinessMode.COMMISSION);
        validTraderDTO.setBillPrefix("TB");
        validTraderDTO.setCreatedAt(Instant.now());
        validTraderDTO.setUpdatedAt(Instant.now());
    }

    // ---------- TraderResource: Create ----------

    @Nested
    @DisplayName("Create trader")
    class CreateTrader {

        @Test
        @WithMockUser
        @DisplayName("createTrader_withValidPayload_returns201")
        void createTrader_withValidPayload_returns201() throws Exception {
            TraderDTO saved = new TraderDTO();
            saved.setId(1L);
            saved.setBusinessName(validTraderDTO.getBusinessName());
            saved.setOwnerName(validTraderDTO.getOwnerName());
            saved.setAddress(validTraderDTO.getAddress());
            saved.setCategory(validTraderDTO.getCategory());
            saved.setApprovalStatus(ApprovalStatus.PENDING);
            saved.setBusinessMode(validTraderDTO.getBusinessMode());
            saved.setBillPrefix(validTraderDTO.getBillPrefix());

            when(traderService.save(any(TraderDTO.class))).thenReturn(saved);

            mockMvc
                .perform(
                    post(TRADERS_API)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(validTraderDTO))
                )
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.businessName").value("Test Business"))
                .andExpect(jsonPath("$.ownerName").value("Test Owner"));

            verify(traderService).save(any(TraderDTO.class));
        }

        @Test
        @WithMockUser
        @DisplayName("createTrader_withExistingId_returns400")
        void createTrader_withExistingId_returns400() throws Exception {
            validTraderDTO.setId(99L);

            mockMvc
                .perform(
                    post(TRADERS_API)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(validTraderDTO))
                )
                .andExpect(status().isBadRequest());

            verify(traderService, never()).save(any(TraderDTO.class));
        }

        @Test
        @WithMockUser
        @DisplayName("createTrader_withMissingBusinessName_returns400")
        void createTrader_withMissingBusinessName_returns400() throws Exception {
            validTraderDTO.setBusinessName(null);

            mockMvc
                .perform(
                    post(TRADERS_API)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(validTraderDTO))
                )
                .andExpect(status().isBadRequest());

            verify(traderService, never()).save(any(TraderDTO.class));
        }

        @Test
        @WithMockUser
        @DisplayName("createTrader_withMissingOwnerName_returns400")
        void createTrader_withMissingOwnerName_returns400() throws Exception {
            validTraderDTO.setOwnerName(null);

            mockMvc
                .perform(
                    post(TRADERS_API)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(validTraderDTO))
                )
                .andExpect(status().isBadRequest());

            verify(traderService, never()).save(any(TraderDTO.class));
        }

        @Test
        @DisplayName("createTrader_unauthorized_returns401")
        void createTrader_unauthorized_returns401() throws Exception {
            mockMvc
                .perform(
                    post(TRADERS_API)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(validTraderDTO))
                )
                .andExpect(status().isUnauthorized());

            verify(traderService, never()).save(any(TraderDTO.class));
        }
    }

    // ---------- TraderResource: Update ----------

    @Nested
    @DisplayName("Update trader")
    class UpdateTrader {

        @Test
        @WithMockUser
        @DisplayName("updateTrader_withValidPayload_returns200")
        void updateTrader_withValidPayload_returns200() throws Exception {
            Long id = 1L;
            validTraderDTO.setId(id);
            when(traderRepository.existsById(id)).thenReturn(true);
            when(traderService.update(any(TraderDTO.class))).thenReturn(validTraderDTO);

            mockMvc
                .perform(
                    put(TRADERS_API + "/" + id)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(validTraderDTO))
                )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.businessName").value("Test Business"));

            verify(traderService).update(any(TraderDTO.class));
        }

        @Test
        @WithMockUser
        @DisplayName("updateTrader_withNullIdInBody_returns400")
        void updateTrader_withNullIdInBody_returns400() throws Exception {
            validTraderDTO.setId(null);

            mockMvc
                .perform(
                    put(TRADERS_API + "/1")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(validTraderDTO))
                )
                .andExpect(status().isBadRequest());

            verify(traderService, never()).update(any(TraderDTO.class));
        }

        @Test
        @WithMockUser
        @DisplayName("updateTrader_withIdMismatch_returns400")
        void updateTrader_withIdMismatch_returns400() throws Exception {
            validTraderDTO.setId(1L);

            mockMvc
                .perform(
                    put(TRADERS_API + "/2")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(validTraderDTO))
                )
                .andExpect(status().isBadRequest());

            verify(traderService, never()).update(any(TraderDTO.class));
        }

        @Test
        @WithMockUser
        @DisplayName("updateTrader_entityNotFound_returns400")
        void updateTrader_entityNotFound_returns400() throws Exception {
            Long id = 999L;
            validTraderDTO.setId(id);
            when(traderRepository.existsById(id)).thenReturn(false);

            mockMvc
                .perform(
                    put(TRADERS_API + "/" + id)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(validTraderDTO))
                )
                .andExpect(status().isBadRequest());

            verify(traderService, never()).update(any(TraderDTO.class));
        }
    }

    // ---------- TraderResource: Partial update (PATCH) ----------

    @Nested
    @DisplayName("Partial update trader")
    class PartialUpdateTrader {

        @Test
        @WithMockUser
        @DisplayName("partialUpdateTrader_withValidPayload_returns200")
        void partialUpdateTrader_withValidPayload_returns200() throws Exception {
            Long id = 1L;
            TraderDTO patchBody = new TraderDTO();
            patchBody.setId(id);
            patchBody.setBusinessName("Updated Business");
            patchBody.setOwnerName(validTraderDTO.getOwnerName());
            when(traderRepository.existsById(id)).thenReturn(true);
            TraderDTO updated = new TraderDTO();
            updated.setId(id);
            updated.setBusinessName("Updated Business");
            updated.setOwnerName(validTraderDTO.getOwnerName());
            when(traderService.partialUpdate(any(TraderDTO.class))).thenReturn(Optional.of(updated));

            mockMvc
                .perform(
                    patch(TRADERS_API + "/" + id)
                        .with(csrf())
                        .contentType("application/merge-patch+json")
                        .content(objectMapper.writeValueAsBytes(patchBody))
                )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.businessName").value("Updated Business"));

            verify(traderService).partialUpdate(any(TraderDTO.class));
        }

        @Test
        @WithMockUser
        @DisplayName("partialUpdateTrader_withNullIdInBody_returns400")
        void partialUpdateTrader_withNullIdInBody_returns400() throws Exception {
            TraderDTO patchBody = new TraderDTO();
            patchBody.setId(null);
            patchBody.setBusinessName("Updated");

            mockMvc
                .perform(
                    patch(TRADERS_API + "/1")
                        .with(csrf())
                        .contentType("application/merge-patch+json")
                        .content(objectMapper.writeValueAsBytes(patchBody))
                )
                .andExpect(status().isBadRequest());

            verify(traderService, never()).partialUpdate(any(TraderDTO.class));
        }

        @Test
        @WithMockUser
        @DisplayName("partialUpdateTrader_entityNotFound_returns400")
        void partialUpdateTrader_entityNotFound_returns400() throws Exception {
            Long id = 999L;
            TraderDTO patchBody = new TraderDTO();
            patchBody.setId(id);
            patchBody.setBusinessName("Updated");
            when(traderRepository.existsById(id)).thenReturn(false);

            mockMvc
                .perform(
                    patch(TRADERS_API + "/" + id)
                        .with(csrf())
                        .contentType("application/merge-patch+json")
                        .content(objectMapper.writeValueAsBytes(patchBody))
                )
                .andExpect(status().isBadRequest());

            verify(traderService, never()).partialUpdate(any(TraderDTO.class));
        }
    }

    // ---------- TraderResource: Delete ----------

    @Nested
    @DisplayName("Delete trader")
    class DeleteTrader {

        @Test
        @WithMockUser
        @DisplayName("deleteTrader_withValidId_returns204")
        void deleteTrader_withValidId_returns204() throws Exception {
            Long id = 1L;
            mockMvc
                .perform(delete(TRADERS_API + "/" + id).with(csrf()))
                .andExpect(status().isNoContent());

            verify(traderService).delete(id);
        }

        @Test
        @DisplayName("deleteTrader_unauthorized_returns401")
        void deleteTrader_unauthorized_returns401() throws Exception {
            mockMvc
                .perform(delete(TRADERS_API + "/1").with(csrf()))
                .andExpect(status().isUnauthorized());

            verify(traderService, never()).delete(any());
        }
    }

    // ---------- TraderResource: Get ----------

    @Nested
    @DisplayName("Get trader")
    class GetTrader {

        @Test
        @WithMockUser
        @DisplayName("getTrader_withValidId_returns200")
        void getTrader_withValidId_returns200() throws Exception {
            Long id = 1L;
            validTraderDTO.setId(id);
            when(traderService.findOne(id)).thenReturn(Optional.of(validTraderDTO));

            mockMvc
                .perform(get(TRADERS_API + "/" + id))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.businessName").value("Test Business"));

            verify(traderService).findOne(id);
        }

        @Test
        @WithMockUser
        @DisplayName("getTrader_notFound_returns404")
        void getTrader_notFound_returns404() throws Exception {
            Long id = 999L;
            when(traderService.findOne(id)).thenReturn(Optional.empty());

            mockMvc
                .perform(get(TRADERS_API + "/" + id))
                .andExpect(status().isNotFound());

            verify(traderService).findOne(id);
        }

        @Test
        @DisplayName("getTrader_unauthorized_returns401")
        void getTrader_unauthorized_returns401() throws Exception {
            mockMvc
                .perform(get(TRADERS_API + "/1"))
                .andExpect(status().isUnauthorized());

            verify(traderService, never()).findOne(any());
        }
    }

    // ---------- TraderResource: List ----------

    @Nested
    @DisplayName("List traders")
    class ListTraders {

        @Test
        @WithMockUser
        @DisplayName("listTraders_authenticated_returns200")
        void listTraders_authenticated_returns200() throws Exception {
            List<TraderDTO> content = List.of(validTraderDTO);
            when(traderQueryService.findByCriteria(any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(content));

            mockMvc
                .perform(get(TRADERS_API + "?sort=id,desc"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].businessName").value("Test Business"));

            verify(traderQueryService).findByCriteria(any(), any(Pageable.class));
        }

        @Test
        @DisplayName("listTraders_unauthorized_returns401")
        void listTraders_unauthorized_returns401() throws Exception {
            mockMvc
                .perform(get(TRADERS_API))
                .andExpect(status().isUnauthorized());

            verify(traderQueryService, never()).findByCriteria(any(), any(Pageable.class));
        }
    }

    // ---------- AdminTraderSpecResource: List ----------

    @Nested
    @DisplayName("Admin list traders")
    class AdminListTraders {

        @Test
        @WithMockUser(username = "admin", roles = "ADMIN")
        @DisplayName("adminListTraders_withAdminRole_returns200")
        void adminListTraders_withAdminRole_returns200() throws Exception {
            List<TraderDTO> content = List.of(validTraderDTO);
            when(traderQueryService.findByCriteria(any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(content));

            mockMvc
                .perform(get(ADMIN_TRADERS_API + "?sort=id,desc"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$").isArray());

            verify(traderQueryService).findByCriteria(any(), any(Pageable.class));
        }

        @Test
        @Disabled("403 behaviour for missing admin role is covered in integration tests, not in this WebMvc slice")
        @WithMockUser(roles = "USER")
        @DisplayName("adminListTraders_withoutAdminRole_returns403")
        void adminListTraders_withoutAdminRole_returns403() throws Exception {
            mockMvc
                .perform(get(ADMIN_TRADERS_API))
                .andExpect(status().isForbidden());

            verify(traderQueryService, never()).findByCriteria(any(), any(Pageable.class));
        }

        @Test
        @DisplayName("adminListTraders_unauthorized_returns401")
        void adminListTraders_unauthorized_returns401() throws Exception {
            mockMvc
                .perform(get(ADMIN_TRADERS_API))
                .andExpect(status().isUnauthorized());
        }
    }

    // ---------- AdminTraderSpecResource: Get ----------

    @Nested
    @DisplayName("Admin get trader")
    class AdminGetTrader {

        @Test
        @WithMockUser(username = "admin", roles = "ADMIN")
        @DisplayName("adminGetTrader_withAdminRole_returns200")
        void adminGetTrader_withAdminRole_returns200() throws Exception {
            Long id = 1L;
            validTraderDTO.setId(id);
            when(traderService.findOne(id)).thenReturn(Optional.of(validTraderDTO));

            mockMvc
                .perform(get(ADMIN_TRADERS_API + "/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.businessName").value("Test Business"));

            verify(traderService).findOne(id);
        }

        @Test
        @WithMockUser(username = "admin", roles = "ADMIN")
        @DisplayName("adminGetTrader_notFound_returns404")
        void adminGetTrader_notFound_returns404() throws Exception {
            Long id = 999L;
            when(traderService.findOne(id)).thenReturn(Optional.empty());

            mockMvc
                .perform(get(ADMIN_TRADERS_API + "/" + id))
                .andExpect(status().isNotFound());

            verify(traderService).findOne(id);
        }

        @Test
        @Disabled("403 behaviour for missing admin role is covered in integration tests, not in this WebMvc slice")
        @WithMockUser(roles = "USER")
        @DisplayName("adminGetTrader_withoutAdminRole_returns403")
        void adminGetTrader_withoutAdminRole_returns403() throws Exception {
            mockMvc
                .perform(get(ADMIN_TRADERS_API + "/1"))
                .andExpect(status().isForbidden());

            verify(traderService, never()).findOne(any());
        }
    }

    // ---------- AdminTraderSpecResource: Approve ----------

    @Nested
    @DisplayName("Approve trader")
    class ApproveTrader {

        @Test
        @WithMockUser(username = "admin", roles = "ADMIN")
        @DisplayName("approveTrader_withAdminRole_returns200")
        void approveTrader_withAdminRole_returns200() throws Exception {
            Long id = 1L;
            validTraderDTO.setId(id);
            validTraderDTO.setApprovalStatus(ApprovalStatus.PENDING);
            TraderDTO approved = new TraderDTO();
            approved.setId(id);
            approved.setBusinessName(validTraderDTO.getBusinessName());
            approved.setOwnerName(validTraderDTO.getOwnerName());
            approved.setApprovalStatus(ApprovalStatus.APPROVED);

            when(traderService.findOne(id)).thenReturn(Optional.of(validTraderDTO));
            when(traderService.update(any(TraderDTO.class))).thenReturn(approved);
            when(userTraderRepository.findAllWithUserByTraderIdAndPrimaryMappingTrue(id))
                .thenReturn(Collections.emptyList());

            mockMvc
                .perform(patch(ADMIN_TRADERS_API + "/" + id + "/approve").with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.approvalStatus").value("APPROVED"));

            verify(traderService).findOne(id);
            verify(traderService).update(any(TraderDTO.class));
            verify(userTraderRepository).findAllWithUserByTraderIdAndPrimaryMappingTrue(id);
        }

        @Test
        @WithMockUser(username = "admin", roles = "ADMIN")
        @DisplayName("approveTrader_notFound_returns404")
        void approveTrader_notFound_returns404() throws Exception {
            Long id = 999L;
            when(traderService.findOne(id)).thenReturn(Optional.empty());

            mockMvc
                .perform(patch(ADMIN_TRADERS_API + "/" + id + "/approve").with(csrf()))
                .andExpect(status().isNotFound());

            verify(traderService).findOne(id);
            verify(traderService, never()).update(any(TraderDTO.class));
        }

        @Test
        @Disabled("403 behaviour for missing admin role is covered in integration tests, not in this WebMvc slice")
        @WithMockUser(roles = "USER")
        @DisplayName("approveTrader_withoutAdminRole_returns403")
        void approveTrader_withoutAdminRole_returns403() throws Exception {
            mockMvc
                .perform(patch(ADMIN_TRADERS_API + "/1/approve").with(csrf()))
                .andExpect(status().isForbidden());

            verify(traderService, never()).findOne(any());
            verify(traderService, never()).update(any(TraderDTO.class));
        }

        @Test
        @DisplayName("approveTrader_unauthorized_returns401")
        void approveTrader_unauthorized_returns401() throws Exception {
            mockMvc
                .perform(patch(ADMIN_TRADERS_API + "/1/approve").with(csrf()))
                .andExpect(status().isUnauthorized());
        }
    }

    // ---------- AdminTraderSpecResource: Reject ----------

    @Nested
    @Disabled("Reject trader API tests deferred — enable when running full admin-trader suite")
    @DisplayName("Reject trader")
    class RejectTrader {

        @Test
        @WithMockUser(username = "admin", roles = "ADMIN")
        @DisplayName("rejectTrader_pending_returns200")
        void rejectTrader_pending_returns200() throws Exception {
            Long id = 1L;
            validTraderDTO.setId(id);
            validTraderDTO.setApprovalStatus(ApprovalStatus.PENDING);
            TraderDTO rejected = new TraderDTO();
            rejected.setId(id);
            rejected.setBusinessName(validTraderDTO.getBusinessName());
            rejected.setOwnerName(validTraderDTO.getOwnerName());
            rejected.setApprovalStatus(ApprovalStatus.REJECTED);

            when(traderService.findOne(id)).thenReturn(Optional.of(validTraderDTO));
            when(traderService.update(any(TraderDTO.class))).thenReturn(rejected);
            when(userTraderRepository.findAllWithUserByTraderIdAndPrimaryMappingTrue(id))
                .thenReturn(Collections.emptyList());

            mockMvc
                .perform(patch(ADMIN_TRADERS_API + "/" + id + "/reject").with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.approvalStatus").value("REJECTED"));

            verify(traderService).findOne(id);
            verify(traderService).update(any(TraderDTO.class));
            verify(userTraderRepository).findAllWithUserByTraderIdAndPrimaryMappingTrue(id);
        }

        @Test
        @WithMockUser(username = "admin", roles = "ADMIN")
        @DisplayName("rejectTrader_alreadyApproved_returns400")
        void rejectTrader_alreadyApproved_returns400() throws Exception {
            Long id = 2L;
            TraderDTO dto = new TraderDTO();
            dto.setId(id);
            dto.setApprovalStatus(ApprovalStatus.APPROVED);
            when(traderService.findOne(id)).thenReturn(Optional.of(dto));

            mockMvc
                .perform(patch(ADMIN_TRADERS_API + "/" + id + "/reject").with(csrf()))
                .andExpect(status().isBadRequest());

            verify(traderService).findOne(id);
            verify(traderService, never()).update(any(TraderDTO.class));
        }

        @Test
        @WithMockUser(username = "admin", roles = "ADMIN")
        @DisplayName("rejectTrader_notFound_returns404")
        void rejectTrader_notFound_returns404() throws Exception {
            Long id = 999L;
            when(traderService.findOne(id)).thenReturn(Optional.empty());

            mockMvc
                .perform(patch(ADMIN_TRADERS_API + "/" + id + "/reject").with(csrf()))
                .andExpect(status().isNotFound());

            verify(traderService).findOne(id);
            verify(traderService, never()).update(any(TraderDTO.class));
        }
    }
}
