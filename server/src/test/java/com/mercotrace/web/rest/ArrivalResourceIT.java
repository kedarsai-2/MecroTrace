package com.mercotrace.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mercotrace.domain.Auction;
import com.mercotrace.domain.AuctionEntry;
import com.mercotrace.domain.AuctionSelfSaleUnit;
import com.mercotrace.domain.Cdn;
import com.mercotrace.domain.CdnItem;
import com.mercotrace.domain.SalesBill;
import com.mercotrace.domain.SalesBillCommodityGroup;
import com.mercotrace.domain.SalesBillLineItem;
import com.mercotrace.domain.enumeration.AuctionPresetType;
import com.mercotrace.domain.enumeration.AuctionSelfSaleUnitStatus;
import com.mercotrace.domain.enumeration.CdnSource;
import com.mercotrace.domain.enumeration.CdnStatus;
import com.mercotrace.IntegrationTest;
import com.mercotrace.domain.Commodity;
import com.mercotrace.domain.Contact;
import com.mercotrace.domain.Vehicle;
import com.mercotrace.domain.enumeration.FreightMethod;
import com.mercotrace.repository.AuctionEntryRepository;
import com.mercotrace.repository.AuctionRepository;
import com.mercotrace.repository.AuctionSelfSaleUnitRepository;
import com.mercotrace.repository.CdnRepository;
import com.mercotrace.repository.SalesBillRepository;
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
@WithMockUser(authorities = { AuthoritiesConstants.ARRIVALS_VIEW, AuthoritiesConstants.ARRIVALS_CREATE, AuthoritiesConstants.ARRIVALS_EDIT, AuthoritiesConstants.ARRIVALS_DELETE })
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
    private SalesBillRepository salesBillRepository;

    @Autowired
    private CdnRepository cdnRepository;

    @Autowired
    private AuctionRepository auctionRepository;

    @Autowired
    private AuctionEntryRepository auctionEntryRepository;

    @Autowired
    private AuctionSelfSaleUnitRepository auctionSelfSaleUnitRepository;

    @MockBean
    private TraderContextService traderContextService;

    @Autowired
    private VehicleRepository vehicleRepository;

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
    void createPartialMultiSellerArrivalWithoutVehicleNumberSucceeds() throws Exception {
        ArrivalRequestDTO request = buildBasicRequest(true);
        request.setVehicleNumber(null);
        request.setPartiallyCompleted(true);

        String responseBody = restArrivalMockMvc
            .perform(post(ENTITY_API_URL + "/partial").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(request)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();

        ArrivalSummaryDTO summary = om.readValue(responseBody, ArrivalSummaryDTO.class);
        assertThat(summary.getVehicleId()).isNotNull();
        assertThat(summary.isPartiallyCompleted()).isTrue();
        insertedVehicle = vehicleRepository.findById(summary.getVehicleId()).orElse(null);
        assertThat(insertedVehicle).isNotNull();
    }

    @Test
    @Transactional
    void createPartialArrivalWithoutSellersSucceeds() throws Exception {
        ArrivalRequestDTO request = new ArrivalRequestDTO();
        request.setMultiSeller(true);
        request.setPartiallyCompleted(true);
        request.setLoadedWeight(0d);
        request.setEmptyWeight(0d);
        request.setDeductedWeight(0d);
        request.setFreightMethod(FreightMethod.BY_WEIGHT);
        request.setFreightRate(0d);
        request.setNoRental(true);
        request.setAdvancePaid(0d);
        request.setSellers(List.of());

        String responseBody = restArrivalMockMvc
            .perform(post(ENTITY_API_URL + "/partial").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(request)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();

        ArrivalSummaryDTO summary = om.readValue(responseBody, ArrivalSummaryDTO.class);
        assertThat(summary.getSellerCount()).isZero();
        assertThat(summary.isPartiallyCompleted()).isTrue();
        insertedVehicle = vehicleRepository.findById(summary.getVehicleId()).orElse(null);
        assertThat(insertedVehicle).isNotNull();
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
    void createArrivalWithNonAlphanumericVehicleMarkAliasIsBadRequest() throws Exception {
        ArrivalRequestDTO request = buildBasicRequest(true);
        request.setVehicleMarkAlias("BAD-1");
        restArrivalMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(request)))
            .andExpect(status().isBadRequest())
            .andExpect(content().string(org.hamcrest.Matchers.containsString("letters and numbers")));
    }

    @Test
    @Transactional
    void createArrivalWithDuplicateVehicleMarkAliasIsBadRequest() throws Exception {
        ArrivalRequestDTO first = buildBasicRequest(true);
        first.setVehicleMarkAlias("ALIAS1");
        String firstBody = restArrivalMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(first)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        ArrivalSummaryDTO firstSummary = om.readValue(firstBody, ArrivalSummaryDTO.class);
        insertedVehicle = vehicleRepository.findById(firstSummary.getVehicleId()).orElse(null);

        ArrivalRequestDTO second = buildBasicRequest(true);
        second.setVehicleNumber("KA02XY9999");
        second.setVehicleMarkAlias("alias1");

        restArrivalMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(second)))
            .andExpect(status().isBadRequest())
            .andExpect(content().string(org.hamcrest.Matchers.containsString("Vehicle mark/alias")));
    }

    @Test
    @Transactional
    void createArrivalWithDuplicateLotNamesWithinSameSellerIsBadRequest() throws Exception {
        ArrivalLotDTO lot1 = new ArrivalLotDTO();
        lot1.setLotName("Lot-1");
        lot1.setBagCount(10);
        lot1.setCommodityName(commodity.getCommodityName());

        ArrivalLotDTO lot2 = new ArrivalLotDTO();
        lot2.setLotName("  lot-1  ");
        lot2.setBagCount(12);
        lot2.setCommodityName(commodity.getCommodityName());

        ArrivalSellerDTO seller = new ArrivalSellerDTO();
        seller.setContactId(contact.getId());
        seller.setSellerName(contact.getName());
        seller.setSellerPhone(contact.getPhone());
        seller.setLots(List.of(lot1, lot2));

        ArrivalRequestDTO request = new ArrivalRequestDTO();
        request.setMultiSeller(false);
        request.setLoadedWeight(1000.0);
        request.setEmptyWeight(100.0);
        request.setDeductedWeight(100.0);
        request.setFreightMethod(FreightMethod.BY_WEIGHT);
        request.setFreightRate(2.5);
        request.setNoRental(false);
        request.setAdvancePaid(0.0);
        request.setSellers(List.of(seller));

        restArrivalMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(request)))
            .andExpect(status().isBadRequest())
            .andExpect(content().string(org.hamcrest.Matchers.containsString("Lot Name already exists for this seller")));
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

    @Test
    @Transactional
    void deleteArrivalSucceedsWhenNoDownstreamData() throws Exception {
        ArrivalRequestDTO request = buildBasicRequest(false);
        String responseBody = restArrivalMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(request)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        ArrivalSummaryDTO summary = om.readValue(responseBody, ArrivalSummaryDTO.class);
        long vid = summary.getVehicleId();
        restArrivalMockMvc.perform(delete(ENTITY_API_URL + "/" + vid)).andExpect(status().isNoContent());
        assertThat(vehicleRepository.findById(vid)).isEmpty();
        insertedVehicle = null;
    }

    @Test
    @Transactional
    void deleteArrivalReturns409WhenBillingReferencesLot() throws Exception {
        ArrivalRequestDTO request = buildBasicRequest(false);
        String responseBody = restArrivalMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(request)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        ArrivalSummaryDTO summary = om.readValue(responseBody, ArrivalSummaryDTO.class);
        long vid = summary.getVehicleId();
        long lotId = readFirstLotIdFromArrivalDetail(vid);

        SalesBill bill = new SalesBill();
        bill.setTraderId(1L);
        bill.setBuyerName("Buyer");
        bill.setBuyerMark("BM");
        bill.setBillingName("Buyer");
        bill.setBillDate(Instant.now());
        bill.setOutboundFreight(BigDecimal.ZERO);
        bill.setTokenAdvance(BigDecimal.ZERO);
        bill.setGrandTotal(BigDecimal.TEN);
        bill.setPendingBalance(BigDecimal.TEN);

        SalesBillCommodityGroup group = new SalesBillCommodityGroup();
        group.setSalesBill(bill);
        group.setCommodityName("Wheat");
        group.setSubtotal(BigDecimal.TEN);
        group.setSortOrder(0);
        bill.getCommodityGroups().add(group);

        SalesBillLineItem line = new SalesBillLineItem();
        line.setCommodityGroup(group);
        line.setBidNumber(1);
        line.setQuantity(1);
        line.setWeight(BigDecimal.ONE);
        line.setBaseRate(BigDecimal.TEN);
        line.setNewRate(BigDecimal.TEN);
        line.setAmount(BigDecimal.TEN);
        line.setLotId(String.valueOf(lotId));
        line.setSortOrder(0);
        group.getItems().add(line);

        salesBillRepository.saveAndFlush(bill);

        restArrivalMockMvc
            .perform(delete(ENTITY_API_URL + "/" + vid))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.blockers").isArray())
            .andExpect(jsonPath("$.blockers[0]").value("BILLING"));
        insertedVehicle = null;
    }

    @Test
    @Transactional
    void deleteArrivalReturns409WhenCdnItemReferencesLot() throws Exception {
        ArrivalRequestDTO request = buildBasicRequest(false);
        String responseBody = restArrivalMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(request)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        ArrivalSummaryDTO summary = om.readValue(responseBody, ArrivalSummaryDTO.class);
        long vid = summary.getVehicleId();
        long lotId = readFirstLotIdFromArrivalDetail(vid);

        Cdn cdn = new Cdn();
        cdn.setTraderId(1L);
        cdn.setCdnNumber("CDN-DEL-GUARD-1");
        cdn.setCdnDate(Instant.now());
        cdn.setSource(CdnSource.DIRECT);
        cdn.setStatus(CdnStatus.DRAFT);
        CdnItem item = new CdnItem();
        item.setCdn(cdn);
        item.setLotId(lotId);
        item.setCommodityId(commodity.getId());
        item.setQuantity(1);
        item.setIsDeleted(false);
        cdn.getItems().add(item);
        cdnRepository.saveAndFlush(cdn);

        restArrivalMockMvc
            .perform(delete(ENTITY_API_URL + "/" + vid))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.blockers").value(org.hamcrest.Matchers.hasItem("CDN")));
        insertedVehicle = null;
    }

    @Test
    @Transactional
    void deleteArrivalReturns409WhenAuctionSelfSaleUnitReferencesLot() throws Exception {
        ArrivalRequestDTO request = buildBasicRequest(false);
        String responseBody = restArrivalMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(request)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        ArrivalSummaryDTO summary = om.readValue(responseBody, ArrivalSummaryDTO.class);
        long vid = summary.getVehicleId();
        long lotId = readFirstLotIdFromArrivalDetail(vid);

        Instant now = Instant.now();
        Auction auction = new Auction();
        auction.setTraderId(1L);
        auction.setLotId(lotId);
        auction.setAuctionDatetime(now);
        auction.setCreatedAt(now);
        auction.setCreatedBy("test");
        auction = auctionRepository.saveAndFlush(auction);

        AuctionEntry entry = new AuctionEntry();
        entry.setAuctionId(auction.getId());
        entry.setBidNumber(1);
        entry.setBidRate(BigDecimal.TEN);
        entry.setPresetMargin(BigDecimal.ZERO);
        entry.setPresetType(AuctionPresetType.PROFIT);
        entry.setSellerRate(BigDecimal.TEN);
        entry.setSummarySellerRate(BigDecimal.TEN);
        entry.setBuyerRate(BigDecimal.TEN);
        entry.setQuantity(1);
        entry.setAmount(BigDecimal.TEN);
        entry.setTokenAdvance(BigDecimal.ZERO);
        entry.setExtraRate(BigDecimal.ZERO);
        entry.setBuyerName("B");
        entry.setBuyerMark("M");
        entry.setCreatedAt(now);
        entry.setCreatedBy("test");
        entry = auctionEntryRepository.saveAndFlush(entry);

        AuctionSelfSaleUnit unit = new AuctionSelfSaleUnit();
        unit.setTraderId(1L);
        unit.setLotId(lotId);
        unit.setSourceAuctionId(auction.getId());
        unit.setSourceAuctionEntryId(entry.getId());
        unit.setSelfSaleQty(1);
        unit.setRemainingQty(1);
        unit.setRate(BigDecimal.TEN);
        unit.setAmount(BigDecimal.TEN);
        unit.setStatus(AuctionSelfSaleUnitStatus.OPEN);
        unit.setCreatedAt(now);
        unit.setCreatedBy("test");
        auctionSelfSaleUnitRepository.saveAndFlush(unit);

        restArrivalMockMvc
            .perform(delete(ENTITY_API_URL + "/" + vid))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.blockers").value(org.hamcrest.Matchers.hasItem("AUCTION_SELF_SALE")));
        insertedVehicle = null;
    }

    @Test
    @Transactional
    void getArrivalDetailIncludesDeleteBlockersWhenBillingReferencesLot() throws Exception {
        ArrivalRequestDTO request = buildBasicRequest(false);
        String responseBody = restArrivalMockMvc
            .perform(post(ENTITY_API_URL).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(request)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        ArrivalSummaryDTO summary = om.readValue(responseBody, ArrivalSummaryDTO.class);
        long vid = summary.getVehicleId();
        long lotId = readFirstLotIdFromArrivalDetail(vid);

        SalesBill bill = new SalesBill();
        bill.setTraderId(1L);
        bill.setBuyerName("Buyer");
        bill.setBuyerMark("BM");
        bill.setBillingName("Buyer");
        bill.setBillDate(Instant.now());
        bill.setOutboundFreight(BigDecimal.ZERO);
        bill.setTokenAdvance(BigDecimal.ZERO);
        bill.setGrandTotal(BigDecimal.TEN);
        bill.setPendingBalance(BigDecimal.TEN);
        SalesBillCommodityGroup group = new SalesBillCommodityGroup();
        group.setSalesBill(bill);
        group.setCommodityName("Wheat");
        group.setSubtotal(BigDecimal.TEN);
        group.setSortOrder(0);
        bill.getCommodityGroups().add(group);
        SalesBillLineItem line = new SalesBillLineItem();
        line.setCommodityGroup(group);
        line.setBidNumber(1);
        line.setQuantity(1);
        line.setWeight(BigDecimal.ONE);
        line.setBaseRate(BigDecimal.TEN);
        line.setNewRate(BigDecimal.TEN);
        line.setAmount(BigDecimal.TEN);
        line.setLotId(String.valueOf(lotId));
        line.setSortOrder(0);
        group.getItems().add(line);
        salesBillRepository.saveAndFlush(bill);

        restArrivalMockMvc
            .perform(get(ENTITY_API_URL + "/" + vid))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deleteBlockers").value(org.hamcrest.Matchers.hasItem("BILLING")));
        insertedVehicle = null;
    }

    private long readFirstLotIdFromArrivalDetail(long vehicleId) throws Exception {
        String body = restArrivalMockMvc
            .perform(get(ENTITY_API_URL + "/" + vehicleId))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode root = om.readTree(body);
        return root.path("sellers").get(0).path("lots").get(0).path("id").asLong();
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

