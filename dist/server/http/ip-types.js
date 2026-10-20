/**
 * Shared IP representation types for the destination guard.
 *
 * `ParsedIpv4` is 4 octets (0–255); `ParsedIpv6` is 8 groups of 16-bit
 * integers. Arrays are used (instead of strings) so classification works on
 * the binary form — immune to encoding tricks (hex/octal IPv4, mapped IPv6,
 * zero compression).
 */
export {};
//# sourceMappingURL=ip-types.js.map