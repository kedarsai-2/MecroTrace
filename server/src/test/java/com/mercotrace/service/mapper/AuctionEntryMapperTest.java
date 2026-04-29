package com.mercotrace.service.mapper;

import static org.assertj.core.api.Assertions.assertThat;

import com.mercotrace.domain.AuctionEntry;
import com.mercotrace.domain.enumeration.AuctionPresetType;
import com.mercotrace.service.dto.AuctionEntryDTO;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AuctionEntryMapperTest {

    private AuctionEntryMapper auctionEntryMapper;

    @BeforeEach
    void setUp() {
        auctionEntryMapper = new AuctionEntryMapperImpl();
    }

    @Test
    void shouldConvertToDtoAndBack() {
        AuctionEntry entry = new AuctionEntry();
        entry.setId(1L);
        entry.setAuctionId(10L);
        entry.setBuyerId(20L);
        entry.setBidNumber(5);
        entry.setBidRate(new BigDecimal("100.50"));
        entry.setPresetMargin(new BigDecimal("10.00"));
        entry.setPresetType(AuctionPresetType.PROFIT);
        entry.setSellerRate(new BigDecimal("90.50"));
        entry.setSummarySellerRate(new BigDecimal("95.00"));
        entry.setBuyerRate(new BigDecimal("102.50"));
        entry.setQuantity(3);
        entry.setAmount(new BigDecimal("307.50"));
        entry.setIsSelfSale(Boolean.FALSE);
        entry.setIsScribble(Boolean.TRUE);
        entry.setTokenAdvance(new BigDecimal("50.00"));
        entry.setExtraRate(new BigDecimal("2.00"));
        entry.setBuyerName("Buyer Name");
        entry.setBuyerMark("MARK1");
        entry.setCreatedAt(Instant.parse("2024-01-01T10:00:00Z"));

        AuctionEntryDTO dto = auctionEntryMapper.toDto(entry);
        AuctionEntry mappedBack = auctionEntryMapper.toEntity(dto);

        assertThat(mappedBack.getId()).isEqualTo(entry.getId());
        assertThat(mappedBack.getAuctionId()).isEqualTo(entry.getAuctionId());
        assertThat(mappedBack.getBuyerId()).isEqualTo(entry.getBuyerId());
        assertThat(mappedBack.getBidNumber()).isEqualTo(entry.getBidNumber());
        assertThat(mappedBack.getBidRate()).isEqualByComparingTo(entry.getBidRate());
        assertThat(mappedBack.getPresetMargin()).isEqualByComparingTo(entry.getPresetMargin());
        assertThat(mappedBack.getPresetType()).isEqualTo(entry.getPresetType());
        assertThat(mappedBack.getSellerRate()).isEqualByComparingTo(entry.getSellerRate());
        assertThat(mappedBack.getSummarySellerRate()).isEqualByComparingTo(entry.getSummarySellerRate());
        assertThat(mappedBack.getBuyerRate()).isEqualByComparingTo(entry.getBuyerRate());
        assertThat(mappedBack.getQuantity()).isEqualTo(entry.getQuantity());
        assertThat(mappedBack.getAmount()).isEqualByComparingTo(entry.getAmount());
        assertThat(mappedBack.getIsSelfSale()).isEqualTo(entry.getIsSelfSale());
        assertThat(mappedBack.getIsScribble()).isEqualTo(entry.getIsScribble());
        assertThat(mappedBack.getTokenAdvance()).isEqualByComparingTo(entry.getTokenAdvance());
        assertThat(mappedBack.getExtraRate()).isEqualByComparingTo(entry.getExtraRate());
        assertThat(mappedBack.getBuyerName()).isEqualTo(entry.getBuyerName());
        assertThat(mappedBack.getBuyerMark()).isEqualTo(entry.getBuyerMark());
        assertThat(mappedBack.getCreatedAt()).isEqualTo(entry.getCreatedAt());
    }
}

