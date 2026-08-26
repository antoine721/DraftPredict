export type ChampionDamageProfile = {
    magic: number;
    physical: number;
    true: number;
};

export function emptyDamageProfile(): ChampionDamageProfile {
    return { magic: 0, physical: 0, true: 0 };
}

/** Sum of the three damage channels. */
export function totalDamage(profile: ChampionDamageProfile): number {
    return profile.magic + profile.physical + profile.true;
}

/**
 * Rescales a damage profile so the three channels sum to 1.
 * A profile with no damage at all is returned as all-zero.
 */
export function normalizeDamageProfile(
    profile: ChampionDamageProfile,
): ChampionDamageProfile {
    const total = totalDamage(profile);
    if (total === 0) return emptyDamageProfile();
    return {
        magic: profile.magic / total,
        physical: profile.physical / total,
        true: profile.true / total,
    };
}
