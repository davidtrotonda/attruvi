"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { sanitizeNextPath } from "@/lib/auth/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { AuthDialog, type AuthDialogMode } from "./auth-dialog";

const subscribeToLocation = () => () => undefined;
const getLocationSearch = () => window.location.search;
const getServerLocationSearch = () => "";

export function AuthEntry() {
  const [dialogMode, setDialogMode] = useState<AuthDialogMode>("login");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [automaticDialogDismissed, setAutomaticDialogDismissed] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const locationSearch = useSyncExternalStore(
    subscribeToLocation,
    getLocationSearch,
    getServerLocationSearch,
  );
  const parameters = new URLSearchParams(locationSearch);
  const nextPath = sanitizeNextPath(parameters.get("next"), "/dashboard");
  const requiresAuthentication = parameters.get("auth") === "required";
  const shouldShowDialog =
    dialogOpen || (requiresAuthentication && !automaticDialogDismissed);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;

    void client.auth.getClaims().then(({ data }) => {
      setAuthenticated(typeof data?.claims?.sub === "string");
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session?.user));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <div className="header-auth-actions">
      {authenticated ? (
        <Link className="header-login header-login-active" href="/dashboard">
          Abrir panel
        </Link>
      ) : (
        <button
          className="header-login"
          onClick={() => {
            setAutomaticDialogDismissed(false);
            setDialogMode("login");
            setDialogOpen(true);
          }}
          type="button"
        >
          Entrar
        </button>
      )}
      {shouldShowDialog ? (
        <AuthDialog
          initialMode={requiresAuthentication ? "login" : dialogMode}
          nextPath={nextPath}
          onClose={() => {
            setDialogOpen(false);
            setAutomaticDialogDismissed(true);
          }}
        />
      ) : null}
    </div>
  );
}
