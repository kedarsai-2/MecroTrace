package com.mercotrace.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mercotrace.IntegrationTest;
import com.mercotrace.domain.*;
import com.mercotrace.repository.*;
import com.mercotrace.service.dto.AuctionBidCreateRequest;
import com.mercotrace.service.dto.AuctionResultDTO;
import com.mercotrace.service.dto.AuctionSessionDTO;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for the {@link ModuleAuctionResource} REST controller (Auctions / Sales Pad).
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(authorities = {
    "ROLE_AUCTIONS_VIEW",
    "ROLE_AUCTIONS_CREATE",
    "ROLE_AUCTIONS_EDIT",
    "ROLE_AUCTIONS_DELETE",
    "ROLE_AUCTIONS_APPROVE"
})
class ModuleAuctionResourceIT {

    private static final String BASE_URL = "/api/module-auctions";

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private MockMvc restAuctionMockMvc;

    @Autowired
    private LotRepository lotRepository;

    @Autowired
    private AuctionRepository auctionRepository;

    @Autowired
    private AuctionEntryRepository auctionEntryRepository;

    @Autowired
    private ContactRepository contactRepository;

    @Autowired
    private CommodityRepository commodityRepository;

    @Autowired
    private VehicleRepository vehicleRepository;

    @Autowired
    private SellerInVehicleRepository sellerInVehicleRepository;

    private Contact contact;
    private Commodity commodity;
    private Vehicle vehicle;
    private SellerInVehicle sellerInVehicle;
    private Lot lot;

    @BeforeEach
    void initTest() {
        contact = new Contact();
        contact.setTraderId(1L);
        contact.setName("Test Seller");
        contact.setPhone("9999999999");
        contact.setMark("TS");
        contact.setOpeningBalance(BigDecimal.ZERO);
        contact.setCurrentBalance(BigDecimal.ZERO);
        contact.setCreatedAt(Instant.now());
        contact = contactRepository.saveAndFlush(contact);

        commodity = new Commodity();
        commodity.setTraderId(1L);
        commodity.setCommodityName("Tomato");
        commodity.setCreatedAt(Instant.now());
        commodity = commodityRepository.saveAndFlush(commodity);

        vehicle = new Vehicle();
        vehicle.setTraderId(1L);
        vehicle.setVehicleNumber("KA01AB1234");
        vehicle.setArrivalDatetime(Instant.now());
        vehicle.setCreatedAt(Instant.now());
        vehicle = vehicleRepository.saveAndFlush(vehicle);

        sellerInVehicle = new SellerInVehicle();
        sellerInVehicle.setVehicleId(vehicle.getId());
        sellerInVehicle.setContactId(contact.getId());
        sellerInVehicle = sellerInVehicleRepository.saveAndFlush(sellerInVehicle);

        lot = new Lot();
        lot.setSellerVehicleId(sellerInVehicle.getId());
        lot.setCommodityId(commodity.getId());
        lot.setLotName("LOT-AUCTION-IT");
        lot.setBagCount(40);
        lot.setSellerSerialNo(1);
        lot.setCreatedAt(Instant.now());
        lot = lotRepository.saveAndFlush(lot);
    }

    @AfterEach
    void cleanup() {
        if (lot != null && lot.getId() != null) {
            auctionEntryRepository.findAllByAuctionIdIn(
                auctionRepository.findAllByLotIdIn(java.util.List.of(lot.getId())).stream().map(Auction::getId).toList()
            ).forEach(auctionEntryRepository::delete);
            auctionRepository.findAllByLotIdIn(java.util.List.of(lot.getId())).forEach(auctionRepository::delete);
            lotRepository.deleteById(lot.getId());
        }
        if (sellerInVehicle != null && sellerInVehicle.getId() != null) {
            sellerInVehicleRepository.deleteById(sellerInVehicle.getId());
        }
        if (vehicle != null && vehicle.getId() != null) {
            vehicleRepository.deleteById(vehicle.getId());
        }
        if (commodity != null && commodity.getId() != null) {
            commodityRepository.deleteById(commodity.getId());
        }
        if (contact != null && contact.getId() != null) {
            contactRepository.deleteById(contact.getId());
        }
    }

    @Test
    @Transactional
    void getOrStartSessionCreatesAuctionAndReturnsSession() throws Exception {
        ResultActions result = restAuctionMockMvc
            .perform(get(BASE_URL + "/lots/{lotId}/session", lot.getId()))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("$.auction_id").isNumber())
            .andExpect(jsonPath("$.lot.lot_id").value(lot.getId().intValue()))
            .andExpect(jsonPath("$.entries").isArray())
            .andExpect(jsonPath("$.total_sold_bags").value(0))
            .andExpect(jsonPath("$.remaining_bags").value(40))
            .andExpect(jsonPath("$.status").value("AVAILABLE"));

