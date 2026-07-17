// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import {
  BELIEF_CONFIG_ENV_KEYS,
  DEFAULT_BELIEF_PROMOTION_CONFIG,
  loadBeliefPromotionConfig,
} from "../config";

describe("belief promotion config", () => {
  const savedEnv: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of Object.values(BELIEF_CONFIG_ENV_KEYS)) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  function stashEnv(key: string, value: string | undefined) {
    if (!(key in savedEnv)) {
      savedEnv[key] = process.env[key];
    }
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  it("exposes conservative defaults when env is unset", () => {
    const env = {
      ...process.env,
      [BELIEF_CONFIG_ENV_KEYS.highStakes]: undefined,
      [BELIEF_CONFIG_ENV_KEYS.sensitive]: undefined,
      [BELIEF_CONFIG_ENV_KEYS.freshnessDays]: undefined,
    };

    const config = loadBeliefPromotionConfig(env);
    expect(config).toEqual(DEFAULT_BELIEF_PROMOTION_CONFIG);
    expect(config.highStakesCategories.has("pricing")).toBe(true);
    expect(config.sensitiveLabels.has("pii")).toBe(true);
    expect(config.freshnessWindowDays).toBe(180);
  });

  it("parses CSV env overrides and normalizes sensitive labels", () => {
    stashEnv(BELIEF_CONFIG_ENV_KEYS.highStakes, "engineering, pricing ,not-a-category");
    stashEnv(BELIEF_CONFIG_ENV_KEYS.sensitive, " PII , CustomLabel ");
    stashEnv(BELIEF_CONFIG_ENV_KEYS.freshnessDays, "90");

    const config = loadBeliefPromotionConfig(process.env);
    expect([...config.highStakesCategories]).toEqual(["engineering", "pricing"]);
    expect([...config.sensitiveLabels]).toEqual(["pii", "customlabel"]);
    expect(config.freshnessWindowDays).toBe(90);
  });

  it("falls back to defaults for invalid freshness values", () => {
    stashEnv(BELIEF_CONFIG_ENV_KEYS.freshnessDays, "0");
    expect(loadBeliefPromotionConfig(process.env).freshnessWindowDays).toBe(180);

    stashEnv(BELIEF_CONFIG_ENV_KEYS.freshnessDays, "not-a-number");
    expect(loadBeliefPromotionConfig(process.env).freshnessWindowDays).toBe(180);
  });

  it("uses default category and label sets when env CSV is empty", () => {
    stashEnv(BELIEF_CONFIG_ENV_KEYS.highStakes, " , ");
    stashEnv(BELIEF_CONFIG_ENV_KEYS.sensitive, "");

    const config = loadBeliefPromotionConfig(process.env);
    expect(config.highStakesCategories).toEqual(DEFAULT_BELIEF_PROMOTION_CONFIG.highStakesCategories);
    expect(config.sensitiveLabels).toEqual(DEFAULT_BELIEF_PROMOTION_CONFIG.sensitiveLabels);
  });
});
