export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateMemroosEnvAtStartup } = await import('./lib/env');
    validateMemroosEnvAtStartup();

    const { tryAcquireSchedulerLock } = await import('./lib/scheduler-singleton');
    if (!tryAcquireSchedulerLock()) {
      // Another memroos process owns the schedulers; serve HTTP only.
      return;
    }
    const { startConsolidationScheduler } = await import('./lib/memory-consolidation');
    const { startDecayScheduler } = await import('./lib/memory-decay');
    const { startRetentionExpiryScheduler } = await import('./lib/memory-retention-expiry-scheduler');
    const { startGraphCatchupScheduler } = await import('./lib/memory-graph-catchup-scheduler');
    const { prewarmResponseCaches } = await import('./lib/response-cache');
    const { startSlaScheduler } = await import('./lib/hil/sla-scheduler');
    const { startEmbeddingJob } = await import('./lib/embeddings/embedding-job');
    startConsolidationScheduler();
    startDecayScheduler();
    startRetentionExpiryScheduler();
    startGraphCatchupScheduler();
    startSlaScheduler();
    startEmbeddingJob();
    void prewarmResponseCaches();
  }
}
