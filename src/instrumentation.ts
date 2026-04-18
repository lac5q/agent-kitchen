export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startConsolidationScheduler } = await import('./lib/memory-consolidation');
    const { startDecayScheduler } = await import('./lib/memory-decay');
    startConsolidationScheduler();
    startDecayScheduler();
  }
}
