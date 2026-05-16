package com.mercotrace.web.rest;

import com.mercotrace.domain.User;
import com.mercotrace.repository.UserRepository;
import com.mercotrace.security.SecurityUtils;
import com.mercotrace.service.MultiTraderAccountRequestService;
import com.mercotrace.service.TraderAuthResponseFactory;
import com.mercotrace.service.dto.MultiTraderAccountRequestDTO;
import com.mercotrace.service.dto.MultiTraderAccountSummaryDTO;
import com.mercotrace.service.dto.TraderAccountOptionDTO;
import com.mercotrace.service.dto.TraderAuthDTO;
import com.mercotrace.service.dto.TraderDTO;
import com.mercotrace.web.rest.vm.MultiTraderAccountSwitchVM;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/trader/multi-accounts")
public class TraderMultiAccountResource {

    private final MultiTraderAccountRequestService multiAccountService;
    private final TraderAuthResponseFactory traderAuthResponseFactory;
    private final UserRepository userRepository;

    public TraderMultiAccountResource(
        MultiTraderAccountRequestService multiAccountService,
        TraderAuthResponseFactory traderAuthResponseFactory,
        UserRepository userRepository
    ) {
        this.multiAccountService = multiAccountService;
        this.traderAuthResponseFactory = traderAuthResponseFactory;
        this.userRepository = userRepository;
    }

    @GetMapping("/current")
    public MultiTraderAccountSummaryDTO current() {
        return multiAccountService.getCurrentSummary();
    }

    @PostMapping("/requests")
    public ResponseEntity<MultiTraderAccountRequestDTO> createRequest(
        @Valid @RequestBody MultiTraderAccountRequestDTO request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(multiAccountService.submitRequest(request));
    }

    @PostMapping("/requests/batch")
    public ResponseEntity<List<MultiTraderAccountRequestDTO>> createRequests(
        @Valid @RequestBody List<@Valid MultiTraderAccountRequestDTO> requests
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(multiAccountService.submitRequests(requests));
    }

    @GetMapping("/requests")
    public List<MultiTraderAccountRequestDTO> listRequests() {
        return multiAccountService.listCurrentUserRequests();
    }

    @GetMapping("/accounts")
    public List<TraderAccountOptionDTO> listAccounts() {
        return multiAccountService.listCurrentUserAccounts();
    }

    @PostMapping("/switch")
    public ResponseEntity<TraderAuthDTO> switchAccount(@Valid @RequestBody MultiTraderAccountSwitchVM body) {
        TraderDTO trader = multiAccountService.switchCurrentUserToTrader(body.getTraderId());
        User user = userRepository
            .findById(currentUserId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Current user not found"));
        TraderAuthResponseFactory.IssuedTraderAuth issued = traderAuthResponseFactory.issueTraderSession(user, trader);
        return ResponseEntity.ok().headers(issued.headers()).body(issued.dto());
    }

    private Long currentUserId() {
        return SecurityUtils
            .getCurrentUserId()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Current user not found"));
    }
}
