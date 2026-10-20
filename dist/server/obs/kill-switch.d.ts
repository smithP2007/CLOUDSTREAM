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
/** Why a provider is currently disabled — operator-facing, safe to log. */
export interface KillSwitchEntry {
    readonly providerName: string;
    readonly reason?: string;
    readonly disabledAt: number;
}
export interface KillSwitchSnapshot {
    readonly globallyDisabled: boolean;
    readonly globalReason?: string;
    /** Per-provider entries, sorted by provider name (deterministic). */
    readonly disabled: readonly KillSwitchEntry[];
}
export declare class ProviderKillSwitch {
    #private;
    /** Disables one provider (re-disabling overwrites the entry). */
    disable(providerName: string, reason?: string, at?: number): void;
    /** Re-enables one provider. Returns whether it had been disabled. */
    enable(providerName: string): boolean;
    /** Disables every provider, including ones registered later. */
    disableAll(reason?: string, at?: number): void;
    /** Lifts a global disable (per-provider entries, if any, stay). */
    enableAll(): void;
    /** True when calls to `providerName` must be refused right now. */
    isEnabled(providerName: string): boolean;
    /** True when ALL providers are disabled via the global switch. */
    isGloballyDisabled(): boolean;
    /** The recorded reason for a disabled provider (per-provider or global). */
    reasonFor(providerName: string): string | undefined;
    /** Deterministic snapshot for health APIs / admin UIs. */
    snapshot(): KillSwitchSnapshot;
}
//# sourceMappingURL=kill-switch.d.ts.map