package com.mercotrace.service;

import com.mercotrace.admin.identity.AdminUser;
import com.mercotrace.admin.identity.AdminUserRepository;
import com.mercotrace.domain.MultiTraderAccountRequest;
import com.mercotrace.domain.Trader;
import com.mercotrace.domain.User;
import com.mercotrace.domain.UserTrader;
import com.mercotrace.domain.enumeration.ApprovalStatus;
import com.mercotrace.domain.enumeration.MultiTraderAccountRequestStatus;
import com.mercotrace.repository.MultiTraderAccountRequestRepository;
import com.mercotrace.repository.UserRepository;
import com.mercotrace.repository.UserTraderRepository;
import com.mercotrace.security.SecurityUtils;
import com.mercotrace.service.dto.MultiTraderAccountRequestDTO;
import com.mercotrace.service.dto.MultiTraderAccountSummaryDTO;
import com.mercotrace.service.dto.TraderAccountOptionDTO;
import com.mercotrace.service.dto.TraderDTO;
import com.mercotrace.service.mapper.MultiTraderAccountRequestMapper;
import java.time.Instant;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class MultiTraderAccountRequestService {

    private static final String BUSINESS_NAME_REGEX = "^[A-Za-z0-9 &'.,\\-/]+$";
    private static final String NAME_REGEX = "^[A-Za-z ]+$";
    private static final String CITY_REGEX = "^[A-Za-z0-9.\\- ]+$";
    private static final String ADDRESS_REGEX = "^[A-Za-z0-9\\s,.#\\-/]+$";
    private static final String SHOP_NO_REGEX = "^[A-Za-z0-9\\- ]+$";
    private static final String RMC_APMC_REGEX = "^[A-Za-z0-9\\-]+$";

    private final MultiTraderAccountRequestRepository requestRepository;
    private final MultiTraderAccountRequestMapper requestMapper;
    private final UserRepository userRepository;
    private final UserTraderRepository userTraderRepository;
    private final AdminUserRepository adminUserRepository;
    private final TraderService traderService;
    private final TraderOwnerAuthorityService traderOwnerAuthorityService;

    public MultiTraderAccountRequestService(
        MultiTraderAccountRequestRepository requestRepository,
        MultiTraderAccountRequestMapper requestMapper,
        UserRepository userRepository,
        UserTraderRepository userTraderRepository,
        AdminUserRepository adminUserRepository,
        TraderService traderService,
        TraderOwnerAuthorityService traderOwnerAuthorityService
    ) {
        this.requestRepository = requestRepository;
        this.requestMapper = requestMapper;
        this.userRepository = userRepository;
        this.userTraderRepository = userTraderRepository;
        this.adminUserRepository = adminUserRepository;
        this.traderService = traderService;
        this.traderOwnerAuthorityService = traderOwnerAuthorityService;
    }

    @Transactional(readOnly = true)
    public MultiTraderAccountSummaryDTO getCurrentSummary() {
        Long userId = currentTraderUserId();
        List<TraderAccountOptionDTO> accounts = listAccountOptionsForUser(userId);
        MultiTraderAccountSummaryDTO summary = new MultiTraderAccountSummaryDTO();
        summary.setAccounts(accounts);
        summary.setCurrentTrader(accounts.stream().filter(a -> Boolean.TRUE.equals(a.getPrimaryMapping())).findFirst().orElse(null));
        summary.setRequestCounts(
            Map.of(
                "pending",
                requestRepository.countByRequesterUserIdAndStatus(userId, MultiTraderAccountRequestStatus.PENDING),
                "approved",
                requestRepository.countByRequesterUserIdAndStatus(userId, MultiTraderAccountRequestStatus.APPROVED),
                "rejected",
                requestRepository.countByRequesterUserIdAndStatus(userId, MultiTraderAccountRequestStatus.REJECTED)
            )
        );
        return summary;
    }

    @Transactional(readOnly = true)
    public List<TraderAccountOptionDTO> listCurrentUserAccounts() {
        return listAccountOptionsForUser(currentTraderUserId());
    }

    @Transactional(readOnly = true)
    public List<MultiTraderAccountRequestDTO> listCurrentUserRequests() {
        Long userId = currentTraderUserId();
        return requestRepository.findAllByRequesterUserIdOrderByRequestedAtDesc(userId).stream().map(requestMapper::toDto).toList();
    }

    public MultiTraderAccountRequestDTO submitRequest(MultiTraderAccountRequestDTO input) {
        return submitRequests(List.of(input)).get(0);
    }

    public List<MultiTraderAccountRequestDTO> submitRequests(List<MultiTraderAccountRequestDTO> inputs) {
        if (inputs == null || inputs.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one mandi request is required");
        }
        if (inputs.size() > 10) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Maximum 10 mandi requests are allowed at once");
        }
        Long userId = currentTraderUserId();
        User user = userRepository.findById(userId).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        UserTrader currentMapping = userTraderRepository
            .findFirstByUserIdAndPrimaryMappingTrueAndActiveTrue(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Current trader account is not configured"));
        Trader currentTrader = currentMapping.getTrader();

        if (currentTrader.getApprovalStatus() != ApprovalStatus.APPROVED || !Boolean.TRUE.equals(currentTrader.getActive())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only active approved trader owners can request another account");
        }
        String role = currentMapping.getRoleInTrader();
        if (role == null || !"OWNER".equalsIgnoreCase(role.trim())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only trader owners can request another account");
        }

        String requestGroupId = UUID.randomUUID().toString();
        Instant requestedAt = Instant.now();
        int groupSize = inputs.size();
        List<MultiTraderAccountRequest> requests = java.util.stream.IntStream
            .range(0, inputs.size())
            .mapToObj(index -> buildRequest(inputs.get(index), user, currentTrader, requestGroupId, index + 1, groupSize, requestedAt))
            .toList();
        return requestRepository.saveAll(requests).stream().map(requestMapper::toDto).toList();
    }

    @Transactional(readOnly = true)
    public Page<MultiTraderAccountRequestDTO> searchAdmin(
        MultiTraderAccountRequestStatus status,
        String q,
        Pageable pageable
    ) {
        String normalizedQ = q == null || q.isBlank() ? null : q.trim();
        if (normalizedQ == null) {
            Page<MultiTraderAccountRequest> requests = status == null
                ? requestRepository.findAll(pageable)
                : requestRepository.findAllByStatus(status, pageable);
            return requests.map(requestMapper::toDto);
        }
        String pattern = "%" + normalizedQ.toLowerCase(Locale.ROOT) + "%";
        Page<MultiTraderAccountRequest> requests = status == null
            ? requestRepository.searchAdmin(pattern, pageable)
            : requestRepository.searchAdminByStatus(status, pattern, pageable);
        return requests.map(requestMapper::toDto);
    }

    @Transactional(readOnly = true)
    public MultiTraderAccountRequestDTO findOne(Long id) {
        return requestRepository
            .findById(id)
            .map(requestMapper::toDto)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Request not found"));
    }

    public MultiTraderAccountRequestDTO approve(Long id, String reason) {
        MultiTraderAccountRequest request = requestRepository
            .findLockedById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Request not found"));
        if (request.getStatus() != MultiTraderAccountRequestStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only pending requests can be approved");
        }

        AdminUser admin = currentAdminUser();
        Instant now = Instant.now();
        request = approvePendingRequest(request, trimToNull(reason), admin, now);
        traderOwnerAuthorityService.ensureTraderOwnerAuthorities(request.getRequesterUser());
        return requestMapper.toDto(request);
    }

    public List<MultiTraderAccountRequestDTO> approveGroup(String requestGroupId, String reason) {
        List<MultiTraderAccountRequest> requests = requestRepository.findLockedByRequestGroupId(requestGroupId);
        if (requests.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Request group not found");
        }
        List<MultiTraderAccountRequest> pending = requests.stream().filter(r -> r.getStatus() == MultiTraderAccountRequestStatus.PENDING).toList();
        if (pending.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No pending requests in this group");
        }
        AdminUser admin = currentAdminUser();
        Instant now = Instant.now();
        String normalizedReason = trimToNull(reason);
        pending.forEach(request -> approvePendingRequest(request, normalizedReason, admin, now));
        traderOwnerAuthorityService.ensureTraderOwnerAuthorities(pending.get(0).getRequesterUser());
        return requests.stream().map(requestMapper::toDto).toList();
    }

    private MultiTraderAccountRequest approvePendingRequest(
        MultiTraderAccountRequest request,
        String normalizedReason,
        AdminUser admin,
        Instant now
    ) {
        TraderDTO traderDTO = new TraderDTO();
        traderDTO.setBusinessName(request.getBusinessName());
        traderDTO.setOwnerName(request.getOwnerName());
        traderDTO.setAddress(request.getAddress());
        traderDTO.setCity(request.getCity());
        traderDTO.setState(request.getState());
        traderDTO.setPinCode(request.getPinCode());
        traderDTO.setCategory(request.getCategory());
        traderDTO.setGstNumber(request.getGstNumber());
        traderDTO.setRmcApmcCode(request.getRmcApmcCode());
        traderDTO.setShopPhotos(request.getShopPhotos());
        traderDTO.setEmail(request.getEmail());
        traderDTO.setMobile(request.getMobile());
        traderDTO.setApprovalStatus(ApprovalStatus.APPROVED);
        traderDTO.setActive(true);
        traderDTO.setBillPrefix("");
        traderDTO.setApprovalDecisionAt(now);
        traderDTO = traderService.save(traderDTO);

        Trader createdTrader = new Trader();
        createdTrader.setId(traderDTO.getId());

        UserTrader mapping = new UserTrader();
        mapping.setUser(request.getRequesterUser());
        mapping.setTrader(createdTrader);
        mapping.setRoleInTrader("OWNER");
        mapping.setActive(true);
        mapping.setPrimaryMapping(false);
        userTraderRepository.save(mapping);

        request.setStatus(MultiTraderAccountRequestStatus.APPROVED);
        request.setCreatedTrader(createdTrader);
        request.setDecisionReason(normalizedReason);
        request.setDecisionAt(now);
        request.setDecidedByAdminUser(admin);
        return requestRepository.save(request);
    }

    public MultiTraderAccountRequestDTO reject(Long id, String reason) {
        String normalizedReason = trimToNull(reason);
        if (normalizedReason == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reject reason is required");
        }
        if (normalizedReason.length() > 2000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reject reason is too long");
        }

        MultiTraderAccountRequest request = requestRepository
            .findLockedById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Request not found"));
        if (request.getStatus() != MultiTraderAccountRequestStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only pending requests can be rejected");
        }

        request.setStatus(MultiTraderAccountRequestStatus.REJECTED);
        request.setDecisionReason(normalizedReason);
        request.setDecisionAt(Instant.now());
        request.setDecidedByAdminUser(currentAdminUser());
        return requestMapper.toDto(requestRepository.save(request));
    }

    public List<MultiTraderAccountRequestDTO> rejectGroup(String requestGroupId, String reason) {
        String normalizedReason = trimToNull(reason);
        if (normalizedReason == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reject reason is required");
        }
        if (normalizedReason.length() > 2000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reject reason is too long");
        }
        List<MultiTraderAccountRequest> requests = requestRepository.findLockedByRequestGroupId(requestGroupId);
        if (requests.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Request group not found");
        }
        List<MultiTraderAccountRequest> pending = requests.stream().filter(r -> r.getStatus() == MultiTraderAccountRequestStatus.PENDING).toList();
        if (pending.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No pending requests in this group");
        }
        AdminUser admin = currentAdminUser();
        Instant now = Instant.now();
        pending.forEach(request -> {
            request.setStatus(MultiTraderAccountRequestStatus.REJECTED);
            request.setDecisionReason(normalizedReason);
            request.setDecisionAt(now);
            request.setDecidedByAdminUser(admin);
            requestRepository.save(request);
        });
        return requests.stream().map(requestMapper::toDto).toList();
    }

    public TraderDTO switchCurrentUserToTrader(Long traderId) {
        return switchUserToTrader(currentTraderUserId(), traderId);
    }

    public TraderDTO switchUserToTrader(Long userId, Long traderId) {
        UserTrader mapping = userTraderRepository
            .findFirstByUserIdAndTraderIdAndActiveTrue(userId, traderId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Trader account is not linked to this login"));
        Trader trader = mapping.getTrader();
        if (!Boolean.TRUE.equals(trader.getActive()) || trader.getApprovalStatus() != ApprovalStatus.APPROVED) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot switch to an inactive or unapproved trader account");
        }

        userTraderRepository.clearPrimaryMappingsForUser(userId);
        mapping.setPrimaryMapping(true);
        userTraderRepository.save(mapping);

        return traderService
            .findOne(trader.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trader account not found"));
    }

    @Transactional(readOnly = true)
    public List<UserTrader> findActiveApprovedMappingsForUser(Long userId) {
        return userTraderRepository
            .findAllByUserIdAndActiveTrue(userId)
            .stream()
            .filter(mapping -> {
                Trader trader = mapping.getTrader();
                return trader != null && Boolean.TRUE.equals(trader.getActive()) && trader.getApprovalStatus() == ApprovalStatus.APPROVED;
            })
            .sorted(Comparator.comparing((UserTrader mapping) -> !mapping.isPrimaryMapping()).thenComparing(mapping -> mapping.getTrader().getId()))
            .toList();
    }

    public TraderAccountOptionDTO toAccountOption(UserTrader mapping) {
        Trader trader = mapping.getTrader();
        TraderAccountOptionDTO dto = new TraderAccountOptionDTO();
        if (trader != null && trader.getId() != null) {
            dto.setTraderId(trader.getId().toString());
        }
        if (trader != null) {
            dto.setBusinessName(trader.getBusinessName());
            dto.setOwnerName(trader.getOwnerName());
            dto.setCity(trader.getCity());
            dto.setState(trader.getState());
            dto.setApprovalStatus(trader.getApprovalStatus() != null ? trader.getApprovalStatus().name() : null);
            dto.setActive(trader.getActive());
        }
        dto.setPrimaryMapping(mapping.isPrimaryMapping());
        return dto;
    }

    private List<TraderAccountOptionDTO> listAccountOptionsForUser(Long userId) {
        return findActiveApprovedMappingsForUser(userId).stream().map(this::toAccountOption).toList();
    }

    private Long currentTraderUserId() {
        return SecurityUtils
            .getCurrentUserId()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Current user not found"));
    }

    private AdminUser currentAdminUser() {
        Long adminUserId = SecurityUtils
            .getCurrentUserId()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Current admin user not found"));
        return adminUserRepository
            .findById(adminUserId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Current admin user not found"));
    }

    private MultiTraderAccountRequest buildRequest(
        MultiTraderAccountRequestDTO input,
        User user,
        Trader currentTrader,
        String requestGroupId,
        int requestGroupIndex,
        int requestGroupSize,
        Instant requestedAt
    ) {
        validateRequestPayload(input);

        MultiTraderAccountRequest request = new MultiTraderAccountRequest();
        request.setRequesterUser(user);
        request.setRequesterTrader(currentTrader);
        request.setRequestGroupId(requestGroupId);
        request.setRequestGroupIndex(requestGroupIndex);
        request.setRequestGroupSize(requestGroupSize);
        request.setStatus(MultiTraderAccountRequestStatus.PENDING);
        request.setBusinessName(trimRequired(input.getBusinessName(), "Business name is required"));
        request.setOwnerName(trimRequired(input.getOwnerName(), "Owner name is required"));
        request.setAddress(trimRequired(input.getAddress(), "Address is required"));
        request.setCity(trimRequired(input.getCity(), "City / Market is required"));
        request.setState(trimRequired(input.getState(), "State is required"));
        request.setPinCode(trimToNull(input.getPinCode()));
        request.setShopNo(trimRequired(input.getShopNo(), "Shop number is required"));
        request.setCategory(trimRequired(input.getCategory(), "Business category is required"));
        request.setGstNumber(trimToNull(input.getGstNumber()));
        request.setRmcApmcCode(trimToNull(input.getRmcApmcCode()));
        request.setShopPhotos(joinShopPhotos(input.getShopPhotos()));
        request.setDescription(trimToNull(input.getDescription()));
        request.setBillPrefix("");
        request.setEmail(firstNonBlank(user.getEmail(), currentTrader.getEmail()));
        request.setMobile(firstNonBlank(user.getMobile(), currentTrader.getMobile()));
        request.setRequestedAt(requestedAt);
        return request;
    }

    private void validateRequestPayload(MultiTraderAccountRequestDTO input) {
        String businessName = trimRequired(input.getBusinessName(), "Business name is required");
        if (businessName.length() < 3 || !businessName.matches(BUSINESS_NAME_REGEX)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid business name");
        }
        String ownerName = trimRequired(input.getOwnerName(), "Owner name is required");
        if (ownerName.length() < 2 || !ownerName.matches(NAME_REGEX)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid owner name");
        }
        String address = trimRequired(input.getAddress(), "Address is required");
        if (address.length() < 5 || !address.matches(ADDRESS_REGEX)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid address");
        }
        String city = trimRequired(input.getCity(), "City / Market is required");
        if (!city.matches(CITY_REGEX)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid city / market");
        }
        trimRequired(input.getState(), "State is required");
        String pinCode = trimToNull(input.getPinCode());
        if (pinCode != null && !pinCode.matches("^[0-9]{6}$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PIN code must be a 6-digit number");
        }
        String shopNo = trimRequired(input.getShopNo(), "Shop number is required");
        if (!shopNo.matches(SHOP_NO_REGEX)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid shop number");
        }
        trimRequired(input.getCategory(), "Business category is required");
        String rmcApmcCode = trimToNull(input.getRmcApmcCode());
        if (rmcApmcCode != null && !rmcApmcCode.matches(RMC_APMC_REGEX)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid RMC / APMC code");
        }
        String description = trimToNull(input.getDescription());
        if (description != null && description.length() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Description is too long");
        }
        String[] shopPhotos = input.getShopPhotos();
        if (shopPhotos != null) {
            if (shopPhotos.length > 4) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Too many shop photos. Maximum is 4.");
            }
            Arrays.stream(shopPhotos).forEach(photo -> {
                if (photo != null && photo.length() > 512) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Shop photo URL is too long");
                }
            });
        }
    }

    private String joinShopPhotos(String[] shopPhotos) {
        if (shopPhotos == null || shopPhotos.length == 0) {
            return null;
        }
        List<String> normalized = Arrays
            .stream(shopPhotos)
            .map(this::trimToNull)
            .filter(photo -> photo != null)
            .toList();
        return normalized.isEmpty() ? null : String.join(",", normalized);
    }

    private String trimRequired(String value, String message) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return trimmed;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String firstNonBlank(String first, String second) {
        String normalizedFirst = trimToNull(first);
        if (normalizedFirst != null) {
            return normalizedFirst.toLowerCase(Locale.ROOT);
        }
        return trimToNull(second);
    }
}
