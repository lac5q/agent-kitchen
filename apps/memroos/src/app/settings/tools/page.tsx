"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Plug,
  RotateCw,
  Search,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Btn, Card, PageHeader } from "@/components/shared/ui";
import { NOC } from "@/lib/noc-theme";

import {
  PROVIDERS_BY_KEY,
  getGroupedProviders,
  isApiKeyProvider,
  isOAuthProvider,
} from "@/lib/tool-auth/providers";
import type {
  ConnectionActivityEvent,
  ConnectionAuthMode,
  ConnectionStatus,
  ConnectionUsage,
  ListActivityResponse,
  ListConnectionsResponse,
  ListProvidersResponse,
  GetUsageResponse,
  ToolConnection,
} from "@/lib/tool-auth/types";

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return (await res.json()) as T;
}

function useProviders() {
  return useQuery({
    queryKey: ["tools", "providers"],
    queryFn: () => fetchJson<ListProvidersResponse>("/api/tools/providers"),
    staleTime: 60_000,
  });
}

function useConnections() {
  return useQuery({
    queryKey: ["tools", "connections"],
    queryFn: () => fetchJson<ListConnectionsResponse>("/api/tools/connections"),
    staleTime: 5_000,
  });
}

function useActivity() {
  return useQuery({
    queryKey: ["tools", "activity"],
    queryFn: () => fetchJson<ListActivityResponse>("/api/tools/activity?limit=5"),
    staleTime: 5_000,
  });
}

