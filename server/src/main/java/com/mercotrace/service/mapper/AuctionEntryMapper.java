package com.mercotrace.service.mapper;

import com.mercotrace.domain.AuctionEntry;
import com.mercotrace.service.dto.AuctionEntryDTO;
import java.util.List;
import org.mapstruct.AfterMapping;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;

/**
 * Mapper for {@link AuctionEntry} and {@link AuctionEntryDTO}.
 */
@Mapper(componentModel = "spring")
public interface AuctionEntryMapper extends EntityMapper<AuctionEntryDTO, AuctionEntry> {

    @Override
    @Mapping(target = "lastModifiedMs", ignore = true)
    AuctionEntryDTO toDto(AuctionEntry entity);

    @Override
    List<AuctionEntryDTO> toDto(List<AuctionEntry> entityList);

    @AfterMapping
    default void fillLastModifiedMs(AuctionEntry entity, @MappingTarget AuctionEntryDTO dto) {
        if (entity.getLastModifiedDate() != null) {
            dto.setLastModifiedMs(entity.getLastModifiedDate().toEpochMilli());
        }
    }
}

