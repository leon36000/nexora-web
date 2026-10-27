"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type Lang, localizePath } from "@/i18n/config";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ lang, label }: { lang: Lang; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut();
        router.push(localizePath(lang, "/compte/connexion"));
        router.refresh();
      }}
    >
      {label}
    </Button>
  );
}
