"use client";

import { createContext, useContext } from "react";
import type { Profile } from "@/types/db";

const ProfileContext = createContext<Profile | null>(null);

export function ProfileProvider({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  return <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>;
}

export function useProfile(): Profile {
  const profile = useContext(ProfileContext);
  if (!profile) throw new Error("useProfile must be used inside the app layout");
  return profile;
}

/**
 * Client-side mirror of the server rule. The database is what actually
 * stops anyone reading costs -- this only decides what to render.
 */
export function useFinanceAccess(): boolean {
  const profile = useProfile();
  return profile.is_active && profile.role === "owner";
}

/** Editing or removing a vehicle. The owner's call. */
export function useCanManageVehicles(): boolean {
  return useFinanceAccess();
}
