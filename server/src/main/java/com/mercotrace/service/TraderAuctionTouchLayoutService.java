package com.mercotrace.service;

import java.util.Optional;

public interface TraderAuctionTouchLayoutService {

    Optional<String> getLayoutJson(Long traderId);

    String saveLayoutJson(Long traderId, String layoutJson);
}
