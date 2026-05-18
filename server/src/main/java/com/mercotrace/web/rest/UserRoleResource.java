package com.mercotrace.web.rest;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.UserRoleService;
import com.mercotrace.service.dto.UserRoleDTO;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.http.MediaType;
import tech.jhipster.web.util.PaginationUtil;

/**
 * REST controller for managing user-role assignments for the Settings RBAC module.
 */
@RestController
@RequestMapping("/api/admin")
public class UserRoleResource {

    private static final Logger LOG = LoggerFactory.getLogger(UserRoleResource.class);

    private final UserRoleService userRoleService;

    public UserRoleResource(UserRoleService userRoleService) {
        this.userRoleService = userRoleService;
    }

    /**
     * {@code GET /admin/user-roles} : get all user-role mappings (paginated).
     */
    @GetMapping("/user-roles")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    public ResponseEntity<List<UserRoleDTO>> getAllUserRoles(@org.springdoc.core.annotations.ParameterObject Pageable pageable) {
        LOG.debug("REST request to get all UserRole mappings");
        Page<UserRoleDTO> page = userRoleService.findAll(pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * {@code GET /admin/users/{id}/roles} : get all roles assigned to a given user.
     */
    @GetMapping("/users/{id}/roles")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    public ResponseEntity<List<UserRoleDTO>> getUserRoles(@PathVariable("id") Long userId) {
        LOG.debug("REST request to get UserRole mappings for user {}", userId);
        List<UserRoleDTO> result = userRoleService.findByUserId(userId);
        return ResponseEntity.ok(result);
    }

    /**
     * {@code PUT /admin/users/{id}/roles} : replace all roles for a user.
     *
     * Body: array of role ids (numbers).
     */
    @PutMapping("/users/{id}/roles")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    @Operation(
        summary = "Replace user roles",
        description = "JSON array of role IDs, e.g. [1, 2, 3]",
        requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content = @Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                array = @ArraySchema(schema = @Schema(type = "integer", format = "int64", example = "1"))
            )
        )
    )
    public ResponseEntity<Void> setUserRoles(@PathVariable("id") Long userId, @RequestBody Set<Long> roleIds) {
        LOG.debug("REST request to set roles {} for user {}", roleIds, userId);
        userRoleService.setRolesForUser(userId, roleIds != null ? roleIds : Set.of());
        return ResponseEntity.noContent().build();
    }
}

