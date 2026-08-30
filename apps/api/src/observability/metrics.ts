import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "@prometheus-io/client";

export class ApiOperationalMetrics {
  private readonly registry = new Registry();
  private readonly requests = new Counter({
    name: "fence_estimator_http_requests_total",
    help: "Completed HTTP requests",
    labelNames: ["method", "route", "status_class"] as const,
    registers: [this.registry],
  });
  private readonly duration = new Histogram({
    name: "fence_estimator_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_class"] as const,
    buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });
  private readonly readiness = new Gauge({
    name: "fence_estimator_ready",
    help: "Whether the API and its persistence dependency passed the latest readiness check",
    registers: [this.registry],
  });

  public constructor() {
    this.registry.setDefaultLabels({ service: "fence-estimator-api" });
    collectDefaultMetrics({ register: this.registry, prefix: "fence_estimator_process_" });
  }

  public recordRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const labels = { method, route, status_class: `${Math.floor(statusCode / 100)}xx` };
    this.requests.inc(labels);
    this.duration.observe(labels, durationSeconds);
  }
  public markReady(ready: boolean): void {
    this.readiness.set(ready ? 1 : 0);
  }
  public render(): Promise<string> {
    return this.registry.metrics();
  }
  public get contentType(): string {
    return this.registry.contentType;
  }
}