function useUsage() {
  return useQuery({
    queryKey: ["tools", "usage"],
    queryFn: () => fetchJson<GetUsageResponse>("/api/tools/usage"),
    staleTime: 30_000,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ConnectedToolsPage() {
  const providers = useProviders();
  const connections = useConnections();
  const activity = useActivity();
  const usage = useUsage();
  const [query, setQuery] = useState("");

  const connectionByKey = useMemo(() => {
    const map = new Map<string, ToolConnection>();
    for (const c of connections.data?.connections ?? []) map.set(c.providerKey, c);
    return map;
  }, [connections.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!providers.data) return [];
    return getGroupedProviders()
      .map(({ category, providers: list }) => ({
        category,
        providers: list.filter(
          (p) =>
            !q ||
            p.label.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.key.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.providers.length > 0);
  }, [providers.data, query]);

  const hasAnyConnection = (connections.data?.connections ?? []).length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governance"
        title="Connected Tools"
        hint="Manage OAuth and API-key connections to third-party tools."
      />

      <UsageMeter usage={usage.data?.usage} approaching={usage.data?.approachingLimit ?? false} />

      <RecentActivity events={activity.data?.events ?? []} />

      <Card pad="md">
        <div style={{ position: "relative" }}>
          <Search
            size={14}
            color={NOC.muted}
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
          />
          <Input
            placeholder="Search providers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>
      </Card>

      {providers.isLoading ? (
        <SkeletonGrid />
      ) : filtered.length === 0 ? (
        <Card pad="md">
          <p style={{ color: NOC.muted, margin: 0 }}>
            No providers match &ldquo;{query}&rdquo;. Clear search to see all providers.
          </p>
        </Card>
      ) : (
        filtered.map(({ category, providers: list }) => (
          <section key={category.id}>
            <h2
              style={{
                color: NOC.ink,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.06em",
                margin: "0 0 10px",
                textTransform: "uppercase",
              }}
            >
              {category.label} <span style={{ color: NOC.muted }}>({list.length})</span>
            </h2>
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              }}
            >
              {list.map((p) => (
                <ProviderCard
                  key={p.key}
                  providerKey={p.key}
                  connection={connectionByKey.get(p.key) ?? null}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {!hasAnyConnection && providers.data && (
        <Card pad="md">
          <p style={{ color: NOC.muted, margin: 0, fontSize: 13 }}>
            No tools connected yet. Choose a provider above to connect via OAuth or API key.
          </p>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage meter
// ---------------------------------------------------------------------------

function UsageMeter({
  usage,
  approaching,
}: {
  usage: ConnectionUsage | undefined;
  approaching: boolean;
}) {
  if (!usage) return null;
  const { used, limit, plan } = usage;
  const isUnlimited = !Number.isFinite(limit);
  return (
    <Card pad="sm">
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 12,
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ color: NOC.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>
            NANGO PLAN · {plan.toUpperCase()}
          </div>
          <div style={{ color: NOC.ink, fontSize: 14, fontWeight: 700, marginTop: 2 }}>
            {isUnlimited ? "Unlimited connections" : `${used} of ${limit} connections used`}
          </div>
        </div>
        {approaching && !isUnlimited && (
          <Btn variant="ghost" onClick={() => window.open("https://nango.dev/pricing", "_blank")}>
            Upgrade Nango plan →
          </Btn>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Recent activity strip
// ---------------------------------------------------------------------------

function RecentActivity({ events }: { events: ConnectionActivityEvent[] }) {
  if (events.length === 0) return null;
  return (
    <Card pad="sm">
      <div style={{ color: NOC.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>
        RECENT ACTIVITY
      </div>
      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
        {events.map((e) => (
          <li
            key={e.id}
            style={{
              alignItems: "center",
              display: "flex",
              gap: 8,
              color: NOC.muted,
              fontSize: 12,
              padding: "4px 0",
            }}
          >
            <span style={{ color: NOC.ink, fontWeight: 600 }}>
              {PROVIDERS_BY_KEY[e.providerKey]?.label ?? e.providerKey}
            </span>
            <span>{describeActivity(e)}</span>
            <span style={{ marginLeft: "auto" }}>{relativeTime(e.at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function describeActivity(e: ConnectionActivityEvent): string {
  switch (e.type) {
    case "connection_established":
      return "connected";
    case "connection_revoked":
      return "revoked";
    case "token_refresh_failed":
      return "token refresh failed";
    case "test_succeeded":
      return "test passed";
    case "test_failed":
      return e.message ?? "test failed";
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} hr ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Provider card
// ---------------------------------------------------------------------------

function ProviderCard({
  providerKey,
  connection,
}: {
  providerKey: string;
  connection: ToolConnection | null;
}) {
  const provider = PROVIDERS_BY_KEY[providerKey];
  if (!provider) return null;
  const Icon = provider.icon;
  const status: ConnectionStatus = connection?.status ?? "not_connected";
  const authMode: ConnectionAuthMode = connection?.authMode ?? (isOAuthProvider(provider) ? "oauth" : "api-key");

  return (
    <Card pad="md" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
        <Icon size={20} color={NOC.ink} />
        <span style={{ color: NOC.ink, fontSize: 14, fontWeight: 700 }}>{provider.label}</span>
        <div style={{ marginLeft: "auto" }}>
          <StatusBadge status={status} />
        </div>
      </div>

      <p style={{ color: NOC.muted, fontSize: 12, margin: 0, lineHeight: 1.4 }}>
        {provider.description}
      </p>

      {connection?.accountEmail && (
        <div style={{ color: NOC.muted, fontSize: 11 }}>
          as <span style={{ color: NOC.ink }}>{connection.accountEmail}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
        {status === "not_connected" || status === "expired" ? (
          <ConnectButton providerKey={providerKey} authMode={authMode} variant={status === "expired" ? "terra" : "ink"} />
        ) : (
          <>
            <RevokeButton providerKey={providerKey} />
          </>
        )}
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  if (status === "connected") {
    return <Badge variant="outline" style={{ background: NOC.successBg, color: NOC.success, borderColor: "transparent" }}>Connected</Badge>;
  }
  if (status === "expired") {
    return (
      <Badge variant="outline" style={{ background: NOC.warnBg, color: NOC.warn, borderColor: "transparent" }}>
        <AlertTriangle size={11} style={{ marginRight: 2 }} />
        Expired
      </Badge>
    );
  }
  if (status === "error") {
    return <Badge variant="destructive">Error</Badge>;
  }
  return <Badge variant="secondary">Not connected</Badge>;
}

// ---------------------------------------------------------------------------
// Connect button (opens OAuth popup or API-key sheet)
// ---------------------------------------------------------------------------

function ConnectButton({
  providerKey,
  authMode,
  variant,
}: {
  providerKey: string;
  authMode: ConnectionAuthMode;
  variant: "ink" | "terra";
}) {
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const queryClient = useQueryClient();

  if (authMode === "oauth") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
        <Btn
          variant={variant}
          onClick={async () => {
            setOauthError(null);
            setOauthLoading(true);
            try {
              const res = await fetch("/api/tools/connect/oauth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ providerKey }),
              });
              const json = (await res.json()) as {
                authorizeUrl?: string;
                error?: string;
                message?: string;
                popupWidth?: number;
                popupHeight?: number;
              };
              if (!res.ok || !json.authorizeUrl) {
                setOauthError(json.message ?? json.error ?? `HTTP ${res.status}`);
                setOauthLoading(false);
                return;
              }
              const popup = window.open(
                json.authorizeUrl,
                `nango-connect-${providerKey}`,
                `width=${json.popupWidth ?? 600},height=${json.popupHeight ?? 700}`,
              );
              // Best-effort: refetch connections when the popup closes.
              const timer = window.setInterval(() => {
                if (popup?.closed) {
                  window.clearInterval(timer);
                  setOauthLoading(false);
                  void queryClient.invalidateQueries({ queryKey: ["tools", "connections"] });
                  void queryClient.invalidateQueries({ queryKey: ["tools", "activity"] });
                  void queryClient.invalidateQueries({ queryKey: ["tools", "usage"] });
                }
              }, 500);
            } catch (e) {
              setOauthError(e instanceof Error ? e.message : "unknown error");
              setOauthLoading(false);
            }
          }}
          disabled={oauthLoading}
        >
          {oauthLoading ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />}
          {variant === "terra" ? "Reconnect" : "Connect"}
          <ChevronRight size={12} />
        </Btn>
        {oauthError && (
          <span style={{ color: NOC.terra, fontSize: 11 }}>
            {oauthError}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <Btn variant={variant} onClick={() => setApiKeyOpen(true)} style={{ width: "100%" }}>
        <Plug size={12} />
        Connect
        <ChevronRight size={12} />
      </Btn>
      <ApiKeySheet
        providerKey={providerKey}
        open={apiKeyOpen}
        onOpenChange={(open) => {
          setApiKeyOpen(open);
          if (!open) void queryClient.invalidateQueries({ queryKey: ["tools", "connections"] });
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// API-key connect sheet
// ---------------------------------------------------------------------------

function ApiKeySheet({
  providerKey,
  open,
  onOpenChange,
}: {
  providerKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const provider = PROVIDERS_BY_KEY[providerKey];
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) return;
    // Reset on close. State updates inside an effect must be deferred or
    // gated; we use a microtask to avoid the cascading-render lint.
    const handle = window.setTimeout(() => {
      setApiKey("");
      setShowKey(false);
      setError(null);
      setSaving(false);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [open]);

  if (!provider || !isApiKeyProvider(provider)) return null;
  const Icon = provider.icon;

  const submit = async () => {
    setError(null);
    if (apiKey.length < 8) {
      setError("API key must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/tools/connect/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ providerKey, credentials: { apiKey } }),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(json.message ?? json.error ?? `HTTP ${res.status}`);
        setSaving(false);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["tools", "connections"] });
      void queryClient.invalidateQueries({ queryKey: ["tools", "activity"] });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" style={{ width: 400 }}>
        <SheetHeader>
          <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
            <Icon size={18} color={NOC.ink} />
            <SheetTitle>Connect {provider.label}</SheetTitle>
          </div>
          <SheetDescription>{provider.description}</SheetDescription>
        </SheetHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          <label style={{ color: NOC.muted, fontSize: 12, fontWeight: 600 }}>
            {provider.apiKeyField}
          </label>
          <div style={{ position: "relative" }}>
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key"
              autoComplete="off"
              data-1p-ignore
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? "Hide API key" : "Show API key"}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: NOC.muted,
              }}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <a
            href={provider.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: NOC.info, fontSize: 11 }}
          >
            Where do I get this key? →
          </a>

          {error && (
            <div style={{ color: NOC.terra, fontSize: 12 }}>{error}</div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 24,
            paddingTop: 16,
            borderTop: `1px solid ${NOC.rule}`,
          }}
        >
          <Btn variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Btn>
          <Btn variant="ink" onClick={submit} disabled={saving}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Save connection
          </Btn>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Revoke button + sheet
// ---------------------------------------------------------------------------

function RevokeButton({ providerKey }: { providerKey: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tools/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ providerKey }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onMutate: async () => {
      // Optimistic update — immediately remove the connection from the cache.
      await queryClient.cancelQueries({ queryKey: ["tools", "connections"] });
      const previous = queryClient.getQueryData<ListConnectionsResponse>(["tools", "connections"]);
      if (previous) {
        queryClient.setQueryData<ListConnectionsResponse>(["tools", "connections"], {
          connections: previous.connections.filter((c) => c.providerKey !== providerKey),
        });
      }
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["tools", "connections"], ctx.previous);
      }
      console.error("Revoke failed", err);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["tools", "connections"] });
      void queryClient.invalidateQueries({ queryKey: ["tools", "activity"] });
      void queryClient.invalidateQueries({ queryKey: ["tools", "usage"] });
    },
  });

  return (
    <>
      <Btn variant="flat" onClick={() => setOpen(true)} style={{ color: NOC.terra }}>
        <Trash2 size={12} /> Revoke
      </Btn>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" style={{ width: 400 }}>
          <SheetHeader>
            <SheetTitle>Revoke {PROVIDERS_BY_KEY[providerKey]?.label ?? providerKey} connection?</SheetTitle>
            <SheetDescription>
              This removes memroos&rsquo;s access token from the vault. Any agents using{" "}
              {PROVIDERS_BY_KEY[providerKey]?.label ?? providerKey} will stop immediately. This action is
              logged in the audit log.
            </SheetDescription>
          </SheetHeader>
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 24,
              paddingTop: 16,
              borderTop: `1px solid ${NOC.rule}`,
            }}
          >
            <Btn variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Btn>
            <Btn
              variant="terra"
              onClick={async () => {
                await revoke.mutateAsync();
                setOpen(false);
              }}
              disabled={revoke.isPending}
            >
              {revoke.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Revoke connection
            </Btn>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton (kept simple — matches the grid layout)
// ---------------------------------------------------------------------------

function SkeletonGrid() {
  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      }}
      aria-busy="true"
      aria-label="Loading providers"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} pad="md" style={{ background: NOC.fog, opacity: 0.6, height: 110 }}>
          <span />
        </Card>
      ))}
    </div>
  );
}

// Suppress unused-imports warnings for icons that may be re-introduced.
void RotateCw;