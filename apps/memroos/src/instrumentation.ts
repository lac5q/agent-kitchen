export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateMemroosEnvAtStartup } = await import('./lib/env');
    validateMemroosEnvAtStartup();

    // CFGDUR-02: refuse to boot into a backend topology the host did not
    // declare. An explicit `docker compose -f` defeats both the compose
    // override and COMPOSE_FILE, so this is the only control that survives
    // the invocation that silently disconnected Aura for months.
    const { assertHostTopology } = await import('./lib/host-profile/assert-topology');
    assertHostTopology();

    const { tryAcquireSchedulerLock } = await import('./lib/scheduler-singleton');
    if (!tryAcquireSchedulerLock()) {
      // Another memroos process owns the schedulers; serve HTTP only.
      return;
    }
    const { startConsolidationScheduler } = await import('./lib/memory-consolidation');
    const { startDecayScheduler } = await import('./lib/memory-decay');
    const { startRetentionExpiryScheduler } = await import('./lib/memory-retention-expiry-scheduler');
    const { startGraphCatchupScheduler } = await import('./lib/memory-graph-catchup-scheduler');
    const { startWikiDigestScheduler } = await import('./lib/wiki-digest-scheduler');
    const { prewarmResponseCaches } = await import('./lib/response-cache');
    const { startSlaScheduler } = await import('./lib/hil/sla-scheduler');
    const { startEmbeddingJob } = await import('./lib/embeddings/embedding-job');
    startConsolidationScheduler();
    startDecayScheduler();
    startRetentionExpiryScheduler();
    startGraphCatchupScheduler();
    startWikiDigestScheduler();
    startSlaScheduler();
    startEmbeddingJob();
    void prewarmResponseCaches();
  }
}
