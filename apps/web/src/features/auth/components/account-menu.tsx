"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ApiError, errorMessage } from "@/lib/api-client";
import { logout } from "../api/auth";
import { useMemberSession } from "../hooks/use-member-session";

export function AccountMenu() {
  const { data: session } = useMemberSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: async () => {
      if (!session) return;
      try {
        await logout(session.csrfToken);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      router.replace("/login");
    },
  });
  if (!session) return null;
  return (
    <div className="mt-8 border-t border-slate-200 pt-5">
      <p className="font-medium">{session.user.displayName}</p>
      <p className="mt-1 break-all text-xs text-slate-500">
        {session.user.email ?? "구글 회원"}
      </p>
      <Button
        type="button"
        className="mt-4 w-full"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? "로그아웃 중…" : "로그아웃"}
      </Button>
      {mutation.isError && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {errorMessage(mutation.error)}
        </p>
      )}
    </div>
  );
}
