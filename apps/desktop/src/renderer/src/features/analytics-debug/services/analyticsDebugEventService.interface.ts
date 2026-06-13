import type { TrackEvent } from "@tutti-os/client-tuttid-ts";
import { createDecorator } from "@zk-tech/bedrock/di";

export type AnalyticsDebugEventServiceSnapshot = TrackEvent[];

export interface IAnalyticsDebugEventService {
  readonly _serviceBrand: undefined;

  clear(): void;
  getSnapshot(): AnalyticsDebugEventServiceSnapshot;
  recordEvents(events: TrackEvent[]): void;
  subscribe(listener: () => void): () => void;
}

export const IAnalyticsDebugEventService =
  createDecorator<IAnalyticsDebugEventService>("analytics-debug-event-service");
