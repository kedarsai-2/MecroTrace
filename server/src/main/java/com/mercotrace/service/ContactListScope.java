package com.mercotrace.service;

/**
 * How trader-facing contact lists are scoped.
 */
public enum ContactListScope {
    /** Contacts registry: trader-owned plus portal participants already used by this trader. */
    REGISTRY,
    /** Picker-safe contact list: same registry scope, excluding unimported portal/global contacts. */
    PARTICIPANTS,
}
