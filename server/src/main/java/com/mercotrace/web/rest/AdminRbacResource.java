package com.mercotrace.web.rest;

import com.mercotrace.admin.rbac.AdminRbacService;
import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.dto.AdminRoleDTO;
import com.mercotrace.service.dto.AdminUserRbacDTO;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import com.mercotrace.web.rest.vm.AdminRbacUserCreateVM;
import com.mercotrace.web.rest.vm.AdminRbacUserUpdateVM;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.http.MediaType;

/**
 * Admin-facing RBAC APIs for global admin users and roles.
 *
 * Base path: /api/admin/rbac
 *
 * This controller is entirely separate from trader RBAC
 * ({@link com.mercotrace.web.rest.TraderRbacResource}) and operates only on
 * {@link com.mercotrace.admin.identity.AdminUser} / {@link com.mercotrace.admin.rbac.AdminRole}.
 */
@RestController
@RequestMapping("/api/admin/rbac")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminRbacResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminRbacResource.class);

    private static final String ENTITY_ROLE = "adminRole";
    private static final String ENTITY_USER = "adminUserRoleAssignment";

    private final AdminRbacService adminRbacService;

    public AdminRbacResource(AdminRbacService adminRbacService) {
        this.adminRbacService = adminRbacService;
    }

    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    /**
     * {@code GET /api/admin/rbac/roles} : list all admin roles.
     */
    @GetMapping("/roles")
    public List<AdminRoleDTO> getAdminRoles() {
        LOG.debug("REST request to get admin roles");
        return adminRbacService.getAllRoles();
    }

    /**
     * {@code POST /api/admin/rbac/roles} : create a new admin role.
     */
    @PostMapping("/roles")
    public ResponseEntity<AdminRoleDTO> createAdminRole(@Valid @RequestBody AdminRoleDTO roleDTO) throws URISyntaxException {
        LOG.debug("REST request to create admin role : {}", roleDTO);
        if (roleDTO.getId() != null) {
            throw new BadRequestAlertException("A new admin role cannot already have an ID", ENTITY_ROLE, "idexists");
        }
        if (roleDTO.getName() == null || roleDTO.getName().isBlank()) {
            throw new BadRequestAlertException("Role name is required", ENTITY_ROLE, "namerequired");
        }

        AdminRoleDTO result = adminRbacService.createRole(roleDTO);
        return ResponseEntity.created(new URI("/api/admin/rbac/roles/" + result.getId())).body(result);
    }

    /**
     * {@code PUT /api/admin/rbac/roles/:id} : update an existing admin role.
     */
    @PutMapping("/roles/{id}")
    public ResponseEntity<AdminRoleDTO> updateAdminRole(@PathVariable("id") Long id, @Valid @RequestBody AdminRoleDTO roleDTO) {
        LOG.debug("REST request to update admin role {} : {}", id, roleDTO);

        if (roleDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_ROLE, "idnull");
        }
        if (!Objects.equals(id, roleDTO.getId())) {
            throw new BadRequestAlertException("Invalid id", ENTITY_ROLE, "idmismatch");
        }

        try {
            AdminRoleDTO result = adminRbacService.updateRole(id, roleDTO);
            return ResponseEntity.ok(result);
        } catch (NoSuchElementException e) {
            throw new BadRequestAlertException("Admin role not found", ENTITY_ROLE, "idnotfound");
        }
    }

    /**
     * {@code DELETE /api/admin/rbac/roles/:id} : delete an admin role.
     */
    @DeleteMapping("/roles/{id}")
    public ResponseEntity<Void> deleteAdminRole(@PathVariable("id") Long id) {
        LOG.debug("REST request to delete admin role {}", id);
        try {
            adminRbacService.deleteRole(id);
        } catch (NoSuchElementException e) {
            throw new BadRequestAlertException("Admin role not found", ENTITY_ROLE, "idnotfound");
        }
        return ResponseEntity.noContent().build();
    }

    // -------------------------------------------------------------------------
    // User-role assignments
    // -------------------------------------------------------------------------

    /**
     * {@code GET /api/admin/rbac/users} : list all admin users with their admin role IDs.
     */
    @GetMapping("/users")
    public List<AdminUserRbacDTO> getAdminUsersWithRoles() {
        LOG.debug("REST request to get admin users with roles");
        return adminRbacService.getAllAdminUsersWithRoles();
    }

    /**
     * {@code PUT /api/admin/rbac/users/:id/roles} : replace all admin roles for an admin user.
     */
    @PutMapping("/users/{id}/roles")
    @Operation(
        summary = "Replace admin user roles",
        description = "JSON array of admin role IDs (same shape as PUT /api/admin/users/{id}/roles).",
        requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content = @Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                array = @ArraySchema(schema = @Schema(type = "integer", format = "int64", example = "1"))
            )
        )
    )
    public ResponseEntity<AdminUserRbacDTO> replaceAdminUserRoles(
        @PathVariable("id") Long userId,
        @NotNull @RequestBody Set<Long> roleIds
    ) {
        LOG.debug("REST request to replace admin roles for user {} with {}", userId, roleIds);

        // Never allow RBAC role changes for the platform owner / superadmin.
        if (userId != null && userId == 1L) {
            throw new BadRequestAlertException("Super admin user cannot be managed via admin RBAC APIs", ENTITY_USER, "superadminprotected");
        }

        try {
            AdminUserRbacDTO result = adminRbacService.replaceRolesForUser(userId, roleIds);
            return ResponseEntity.ok(result);
        } catch (NoSuchElementException e) {
            throw new BadRequestAlertException("Admin user not found", ENTITY_USER, "idnotfound");
        }
    }

    // -------------------------------------------------------------------------
    // Admin user profile lifecycle
    // -------------------------------------------------------------------------

    /**
     * {@code POST /api/admin/rbac/users} : create a new admin user with a direct password.
     */
    @PostMapping("/users")
    @Operation(
        summary = "Create admin user",
        requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = AdminRbacUserCreateVM.class))
        )
    )
    public ResponseEntity<AdminUserRbacDTO> createAdminUser(@Valid @RequestBody AdminRbacUserCreateVM vm) throws URISyntaxException {
        LOG.debug("REST request to create admin user via RBAC : {}", vm.getEmail());

        try {
            AdminUserRbacDTO result = adminRbacService.createAdminUser(
                vm.getLogin(),
                vm.getEmail(),
                vm.getFirstName(),
                vm.getLastName(),
                vm.getMobile(),
                vm.getPassword(),
                vm.getActivated()
            );
            return ResponseEntity.created(new URI("/api/admin/rbac/users/" + result.getId())).body(result);
        } catch (IllegalArgumentException ex) {
            throw new BadRequestAlertException(ex.getMessage(), ENTITY_USER, "validationerror");
        }
    }

    /**
     * {@code PUT /api/admin/rbac/users/:id} : update basic profile fields and activation flag.
     */
    @PutMapping("/users/{id}")
    @Operation(
        summary = "Update admin user",
        requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = AdminRbacUserUpdateVM.class))
        )
    )
    public ResponseEntity<AdminUserRbacDTO> updateAdminUser(
        @PathVariable("id") Long userId,
        @Valid @RequestBody AdminRbacUserUpdateVM vm
    ) {
        LOG.debug("REST request to update admin user {} via RBAC", userId);

        // Never allow profile changes for the platform owner / superadmin.
        if (userId != null && userId == 1L) {
            throw new BadRequestAlertException("Super admin user cannot be managed via admin RBAC APIs", ENTITY_USER, "superadminprotected");
        }

        try {
            AdminUserRbacDTO result = adminRbacService.updateAdminUser(
                userId,
                vm.getEmail(),
                vm.getFirstName(),
                vm.getLastName(),
                vm.getMobile(),
                vm.getActivated()
            );
            return ResponseEntity.ok(result);
        } catch (NoSuchElementException e) {
            throw new BadRequestAlertException("Admin user not found", ENTITY_USER, "idnotfound");
        } catch (IllegalArgumentException ex) {
            throw new BadRequestAlertException(ex.getMessage(), ENTITY_USER, "validationerror");
        }
    }
}

