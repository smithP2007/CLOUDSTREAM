/**
 * Provider kill switch (roadmap Phase 2 step 5, D19) — the internal
 * primitive behind the operational commitment in POLICY.md §6: any installed
 * provider must be disableable without a redeploy, mirroring the verified
 * upstream `SitePlugin.status` pattern (`RepositoryManager.kt:50–78`).
 *
 * This class is the IN-MEMORY state only. A remote administration surface
 * (the thing that would flip these flags in production) is deliberately NOT
 * part of this phase — POLICY.md §2 requires authenticated admin surfaces,
 * and the future API contract is documented in D19 and in the roadmap's
 * Phase 3 gate. Nothing here is persisted: disabled state resets on restart
 * unless the (future) API layer re-applies it.
 */
export class ProviderKillSwitch {
    #entries = new Map();
    #global = null;
    /** Disables one provider (re-disabling overwrites the entry). */
    disable(providerName, reason, at = Date.now()) {
        this.#entries.set(providerName, { providerName, reason, disabledAt: at });
    }
    /** Re-enables one provider. Returns whether it had been disabled. */
    enable(providerName) {
        return this.#entries.delete(providerName);
    }
    /** Disables every provider, including ones registered later. */
    disableAll(reason, at = Date.now()) {
        this.#global = { reason, disabledAt: at };
    }
    /** Lifts a global disable (per-provider entries, if any, stay). */
    enableAll() {
        this.#global = null;
    }
    /** True when calls to `providerName` must be refused right now. */
    isEnabled(providerName) {
        return this.#global === null && !this.#entries.has(providerName);
    }
    /** True when ALL providers are disabled via the global switch. */
    isGloballyDisabled() {
        return this.#global !== null;
    }
    /** The recorded reason for a disabled provider (per-provider or global). */
    reasonFor(providerName) {
        if (this.#global !== null)
            return this.#global.reason;
        return this.#entries.get(providerName)?.reason;
    }
    /** Deterministic snapshot for health APIs / admin UIs. */
    snapshot() {
        return {
            globallyDisabled: this.#global !== null,
            globalReason: this.#global?.reason,
            disabled: [...this.#entries.values()].sort((a, b) => a.providerName.localeCompare(b.providerName)),
        };
    }
}
//# sourceMappingURL=kill-switch.js.map