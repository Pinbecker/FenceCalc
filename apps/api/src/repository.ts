import type { EstimateSnapshot } from "@fence-estimator/contracts";

export interface SnapshotRepository {
  create(snapshot: EstimateSnapshot): Promise<void>;
  getById(id: string): Promise<EstimateSnapshot | null>;
}

export class InMemorySnapshotRepository implements SnapshotRepository {
  private readonly storage = new Map<string, EstimateSnapshot>();

  public create(snapshot: EstimateSnapshot): Promise<void> {
    this.storage.set(snapshot.id, snapshot);
    return Promise.resolve();
  }

  public getById(id: string): Promise<EstimateSnapshot | null> {
    return Promise.resolve(this.storage.get(id) ?? null);
  }
}
