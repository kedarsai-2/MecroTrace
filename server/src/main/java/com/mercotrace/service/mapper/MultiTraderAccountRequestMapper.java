package com.mercotrace.service.mapper;

import com.mercotrace.admin.identity.AdminUser;
import com.mercotrace.domain.MultiTraderAccountRequest;
import com.mercotrace.domain.Trader;
import com.mercotrace.domain.User;
import com.mercotrace.service.dto.MultiTraderAccountRequestDTO;
import java.util.Arrays;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.Named;

@Mapper(componentModel = "spring")
public interface MultiTraderAccountRequestMapper extends EntityMapper<MultiTraderAccountRequestDTO, MultiTraderAccountRequest> {
    @Override
    @Mapping(target = "requesterUserId", source = "requesterUser.id")
    @Mapping(target = "requesterTraderId", source = "requesterTrader.id")
    @Mapping(target = "createdTraderId", source = "createdTrader.id")
    @Mapping(target = "decidedByAdminUserId", source = "decidedByAdminUser.id")
    @Mapping(target = "requesterLogin", source = "requesterUser.login")
    @Mapping(target = "requesterName", source = "requesterUser.firstName")
    @Mapping(target = "currentTraderBusinessName", source = "requesterTrader.businessName")
    @Mapping(target = "createdTraderBusinessName", source = "createdTrader.businessName")
    @Mapping(target = "decidedByAdminLogin", source = "decidedByAdminUser.login")
    @Mapping(target = "shopPhotos", source = "shopPhotos", qualifiedByName = "splitShopPhotos")
    MultiTraderAccountRequestDTO toDto(MultiTraderAccountRequest entity);

    @Override
    @Mapping(target = "requesterUser", source = "requesterUserId", qualifiedByName = "userFromId")
    @Mapping(target = "requesterTrader", source = "requesterTraderId", qualifiedByName = "traderFromId")
    @Mapping(target = "createdTrader", source = "createdTraderId", qualifiedByName = "traderFromId")
    @Mapping(target = "decidedByAdminUser", source = "decidedByAdminUserId", qualifiedByName = "adminUserFromId")
    @Mapping(target = "shopPhotos", source = "shopPhotos", qualifiedByName = "joinShopPhotos")
    MultiTraderAccountRequest toEntity(MultiTraderAccountRequestDTO dto);

    @Override
    @Mapping(target = "requesterUser", source = "requesterUserId", qualifiedByName = "userFromId")
    @Mapping(target = "requesterTrader", source = "requesterTraderId", qualifiedByName = "traderFromId")
    @Mapping(target = "createdTrader", source = "createdTraderId", qualifiedByName = "traderFromId")
    @Mapping(target = "decidedByAdminUser", source = "decidedByAdminUserId", qualifiedByName = "adminUserFromId")
    @Mapping(target = "shopPhotos", source = "shopPhotos", qualifiedByName = "joinShopPhotos")
    void partialUpdate(@MappingTarget MultiTraderAccountRequest entity, MultiTraderAccountRequestDTO dto);

    @Named("splitShopPhotos")
    default String[] splitShopPhotos(String shopPhotos) {
        if (shopPhotos == null || shopPhotos.isBlank()) {
            return new String[0];
        }
        return shopPhotos.split("\\s*,\\s*");
    }

    @Named("joinShopPhotos")
    default String joinShopPhotos(String[] shopPhotos) {
        if (shopPhotos == null || shopPhotos.length == 0) {
            return null;
        }
        return String.join(",", Arrays.stream(shopPhotos).filter(photo -> photo != null && !photo.isBlank()).toList());
    }

    @Named("userFromId")
    default User userFromId(Long id) {
        if (id == null) {
            return null;
        }
        User user = new User();
        user.setId(id);
        return user;
    }

    @Named("traderFromId")
    default Trader traderFromId(Long id) {
        if (id == null) {
            return null;
        }
        Trader trader = new Trader();
        trader.setId(id);
        return trader;
    }

    @Named("adminUserFromId")
    default AdminUser adminUserFromId(Long id) {
        if (id == null) {
            return null;
        }
        AdminUser adminUser = new AdminUser();
        adminUser.setId(id);
        return adminUser;
    }
}
