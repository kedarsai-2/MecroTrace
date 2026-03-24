package com.mercotrace.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mercotrace.IntegrationTest;
import com.mercotrace.domain.Commodity;
import com.mercotrace.domain.Contact;
import com.mercotrace.domain.Vehicle;
import com.mercotrace.domain.enumeration.FreightMethod;
import com.mercotrace.repository.CommodityRepository;
import com.mercotrace.repository.ContactRepository;
import com.mercotrace.repository.VehicleRepository;
import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalLotDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalRequestDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalSellerDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalSummaryDTO;
import java.util.Map;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(authorities = { AuthoritiesConstants.ARRIVALS_VIEW, AuthoritiesConstants.ARRIVALS_CREATE, AuthoritiesConstants.ARRIVALS_EDIT })
class ArrivalResourceIT {

    private static final String ENTITY_API_URL = "/api/arrivals";

    @Autowired
    private ObjectMapper om;

    @Autowired
    private MockMvc restArrivalMockMvc;

    @Autowired
    private CommodityRepository commodityRepository;

    @Autowired
    private ContactRepository contactRepository;

    @Autowired
    private VehicleRepository vehicleRepository;

    @MockBean
    private TraderContextService traderContextService;

    private Commodity commodity;

    private Contact contact;

    private Vehicle insertedVehicle;

    @BeforeEach
    void initTest() {
        when(traderContextService.getCurrentTraderId()).thenReturn(1L);

        commodity = new Commodity();
        commodity.setTraderId(1L);
        commodity.setCommodityName("POTATO");
        commodity.setCreatedAt(Instant.now());
        commodity = commodityRepository.saveAndFlush(commodity);

        contact = new Contact();
        contact.setTraderId(1L);
        contact.setName("Test Seller");
        contact.setPhone("9999999999");
        contact.setOpeningBalance(BigDecimal.ZERO);
        contact.setCurrentBalance(BigDecimal.ZERO);
        contact = contactRepository.saveAndFlush(contact);
    }

    @AfterEach
    void cleanup() {
        if (insertedVehicle != null) {
            vehicleRepository.delete(insertedVehicle);
            insertedVehicle = null;
        }
        if (contact != null && contact.getId() != null) {
            contactRepository.deleteById(contact.getId());
        }
        if (commodity != null && commodity.getId() != null) {
            commodityRepository.deleteById(commodity.getId());
        }
    }

