package com.mercotrace.web.rest;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.WriterPadService;
import com.mercotrace.service.dto.WriterPadDTOs.WriterPadSessionDTO;
import com.mercotrace.service.dto.WriterPadDTOs.WriterPadSessionWithLogDTO;
import com.mercotrace.service.dto.WriterPadDTOs.WriterPadWeightEntryDTO;
import com.mercotrace.web.rest.errors.ApiErrorBody;
import com.mercotrace.web.rest.vm.WriterPadLoadOrCreateSessionRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * REST controller for the Writer's Pad module.
 *
 * Base path: /api/module-writers-pad
 */
@RestController
@RequestMapping("/api/module-writers-pad")
@Tag(name = "Module Writers Pad", description = "Writer's Pad – scale-connected bid weighing console")
public class WriterPadResource {

    private static final Logger LOG = LoggerFactory.getLogger(WriterPadResource.class);

    private final WriterPadService writerPadService;

    public WriterPadResource(WriterPadService writerPadService) {
        this.writerPadService = writerPadService;
    }

    @PostMapping("/sessions/load-or-create")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.WRITERS_PAD_CREATE + "\")")
    @Operation(summary = "Load or create writer pad session for lot/bid")
    @ApiResponses({
        @ApiResponse(
            responseCode = "200",
            description = "OK",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = WriterPadSessionDTO.class))
        ),
        @ApiResponse(
            responseCode = "400",
            description = "Bad request",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ApiErrorBody.class))
        ),
        @ApiResponse(
            responseCode = "500",
            description = "Server error",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ApiErrorBody.class))
        )
    })
    public ResponseEntity<?> loadOrCreateSession(@Valid @RequestBody WriterPadLoadOrCreateSessionRequest payload) {
        LOG.debug("REST request to loadOrCreate WriterPad session: {}", payload);
        try {
            Long lotId = payload.getLotId();
            Integer bidNumber = payload.getBidNumber();
            String buyerMark = payload.getBuyerMark();
            String buyerName = payload.getBuyerName();
            String lotName = payload.getLotName() != null ? payload.getLotName() : "";
            Integer totalBags = payload.getTotalBags();
            String scaleId = payload.getScaleId() != null ? payload.getScaleId() : "";
            String scaleName = payload.getScaleName() != null ? payload.getScaleName() : "";
            WriterPadSessionDTO dto = writerPadService.loadOrCreateSession(
                lotId,
                bidNumber,
                buyerMark,
                buyerName,
                lotName,
                totalBags,
                scaleId,
                scaleName
            );
            return ResponseEntity.ok(dto);
        } catch (IllegalArgumentException ex) {
            return buildErrorResponse(HttpStatus.BAD_REQUEST, ex.getMessage(), "request");
        } catch (RuntimeException ex) {
            return buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to start Writer's Pad session", "request");
        }
    }

    @PostMapping("/sessions/{sessionId}/weights")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.WRITERS_PAD_EDIT + "\")")
    @Operation(summary = "Attach weight entry to session")
    @ApiResponses({
        @ApiResponse(
            responseCode = "200",
            description = "OK",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = WriterPadWeightEntryDTO.class))
        ),
        @ApiResponse(
            responseCode = "400",
            description = "Bad request",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ApiErrorBody.class))
        )
    })
    public ResponseEntity<?> attachWeight(
        @PathVariable Long sessionId,
        @RequestParam("rawWeight") @NotNull BigDecimal rawWeight,
        @RequestParam("consideredWeight") @NotNull BigDecimal consideredWeight,
        @RequestParam(value = "scaleId", required = false) String scaleId
    ) {
        LOG.debug("REST request to attach WriterPad weight: sessionId={} raw={} considered={}", sessionId, rawWeight, consideredWeight);
        try {
            WriterPadWeightEntryDTO dto = writerPadService.attachWeight(sessionId, rawWeight, consideredWeight, scaleId);
            return ResponseEntity.ok(dto);
        } catch (IllegalArgumentException ex) {
            return buildErrorResponse(HttpStatus.BAD_REQUEST, ex.getMessage(), "weight");
        }
    }

    @PostMapping("/weights/{entryId}/retag")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.WRITERS_PAD_EDIT + "\")")
    @Operation(summary = "Retag a weight entry to another bid")
    @ApiResponses({
        @ApiResponse(
            responseCode = "200",
            description = "OK",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = WriterPadWeightEntryDTO.class))
        ),
        @ApiResponse(
            responseCode = "400",
            description = "Bad request",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ApiErrorBody.class))
        )
    })
    public ResponseEntity<?> retag(
        @PathVariable Long entryId,
        @RequestParam("targetBidNumber") @Min(1) Integer targetBidNumber
    ) {
        LOG.debug("REST request to retag WriterPad weight entry {} to bid {}", entryId, targetBidNumber);
        try {
            WriterPadWeightEntryDTO dto = writerPadService.retagEntry(entryId, targetBidNumber);
            return ResponseEntity.ok(dto);
        } catch (IllegalArgumentException ex) {
            return buildErrorResponse(HttpStatus.BAD_REQUEST, ex.getMessage(), "targetBidNumber");
        }
    }

    @PostMapping("/cleanup/end-of-day")
    @PreAuthorize("hasAnyAuthority(\"" + AuthoritiesConstants.WRITERS_PAD_EDIT + "\", \"" + AuthoritiesConstants.ADMIN + "\")")
    @Operation(summary = "End-of-day cleanup for Writer's Pad")
    public ResponseEntity<Void> endOfDayCleanup() {
        LOG.debug("REST request to perform WriterPad end-of-day cleanup");
        writerPadService.endOfDayCleanup();
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/sessions")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.WRITERS_PAD_VIEW + "\")")
    @Operation(summary = "List writer pad sessions for current trader")
    public ResponseEntity<Page<WriterPadSessionDTO>> listSessions(
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        LOG.debug("REST request to get WriterPad sessions page: {}", pageable);
        Page<WriterPadSessionDTO> page = writerPadService.listSessions(pageable);
        return ResponseEntity.ok(page);
    }

    @GetMapping("/sessions/{sessionId}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.WRITERS_PAD_VIEW + "\")")
    @Operation(summary = "Get writer pad session with recent weight log")
    @ApiResponses({
        @ApiResponse(
            responseCode = "200",
            description = "OK",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = WriterPadSessionWithLogDTO.class))
        ),
        @ApiResponse(responseCode = "404", description = "Session not found (empty body)")
    })
    public ResponseEntity<WriterPadSessionWithLogDTO> getSessionWithLog(
        @PathVariable Long sessionId,
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        LOG.debug("REST request to get WriterPad session {} with log", sessionId);
        Optional<WriterPadSessionWithLogDTO> dto = writerPadService.getSessionWithLog(sessionId, pageable);
        return dto.map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).body(null));
    }

    /**
     * Standard error body: { "message", "status", "errors": [ { "field", "message" } ] }.
     */
    private Map<String, Object> standardErrorBody(HttpStatus status, String message, String field, String fieldMessage) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", message);
        body.put("status", status.value());
        body.put("errors", List.of(Map.of("field", field != null ? field : "error", "message", fieldMessage != null ? fieldMessage : message)));
        return body;
    }

    private ResponseEntity<Map<String, Object>> buildErrorResponse(HttpStatus status, String message, String field) {
        Map<String, Object> body = standardErrorBody(status, message, field, message);
        return ResponseEntity.status(status).body(body);
    }
}

