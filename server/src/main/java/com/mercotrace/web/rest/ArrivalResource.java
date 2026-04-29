package com.mercotrace.web.rest;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.ArrivalService;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalRequestDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalSummaryDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalDetailDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalFullDetailDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalUpdateDTO;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.HeaderUtil;
import tech.jhipster.web.util.PaginationUtil;

/**
 * REST controller for managing arrivals (inward logistics).
 *
 * Frontend contract is defined by ArrivalsPage.tsx.
 */
@RestController
@RequestMapping("/api/arrivals")
public class ArrivalResource {

    private static final Logger LOG = LoggerFactory.getLogger(ArrivalResource.class);

    private static final String ENTITY_NAME = "arrival";

    @Value("${jhipster.clientApp.name}")
    private String applicationName;

    private final ArrivalService arrivalService;

    public ArrivalResource(ArrivalService arrivalService) {
        this.arrivalService = arrivalService;
    }

    private static String mapArrivalDataIntegrityMessage(DataIntegrityViolationException ex) {
        String msg = ex.getMostSpecificCause() != null ? ex.getMostSpecificCause().getMessage() : ex.getMessage();
        if (msg != null && msg.contains("ux_vehicle_vehicle_mark_alias_normalized")) {
            return ArrivalService.VEHICLE_MARK_ALIAS_DUPLICATE_MESSAGE;
        }
        return "Lot Name already exists for this seller";
    }

    /**
     * {@code POST  /arrivals} : Create a new completed arrival (drafts should use {@code POST /arrivals/partial}).
     */
    @PostMapping("")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ARRIVALS_CREATE + "\")")
    public ResponseEntity<ArrivalSummaryDTO> createArrival(@RequestBody ArrivalRequestDTO request) throws URISyntaxException {
        LOG.debug("REST request to create Arrival : {}", request);
        request.setPartiallyCompleted(false);
        try {
            ArrivalSummaryDTO result = arrivalService.createArrival(request);
            return ResponseEntity
                .created(new URI("/api/arrivals/" + result.getVehicleId()))
                .headers(HeaderUtil.createEntityCreationAlert(applicationName, true, ENTITY_NAME, String.valueOf(result.getVehicleId())))
                .body(result);
        } catch (IllegalArgumentException ex) {
            throw new BadRequestAlertException(ex.getMessage(), ENTITY_NAME, "validation");
        } catch (DataIntegrityViolationException ex) {
            throw new BadRequestAlertException(mapArrivalDataIntegrityMessage(ex), ENTITY_NAME, "validation");
        }
    }

    /**
     * {@code POST  /arrivals/partial} : Save a draft arrival without completion rules (no minimum sellers).
     * Uses a dedicated path so environments that enable {@code @Valid} on {@code POST /arrivals} do not reject empty payloads.
     */
    @PostMapping("/partial")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ARRIVALS_CREATE + "\")")
    public ResponseEntity<ArrivalSummaryDTO> createPartialArrival(@RequestBody ArrivalRequestDTO request) throws URISyntaxException {
        LOG.debug("REST request to create partial Arrival : {}", request);
        request.setPartiallyCompleted(true);
        try {
            ArrivalSummaryDTO result = arrivalService.createArrival(request);
            return ResponseEntity
                .created(new URI("/api/arrivals/" + result.getVehicleId()))
                .headers(HeaderUtil.createEntityCreationAlert(applicationName, true, ENTITY_NAME, String.valueOf(result.getVehicleId())))
                .body(result);
        } catch (IllegalArgumentException ex) {
            throw new BadRequestAlertException(ex.getMessage(), ENTITY_NAME, "validation");
        } catch (DataIntegrityViolationException ex) {
            throw new BadRequestAlertException(mapArrivalDataIntegrityMessage(ex), ENTITY_NAME, "validation");
        }
    }

    /**
     * {@code GET  /arrivals/:id} : get full arrival detail by vehicle id (for expand panel).
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ARRIVALS_VIEW + "\")")
    public ResponseEntity<ArrivalFullDetailDTO> getArrivalById(@PathVariable Long id) {
        ArrivalFullDetailDTO dto = arrivalService.getArrivalById(id);
        return ResponseEntity.ok(dto);
    }

    /**
     * {@code GET  /arrivals} : get paginated arrivals summaries.
     * @param status optional filter: PENDING, WEIGHED, AUCTIONED, SETTLED (filter applied in memory on current page).
     * @param partiallyCompleted optional filter: true = drafts only, false/null = completed only (default).
     */
    @GetMapping("")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ARRIVALS_VIEW + "\")")
    public ResponseEntity<List<ArrivalSummaryDTO>> getAllArrivals(
        @org.springdoc.core.annotations.ParameterObject Pageable pageable,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) Boolean partiallyCompleted
    ) {
        LOG.debug("REST request to get Arrivals page: {} status: {} partiallyCompleted: {}", pageable, status, partiallyCompleted);
        Page<ArrivalSummaryDTO> page = arrivalService.listArrivals(pageable, status, partiallyCompleted);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * {@code GET  /arrivals/detail} : get paginated arrivals with nested sellers and lots (id, lotName, sellerName) for lot-level lookup (e.g. WeighingPage).
     */
    @GetMapping("/detail")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ARRIVALS_VIEW + "\")")
    public ResponseEntity<List<ArrivalDetailDTO>> getArrivalsDetail(
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        LOG.debug("REST request to get Arrivals detail page: {}", pageable);
        var page = arrivalService.listArrivalsDetail(pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * {@code PATCH  /arrivals/:id} : partial update (vehicleNumber, godown, gatepassNumber, origin).
     */
    @PatchMapping("/{id}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ARRIVALS_EDIT + "\")")
    public ResponseEntity<ArrivalSummaryDTO> updateArrival(@PathVariable Long id, @RequestBody ArrivalUpdateDTO update) {
        try {
            ArrivalSummaryDTO result = arrivalService.updateArrival(id, update);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException ex) {
            throw new BadRequestAlertException(ex.getMessage(), ENTITY_NAME, "validation");
        } catch (DataIntegrityViolationException ex) {
            throw new BadRequestAlertException(mapArrivalDataIntegrityMessage(ex), ENTITY_NAME, "validation");
        }
    }

    /**
     * {@code DELETE  /arrivals/:id} : delete the arrival (vehicle and related records).
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ARRIVALS_DELETE + "\")")
    public ResponseEntity<Void> deleteArrival(@PathVariable Long id) {
        arrivalService.deleteArrival(id);
        return ResponseEntity.noContent().build();
    }
}