    @Test
    @Transactional
    void createSingleSellerArrivalByWeight() throws Exception {
        ArrivalRequestDTO request = buildBasicRequest(false);

        String responseBody = restArrivalMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(request)))
            .andExpect(status().isCreated())
            .andExpect(header().string("Location", org.hamcrest.Matchers.containsString(ENTITY_API_URL + "/")))
            .andReturn()
            .getResponse()
            .getContentAsString();

        ArrivalSummaryDTO summary = om.readValue(responseBody, ArrivalSummaryDTO.class);

        assertThat(summary.getVehicleId()).isNotNull();
        assertThat(summary.getVehicleNumber()).isEqualTo("SINGLE-SELLER");
        assertThat(summary.getSellerCount()).isEqualTo(1);
        assertThat(summary.getLotCount()).isEqualTo(1);
        assertThat(summary.getNetWeight()).isEqualTo(900.0);
        assertThat(summary.getFinalBillableWeight()).isEqualTo(800.0);
        assertThat(summary.getFreightMethod()).isEqualTo(FreightMethod.BY_WEIGHT);
        assertThat(summary.getFreightTotal()).isEqualTo(800.0 * 2.5);

        insertedVehicle = vehicleRepository.findById(summary.getVehicleId()).orElse(null);
        assertThat(insertedVehicle).isNotNull();
    }

    @Test
    @Transactional
    void createMultiSellerArrivalWithoutVehicleNumberIsBadRequest() throws Exception {
        ArrivalRequestDTO request = buildBasicRequest(true);
        request.setVehicleNumber(null);

        restArrivalMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(request)))
            .andExpect(status().isBadRequest());
    }

    @Test
    @Transactional
    void createArrivalWithSellerWithoutLotsIsBadRequest() throws Exception {
        ArrivalRequestDTO request = buildBasicRequest(false);
        request.getSellers().get(0).setLots(List.of());

        restArrivalMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(request)))
            .andExpect(status().isBadRequest());
    }

    @Test
    @Transactional
    void getAllArrivalsReturnsPaginatedSummaries() throws Exception {
        ArrivalRequestDTO request = buildBasicRequest(false);

        String responseBody = restArrivalMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(request)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();

        ArrivalSummaryDTO created = om.readValue(responseBody, ArrivalSummaryDTO.class);
        insertedVehicle = vehicleRepository.findById(created.getVehicleId()).orElse(null);

        restArrivalMockMvc
            .perform(get(ENTITY_API_URL + "?page=0&size=20"))
            .andExpect(status().isOk())
            .andExpect(header().string("X-Total-Count", org.hamcrest.Matchers.notNullValue()))
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$", hasSize(org.hamcrest.Matchers.greaterThanOrEqualTo(1))))
            .andExpect(jsonPath("$[0].vehicleId").isNotEmpty())
            .andExpect(jsonPath("$[0].vehicleNumber").isNotEmpty())
            .andExpect(jsonPath("$[0].sellerCount").isNumber())
            .andExpect(jsonPath("$[0].lotCount").isNumber());
    }

    @Test
    @Transactional
    void getArrivalByIdReturnsSellerSerialAndPatchPreservesIt() throws Exception {
        ArrivalRequestDTO request = buildBasicRequest(false);
        ArrivalLotDTO secondLot = new ArrivalLotDTO();
        secondLot.setLotName("LOT-2");
        secondLot.setBagCount(12);
        secondLot.setCommodityName(commodity.getCommodityName());
        request.getSellers().get(0).setLots(List.of(request.getSellers().get(0).getLots().get(0), secondLot));

        String responseBody = restArrivalMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(request)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();

        ArrivalSummaryDTO created = om.readValue(responseBody, ArrivalSummaryDTO.class);
        insertedVehicle = vehicleRepository.findById(created.getVehicleId()).orElse(null);

        String detailBody = restArrivalMockMvc
            .perform(get(ENTITY_API_URL + "/" + created.getVehicleId()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sellers", hasSize(1)))
            .andExpect(jsonPath("$.sellers[0].sellerSerialNumber").value(1))
            .andExpect(jsonPath("$.sellers[0].lots", hasSize(2)))
            .andExpect(jsonPath("$.sellers[0].lots[0].lotSerialNumber").value(1))
            .andExpect(jsonPath("$.sellers[0].lots[1].lotSerialNumber").value(2))
            .andReturn()
            .getResponse()
            .getContentAsString();

        @SuppressWarnings("unchecked")
        Map<String, Object> detail = om.readValue(detailBody, Map.class);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> sellers = (List<Map<String, Object>>) detail.get("sellers");
        Map<String, Object> seller = sellers.get(0);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lots = (List<Map<String, Object>>) seller.get("lots");
        Map<String, Object> lot = lots.get(0);

        Map<String, Object> patchBody = Map.of(
            "multiSeller", false,
            "sellers", List.of(
                Map.of(
                    "contactId", contact.getId(),
                    "sellerSerialNumber", seller.get("sellerSerialNumber"),
                    "sellerName", seller.get("sellerName"),
                    "sellerPhone", seller.get("sellerPhone"),
                    "lots", List.of(
                        Map.of(
                            "lotName", lot.get("lotName"),
                            "lotSerialNumber", lot.get("lotSerialNumber"),
                            "bagCount", lot.get("bagCount"),
                            "commodityName", lot.get("commodityName")
                        ),
                        Map.of(
                            "lotName", lots.get(1).get("lotName"),
                            "lotSerialNumber", lots.get(1).get("lotSerialNumber"),
                            "bagCount", lots.get(1).get("bagCount"),
                            "commodityName", lots.get(1).get("commodityName")
                        )
                    )
                )
            )
        );

        restArrivalMockMvc
            .perform(patch(ENTITY_API_URL + "/" + created.getVehicleId()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(patchBody)))
            .andExpect(status().isOk());

        restArrivalMockMvc
            .perform(get(ENTITY_API_URL + "/" + created.getVehicleId()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sellers[0].sellerSerialNumber").value(1))
            .andExpect(jsonPath("$.sellers[0].lots[0].lotSerialNumber").value(1))
            .andExpect(jsonPath("$.sellers[0].lots[1].lotSerialNumber").value(2));
    }

    private ArrivalRequestDTO buildBasicRequest(boolean multiSeller) {
        ArrivalLotDTO lot = new ArrivalLotDTO();
        lot.setLotName("LOT-1");
        lot.setBagCount(10);
        lot.setCommodityName(commodity.getCommodityName());

        ArrivalSellerDTO seller = new ArrivalSellerDTO();
        seller.setContactId(contact.getId());
        seller.setSellerName(contact.getName());
        seller.setSellerPhone(contact.getPhone());
        seller.setLots(List.of(lot));

        ArrivalRequestDTO request = new ArrivalRequestDTO();
        request.setMultiSeller(multiSeller);
        if (multiSeller) {
            request.setVehicleNumber("KA01AB1234");
        }
        request.setLoadedWeight(1000.0);
        request.setEmptyWeight(100.0);
        request.setDeductedWeight(100.0);
        request.setFreightMethod(FreightMethod.BY_WEIGHT);
        request.setFreightRate(2.5);
        request.setNoRental(false);
        request.setAdvancePaid(0.0);
        request.setSellers(List.of(seller));
        return request;
    }
}

