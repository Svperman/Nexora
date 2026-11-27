// Traces OpenTelemetry -> Jaeger (OTLP/HTTP). Chargé AVANT l'application :
//   node --import ./src/tracing.js src/index.js
// Inactif si OTEL_EXPORTER_OTLP_ENDPOINT n'est pas défini (dev, tests).
// Le nom du service vient de OTEL_SERVICE_NAME (nexora-api / nexora-worker).
import { register } from 'node:module';

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  // Hook ESM : nécessaire pour instrumenter les modules chargés via `import`.
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
  const { HttpInstrumentation } = await import('@opentelemetry/instrumentation-http');
  const { ExpressInstrumentation } = await import('@opentelemetry/instrumentation-express');
  const { MongoDBInstrumentation } = await import('@opentelemetry/instrumentation-mongodb');
  const { IORedisInstrumentation } = await import('@opentelemetry/instrumentation-ioredis');

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      new HttpInstrumentation({
        // Pas de traces pour les sondes et le scraping Prometheus.
        ignoreIncomingRequestHook: (req) => /^\/(healthz|readyz|metrics)/.test(req.url || ''),
      }),
      new ExpressInstrumentation(),
      new MongoDBInstrumentation({ enhancedDatabaseReporting: false }), // pas de contenu de requête dans les traces
      new IORedisInstrumentation(),
    ],
  });
  sdk.start();

  const shutdown = () => sdk.shutdown().catch(() => {});
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
