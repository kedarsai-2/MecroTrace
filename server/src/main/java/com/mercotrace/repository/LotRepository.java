package com.mercotrace.repository;

import com.mercotrace.domain.Lot;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface LotRepository extends JpaRepository<Lot, Long> {

    List<Lot> findAllBySellerVehicleIdIn(Iterable<Long> sellerVehicleIds);

    /**
     * Lots for a seller-in-vehicle row, scoped to the trader (Arrivals → Settlement billing).
     */
    @Query(
        "SELECT l FROM Lot l JOIN SellerInVehicle siv ON l.sellerVehicleId = siv.id JOIN Vehicle v ON siv.vehicleId = v.id " +
        "WHERE l.sellerVehicleId = :sivId AND v.traderId = :traderId"
    )
    List<Lot> findAllBySellerVehicleIdAndTraderId(@Param("sivId") Long sivId, @Param("traderId") Long traderId);

    void deleteBySellerVehicleIdIn(Collection<Long> sellerVehicleIds);

    Page<Lot> findAllByLotNameContainingIgnoreCase(String lotName, Pageable pageable);

    /**
     * Lots belonging to the given trader via Lot → SellerInVehicle → Vehicle (trader_id).
     * Single DB query with pagination and sort.
     */
    @Query(
        "SELECT l FROM Lot l WHERE l.sellerVehicleId IN (" +
        "SELECT siv.id FROM SellerInVehicle siv, Vehicle v WHERE siv.vehicleId = v.id AND v.traderId = :traderId)"
    )
    Page<Lot> findAllByTraderId(@Param("traderId") Long traderId, Pageable pageable);

    /**
     * Trader-scoped lots with lot name search (case-insensitive).
     */
    @Query(
        "SELECT l FROM Lot l WHERE l.sellerVehicleId IN (" +
        "SELECT siv.id FROM SellerInVehicle siv, Vehicle v WHERE siv.vehicleId = v.id AND v.traderId = :traderId) " +
        "AND LOWER(l.lotName) LIKE LOWER(CONCAT('%', :q, '%'))"
    )
    Page<Lot> findAllByTraderIdAndLotNameContainingIgnoreCase(@Param("traderId") Long traderId, @Param("q") String q, Pageable pageable);

    /**
     * Open lots for self-sale: trader's lots excluding those already closed.
     * Call only when excludedLotIds is non-empty; otherwise use findAllByTraderId.
     */
    @Query(
        "SELECT l FROM Lot l WHERE l.sellerVehicleId IN (" +
        "SELECT siv.id FROM SellerInVehicle siv, Vehicle v WHERE siv.vehicleId = v.id AND v.traderId = :traderId) " +
        "AND l.id NOT IN :excludedLotIds"
    )
    Page<Lot> findOpenLotsByTraderIdExcluding(
        @Param("traderId") Long traderId,
        @Param("excludedLotIds") Collection<Long> excludedLotIds,
        Pageable pageable
    );

    /**
     * Open lots for self-sale with search over lot name, seller name, commodity name, vehicle number.
     * Call only when excludedLotIds is non-empty; otherwise use findAllByTraderIdAndLotNameContainingIgnoreCase or similar.
     */
    @Query(
        "SELECT DISTINCT l FROM Lot l, SellerInVehicle siv, Vehicle v, Contact c, Commodity co " +
        "WHERE l.sellerVehicleId = siv.id AND siv.vehicleId = v.id AND siv.contactId = c.id AND l.commodityId = co.id " +
        "AND v.traderId = :traderId AND l.id NOT IN :excludedLotIds " +
        "AND (LOWER(l.lotName) LIKE LOWER(CONCAT('%', :q, '%')) " +
        "OR LOWER(c.name) LIKE LOWER(CONCAT('%', :q, '%')) " +
        "OR LOWER(co.commodityName) LIKE LOWER(CONCAT('%', :q, '%')) " +
        "OR LOWER(v.vehicleNumber) LIKE LOWER(CONCAT('%', :q, '%')))"
    )
    Page<Lot> findOpenLotsByTraderIdExcludingWithSearch(
        @Param("traderId") Long traderId,
        @Param("excludedLotIds") Collection<Long> excludedLotIds,
        @Param("q") String q,
        Pageable pageable
    );

    /**
     * Smallest seller serial on any historical lot for this contact under this trader (for seeding stable arrival seller serials).
     */
    @Query(
        "SELECT MIN(l.sellerSerialNo) FROM Lot l, SellerInVehicle siv, Vehicle v WHERE l.sellerVehicleId = siv.id AND siv.vehicleId = v.id " +
        "AND v.traderId = :traderId AND siv.contactId = :contactId"
    )
    Optional<Integer> findMinSellerSerialNoForContactAndTrader(@Param("contactId") Long contactId, @Param("traderId") Long traderId);

    /**
     * Smallest seller serial on any historical lot for a free-text seller (no contact) with this mark under this trader.
     * {@code normalizedMark} must be {@code trim + lowerCase} to match {@link com.mercotrace.service.ArrivalService} keys.
     */
    @Query(
        "SELECT MIN(l.sellerSerialNo) FROM Lot l, SellerInVehicle siv, Vehicle v WHERE l.sellerVehicleId = siv.id AND siv.vehicleId = v.id " +
        "AND v.traderId = :traderId AND siv.contactId IS NULL AND LOWER(TRIM(siv.sellerMark)) = :normalizedMark"
    )
    Optional<Integer> findMinSellerSerialNoForFreeTextMarkAndTrader(
        @Param("normalizedMark") String normalizedMark,
        @Param("traderId") Long traderId
    );

    /**
     * Highest lot serial on any historical lot for this trader.
     */
    @Query(
        "SELECT MAX(l.lotSerialNo) FROM Lot l, SellerInVehicle siv, Vehicle v WHERE l.sellerVehicleId = siv.id AND siv.vehicleId = v.id " +
        "AND v.traderId = :traderId"
    )
    Optional<Integer> findMaxLotSerialNoByTraderId(@Param("traderId") Long traderId);

    /** Sum of lot bag counts for vehicles whose arrival time falls in the given range. */
    @Query(
        "SELECT COALESCE(SUM(l.bagCount), 0) FROM Lot l " +
        "JOIN SellerInVehicle siv ON l.sellerVehicleId = siv.id " +
        "JOIN Vehicle v ON siv.vehicleId = v.id " +
        "WHERE v.traderId = :traderId AND v.arrivalDatetime >= :dateFrom AND v.arrivalDatetime <= :dateTo"
    )
    Long sumBagCountByTraderAndArrivalDateRange(
        @Param("traderId") Long traderId,
        @Param("dateFrom") java.time.Instant dateFrom,
        @Param("dateTo") java.time.Instant dateTo
    );

    /** Per UTC calendar day of vehicle arrival: sum of lot bag_count. */
    @Query(
        value =
            "SELECT CAST((v.arrival_datetime AT TIME ZONE 'UTC') AS date) AS d, " +
            "COALESCE(SUM(l.bag_count), 0)::bigint " +
            "FROM lot l " +
            "JOIN seller_in_vehicle siv ON l.seller_vehicle_id = siv.id " +
            "JOIN vehicle v ON siv.vehicle_id = v.id " +
            "WHERE v.trader_id = :traderId AND v.arrival_datetime >= :fromInstant AND v.arrival_datetime <= :toInstant " +
            "GROUP BY CAST((v.arrival_datetime AT TIME ZONE 'UTC') AS date) " +
            "ORDER BY d DESC",
        nativeQuery = true
    )
    List<Object[]> sumBagsByUtcArrivalDay(
        @Param("traderId") Long traderId,
        @Param("fromInstant") java.time.Instant fromInstant,
        @Param("toInstant") java.time.Instant toInstant
    );
}