        AuctionSessionDTO session = objectMapper.readValue(
            result.andReturn().getResponse().getContentAsString(),
            AuctionSessionDTO.class
        );
        assertThat(session.getAuctionId()).isNotNull();
        assertThat(session.getEntries()).isEmpty();
    }

    @Test
    @Transactional
    void addBidReturnsSessionWithOneEntry() throws Exception {
        AuctionBidCreateRequest request = new AuctionBidCreateRequest();
        request.setBuyerName("Vijay Traders");
        request.setBuyerMark("VT");
        request.setScribble(false);
        request.setSelfSale(false);
        request.setRate(BigDecimal.valueOf(850));
        request.setQuantity(15);
        request.setAllowLotIncrease(false);

        ResultActions result = restAuctionMockMvc
            .perform(
                post(BASE_URL + "/lots/{lotId}/session/bids", lot.getId())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(request))
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries", org.hamcrest.Matchers.hasSize(1)))
            .andExpect(jsonPath("$.total_sold_bags").value(15))
            .andExpect(jsonPath("$.remaining_bags").value(25));

        AuctionSessionDTO session = objectMapper.readValue(
            result.andReturn().getResponse().getContentAsString(),
            AuctionSessionDTO.class
        );
        assertThat(session.getEntries()).hasSize(1);
        assertThat(session.getEntries().get(0).getBidNumber()).isEqualTo(1);
        assertThat(session.getEntries().get(0).getQuantity()).isEqualTo(15);
    }

    @Test
    @Transactional
    void addBidOversellWithoutAllowLotIncreaseReturns409() throws Exception {
        AuctionBidCreateRequest request = new AuctionBidCreateRequest();
        request.setBuyerName("Buyer");
        request.setBuyerMark("B1");
        request.setRate(BigDecimal.valueOf(100));
        request.setQuantity(50);
        request.setAllowLotIncrease(false);

        restAuctionMockMvc
            .perform(
                post(BASE_URL + "/lots/{lotId}/session/bids", lot.getId())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(request))
            )
            .andExpect(status().isConflict());
    }

    @Test
    @Transactional
    void completeAuctionReturnsResult() throws Exception {
        AuctionBidCreateRequest request = new AuctionBidCreateRequest();
        request.setBuyerName("Vijay Traders");
        request.setBuyerMark("VT");
        request.setRate(BigDecimal.valueOf(800));
        request.setQuantity(40);
        request.setAllowLotIncrease(false);

        restAuctionMockMvc
            .perform(
                post(BASE_URL + "/lots/{lotId}/session/bids", lot.getId())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(request))
            )
            .andExpect(status().isOk());

        ResultActions completeResult = restAuctionMockMvc
            .perform(post(BASE_URL + "/lots/{lotId}/complete", lot.getId()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.auction_id").isNumber())
            .andExpect(jsonPath("$.lot_id").value(lot.getId().intValue()))
            .andExpect(jsonPath("$.entries", org.hamcrest.Matchers.hasSize(1)))
            .andExpect(jsonPath("$.completed_at").isNotEmpty());

        AuctionResultDTO result = objectMapper.readValue(
            completeResult.andReturn().getResponse().getContentAsString(),
            AuctionResultDTO.class
        );
        assertThat(result.getEntries()).hasSize(1);
        assertThat(result.getEntries().get(0).getBidNumber()).isEqualTo(1);
        assertThat(result.getEntries().get(0).getQuantity()).isEqualTo(40);
    }

    @Test
    @Transactional
    void getResultByBidNumberReturnsAuctionResult() throws Exception {
        AuctionBidCreateRequest request = new AuctionBidCreateRequest();
        request.setBuyerName("Vijay Traders");
        request.setBuyerMark("VT");
        request.setRate(BigDecimal.valueOf(600));
        request.setQuantity(40);
        request.setAllowLotIncrease(false);

        restAuctionMockMvc
            .perform(
                post(BASE_URL + "/lots/{lotId}/session/bids", lot.getId())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(request))
            )
            .andExpect(status().isOk());

        restAuctionMockMvc.perform(post(BASE_URL + "/lots/{lotId}/complete", lot.getId())).andExpect(status().isOk());

        restAuctionMockMvc
            .perform(get(BASE_URL + "/results/bids/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.lot_id").value(lot.getId().intValue()))
            .andExpect(jsonPath("$.entries[0].bid_number").value(1))
            .andExpect(jsonPath("$.entries[0].buyer_mark").value("VT"))
            .andExpect(jsonPath("$.entries[0].quantity").value(40));
    }

    @Test
    @Transactional
    void listLotsReturnsPaginatedLotsWithStatus() throws Exception {
        restAuctionMockMvc
            .perform(get(BASE_URL + "/lots").param("page", "0").param("size", "20"))
            .andExpect(status().isOk())
            .andExpect(header().string("X-Total-Count", org.hamcrest.Matchers.notNullValue()));
    }

}
