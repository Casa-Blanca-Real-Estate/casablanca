// EXCERPT — server/index.ts (MindBinder @ main 5cc386d4). Drain the paced queue on SIGTERM/SIGINT so every
// still-queued request is recorded as a `shutdown` drop instead of vanishing on a redeploy.

    // released before the next workflow instance tries to bind it.
    const shutdown = (sig: string) => {
      log(`${sig} received — shutting down`);
      // The Jev watch's paced queue can hold hours of requests under the Gateway's rate limit; a
      // redeploy ends them. Settle each as a `shutdown` drop so the watch's ledger counts them.
      jevShutdown();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 4000).unref();
    };
