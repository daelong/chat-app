"use client";

import { useQuery } from "@tanstack/react-query";
import { getMemberSession } from "../api/auth";

export const memberSessionKey = ["auth", "me"] as const;
export function useMemberSession() {
  return useQuery({
    queryKey: memberSessionKey,
    queryFn: ({ signal }) => getMemberSession(signal),
    retry: false,
    staleTime: 0,
  });
}
