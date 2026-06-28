import {
  A2A_CANONICAL_AGENT_CARD_PATH,
  A2A_COMPAT_AGENT_CARD_PATH,
} from "./types";
import { loadMemroosEnv, type A2aOperatingProfile } from "@/lib/env";

export interface A2aConfig {
  profile: A2aOperatingProfile;
  publicBaseUrl: string;
  endpointBaseUrl: string;
  canonicalCardPath: typeof A2A_CANONICAL_AGENT_CARD_PATH;
  compatCardPath: typeof A2A_COMPAT_AGENT_CARD_PATH;
  remoteCardTimeoutMs: number;
  allowPrivateNetworkCards: boolean;
  adkFixtureCardUrl: string;
}

function normalizeBaseUrl(value: string): string {
  const raw = value.trim();
  return raw.replace(/\/+$/, "");
}

export function getA2aConfig(): A2aConfig {
  const env = loadMemroosEnv();
  const publicBaseUrl = normalizeBaseUrl(env.MEMROOS_PUBLIC_BASE_URL);
  const profile = env.MEMROOS_A2A_PROFILE;

  return {
    profile,
    publicBaseUrl,
    endpointBaseUrl: normalizeBaseUrl(env.MEMROOS_A2A_ENDPOINT_BASE_URL),
    canonicalCardPath: A2A_CANONICAL_AGENT_CARD_PATH,
    compatCardPath: A2A_COMPAT_AGENT_CARD_PATH,
    remoteCardTimeoutMs: env.MEMROOS_A2A_REMOTE_CARD_TIMEOUT_MS,
    allowPrivateNetworkCards:
      env.MEMROOS_A2A_ALLOW_PRIVATE_NETWORK_CARDS ?? (profile === "local-dev" || profile === "private-network"),
    adkFixtureCardUrl: env.MEMROOS_A2A_ADK_FIXTURE_CARD_URL,
  };
}
