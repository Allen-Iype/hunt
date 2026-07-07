import { DEFAULT_PROFILE_ID, type Profile, type ProfileRepository } from "@hunt/core";

/** GetProfile capability: fetch the (single, V1) profile. */
export function createGetProfile(deps: { profiles: ProfileRepository }) {
  return function getProfile(): Profile | null {
    return deps.profiles.get(DEFAULT_PROFILE_ID);
  };
}
