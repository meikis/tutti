import {
  assertValidClientFrame,
  assertValidServerFrame,
  businessEventCatalogRevision,
  businessEventProtocolVersion,
  type BusinessEventClientFrameV1,
  type BusinessEventScopeV1,
  type BusinessEventServerFrameV1,
  type ClientToServerEventTopic,
  type ClientToServerEventV1,
  type ServerToClientEventTopic,
  type ServerToClientEventV1
} from "@tutti-os/event-protocol";

export interface CreateTuttidEventStreamClientInput {
  defaultScope?: BusinessEventScopeV1;
  resolveUrl: () => Promise<string> | string;
  webSocketFactory?: TuttidEventStreamSocketFactory;
  heartbeat?: Partial<TuttidEventStreamHeartbeatConfig>;
  reconnect?: false | Partial<TuttidEventStreamReconnectConfig>;
}

type ClientEventByTopic = {
  [TTopic in ClientToServerEventTopic]: Extract<
    ClientToServerEventV1,
    { topic: TTopic }
  >;
};

type ServerEventByTopic = {
  [TTopic in ServerToClientEventTopic]: Extract<
    ServerToClientEventV1,
    { topic: TTopic }
  >;
};

export interface TuttidEventStreamClient {
  connect(): Promise<void>;
  dispose(): void;
  publishIntent<TTopic extends ClientToServerEventTopic>(
    topic: TTopic,
    payload: ClientEventByTopic[TTopic]["payload"]
  ): Promise<void>;
  subscribe<TTopic extends ServerToClientEventTopic>(
    topic: TTopic,
    listener: (event: ServerEventByTopic[TTopic]) => void,
    options?: TuttidEventStreamSubscribeOptions
  ): () => void;
  subscribeConnectionState(
    listener: (state: TuttidEventStreamConnectionState) => void
  ): () => void;
}

export type TuttidEventStreamConnectionState =
  | "connected"
  | "connecting"
  | "disconnected"
  | "disposed";

export interface TuttidEventStreamSubscribeOptions {
  scope?: BusinessEventScopeV1 | null;
}

type TuttidEventStreamSocketFactory = (url: string) => TuttidEventStreamSocket;

interface TuttidEventStreamSocket {
  addEventListener(type: "close", listener: (event: CloseEvent) => void): void;
  addEventListener(type: "error", listener: (event: Event) => void): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent) => void
  ): void;
  removeEventListener(
    type: "close",
    listener: (event: CloseEvent) => void
  ): void;
  removeEventListener(type: "error", listener: (event: Event) => void): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent) => void
  ): void;
  close(code?: number, reason?: string): void;
  send(data: string): void;
}

interface PendingPublish {
  reject: (error: Error) => void;
  resolve: () => void;
}

interface EventSubscriptionEntry {
  listeners: Set<(event: ServerToClientEventV1) => void>;
  scope?: BusinessEventScopeV1;
  topic: ServerToClientEventTopic;
}

type ParsedServerFrame =
  | {
      frame: BusinessEventServerFrameV1;
      ok: true;
    }
  | {
      error: Error;
      ok: false;
    };

interface SocketListeners {
  close: (event: CloseEvent) => void;
  error: (event: Event) => void;
  message: (event: MessageEvent) => void;
}

type TimerCleanup = () => void;

interface TuttidEventStreamHeartbeatConfig {
  pingIntervalMs: number;
  pongTimeoutMs: number;
  scheduleInterval: (callback: () => void, delayMs: number) => TimerCleanup;
  scheduleTimeout: (callback: () => void, delayMs: number) => TimerCleanup;
}

interface TuttidEventStreamReconnectConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  scheduleTimeout: (callback: () => void, delayMs: number) => TimerCleanup;
}

const defaultHeartbeatConfig: TuttidEventStreamHeartbeatConfig = {
  pingIntervalMs: 15_000,
  pongTimeoutMs: 10_000,
  scheduleInterval: (callback, delayMs) => {
    const handle = globalThis.setInterval(callback, delayMs);
    return () => {
      globalThis.clearInterval(handle);
    };
  },
  scheduleTimeout: (callback, delayMs) => {
    const handle = globalThis.setTimeout(callback, delayMs);
    return () => {
      globalThis.clearTimeout(handle);
    };
  }
};
const handshakeFailureCloseCode = 4002;

const defaultReconnectConfig: TuttidEventStreamReconnectConfig = {
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  scheduleTimeout: (callback, delayMs) => {
    const handle = globalThis.setTimeout(callback, delayMs);
    return () => {
      globalThis.clearTimeout(handle);
    };
  }
};

export function createTuttidEventStreamClient(
  input: CreateTuttidEventStreamClientInput
): TuttidEventStreamClient {
  const webSocketFactory =
    input.webSocketFactory ?? defaultTuttidEventStreamSocketFactory;
  const heartbeat = {
    ...defaultHeartbeatConfig,
    ...input.heartbeat
  };
  const defaultScope = normalizeSubscriptionScope(input.defaultScope);
  const subscriptions = new Map<string, EventSubscriptionEntry>();
  const pendingPublishes = new Map<string, PendingPublish>();
  const connectionStateListeners = new Set<
    (state: TuttidEventStreamConnectionState) => void
  >();
  const reconnect =
    input.reconnect === false
      ? null
      : {
          ...defaultReconnectConfig,
          ...input.reconnect
        };
  let socket: TuttidEventStreamSocket | null = null;
  let connectPromise: Promise<void> | null = null;
  let ready = false;
  let disposed = false;
  let nextRequestID = 1;
  let heartbeatIntervalCleanup: TimerCleanup | null = null;
  let pongTimeoutCleanup: TimerCleanup | null = null;
  let reconnectCleanup: TimerCleanup | null = null;
  let reconnectAttempt = 0;
  let awaitingPong = false;

  return {
    connect() {
      return connectInternal();
    },
    dispose() {
      disposed = true;
      cancelReconnect();
      const activeSocket = socket;
      if (!activeSocket) {
        connectPromise = null;
        ready = false;
        notifyConnectionState("disposed");
        return;
      }

      resetSocketState(activeSocket);
      rejectPendingPublishes(new Error("Tuttid event stream was disposed."));
      activeSocket.close(1000, "disposed");
      notifyConnectionState("disposed");
    },
    async publishIntent(topic, payload) {
      await this.connect();

      const activeSocket = socket;
      if (!activeSocket || !ready) {
        throw new Error("Tuttid event stream is not connected.");
      }

      const requestId = createRequestID();
      const completion = createPendingPublishCompletion(requestId);
      pendingPublishes.set(requestId, completion);

      const frame: BusinessEventClientFrameV1 = {
        event: createClientEvent(topic, payload),
        kind: "publish",
        requestId
      };
      assertValidClientFrame(frame);
      activeSocket.send(JSON.stringify(frame));

      return await completion.promise;
    },
    subscribe(topic, listener, options) {
      const scope =
        options?.scope === null
          ? undefined
          : normalizeSubscriptionScope(options?.scope ?? defaultScope);
      const key = createSubscriptionKey(topic, scope);
      let subscription = subscriptions.get(key);
      if (!subscription) {
        subscription = {
          listeners: new Set(),
          scope,
          topic
        };
        subscriptions.set(key, subscription);
      }

      subscription.listeners.add(
        listener as (event: ServerToClientEventV1) => void
      );
      flushSubscription(subscription);

      return () => {
        const currentSubscription = subscriptions.get(key);
        if (!currentSubscription) {
          return;
        }

        currentSubscription.listeners.delete(
          listener as (event: ServerToClientEventV1) => void
        );
        if (currentSubscription.listeners.size === 0) {
          subscriptions.delete(key);
          flushUnsubscription(currentSubscription);
        }
      };
    },
    subscribeConnectionState(listener) {
      connectionStateListeners.add(listener);
      return () => {
        connectionStateListeners.delete(listener);
      };
    }
  };

  function connectInternal(): Promise<void> {
    if (disposed) {
      return Promise.reject(new Error("Tuttid event stream was disposed."));
    }
    cancelReconnect();
    if (connectPromise) {
      return connectPromise;
    }

    connectPromise = (async () => {
      notifyConnectionState("connecting");
      const url = await input.resolveUrl();
      const nextSocket = webSocketFactory(url);
      socket = nextSocket;
      ready = false;

      return await new Promise<void>((resolve, reject) => {
        let settled = false;
        let listeners: SocketListeners | null = null;

        const fail = (error: Error) => {
          if (settled) {
            return;
          }

          settled = true;
          detachSocketListeners(nextSocket, listeners);
          listeners = null;
          resetSocketState(nextSocket);
          nextSocket.close(handshakeFailureCloseCode, "handshake_failed");
          scheduleReconnect();
          reject(error);
        };

        const messageListener = (event: MessageEvent) => {
          const parsedFrame = parseServerFrame(event.data);
          if (!parsedFrame.ok) {
            if (!ready) {
              fail(parsedFrame.error);
            }
            return;
          }

          const frame = parsedFrame.frame;

          if (!ready) {
            if (frame.kind !== "ready") {
              fail(
                frame.kind === "error"
                  ? createFrameError(frame)
                  : new Error(
                      `Tuttid event stream received an unexpected ${frame.kind} frame before ready.`
                    )
              );
              return;
            }

            if (frame.protocolVersion !== businessEventProtocolVersion) {
              fail(
                new Error(
                  `Tuttid event stream protocol version mismatch. Expected ${String(businessEventProtocolVersion)}, received ${String(frame.protocolVersion)}.`
                )
              );
              return;
            }

            if (frame.catalogRevision !== businessEventCatalogRevision) {
              fail(
                new Error(
                  `Tuttid event stream catalog revision mismatch. Expected ${businessEventCatalogRevision}, received ${frame.catalogRevision}.`
                )
              );
              return;
            }

            ready = true;
            reconnectAttempt = 0;
            flushSubscriptions();
            startHeartbeat(nextSocket);
            notifyConnectionState("connected");
            if (!settled) {
              settled = true;
              resolve();
            }
            return;
          }

          handleServerFrame(frame);
        };
        const errorListener = () => {
          if (!ready) {
            fail(new Error("Tuttid event stream connection failed."));
          }
        };
        const closeListener = (event: CloseEvent) => {
          const closeError = createCloseError(event);
          if (!ready) {
            fail(closeError);
            return;
          }

          detachSocketListeners(nextSocket, listeners);
          listeners = null;
          resetSocketState(nextSocket);
          rejectPendingPublishes(closeError);
          scheduleReconnect();
        };

        listeners = {
          close: closeListener,
          error: errorListener,
          message: messageListener
        };

        nextSocket.addEventListener("message", messageListener);
        nextSocket.addEventListener("error", errorListener);
        nextSocket.addEventListener("close", closeListener);
      });
    })();

    connectPromise.catch(() => {});
    return connectPromise;
  }

  function createRequestID(): string {
    return String(nextRequestID++);
  }

  function createPendingPublishCompletion(requestId: string): PendingPublish & {
    promise: Promise<void>;
  } {
    let rejectFn: (error: Error) => void = () => {};
    let resolveFn: () => void = () => {};
    const promise = new Promise<void>((resolve, reject) => {
      resolveFn = () => {
        pendingPublishes.delete(requestId);
        resolve();
      };
      rejectFn = (error) => {
        pendingPublishes.delete(requestId);
        reject(error);
      };
    });

    return {
      promise,
      reject: rejectFn,
      resolve: resolveFn
    };
  }

  function flushSubscriptions() {
    if (!socket || !ready) {
      return;
    }

    for (const subscription of subscriptions.values()) {
      flushSubscription(subscription);
    }
  }

  function flushSubscription(subscription: EventSubscriptionEntry): void {
    if (!socket || !ready) {
      return;
    }
    const subscribeFrame: BusinessEventClientFrameV1 = {
      kind: "subscribe",
      requestId: createRequestID(),
      topics: [subscription.topic]
    };
    if (subscription.scope) {
      subscribeFrame.scope = subscription.scope;
    }
    assertValidClientFrame(subscribeFrame);
    socket.send(JSON.stringify(subscribeFrame));
  }

  function flushUnsubscription(subscription: EventSubscriptionEntry): void {
    if (!socket || !ready) {
      return;
    }
    const unsubscribeFrame: BusinessEventClientFrameV1 = {
      kind: "unsubscribe",
      requestId: createRequestID(),
      topics: [subscription.topic]
    };
    if (subscription.scope) {
      unsubscribeFrame.scope = subscription.scope;
    }
    assertValidClientFrame(unsubscribeFrame);
    socket.send(JSON.stringify(unsubscribeFrame));
  }

  function handleServerFrame(frame: BusinessEventServerFrameV1): void {
    switch (frame.kind) {
      case "ack": {
        pendingPublishes.get(frame.requestId)?.resolve();
        return;
      }
      case "error": {
        if (frame.requestId) {
          pendingPublishes
            .get(frame.requestId)
            ?.reject(createFrameError(frame));
        }
        return;
      }
      case "event": {
        for (const subscription of subscriptions.values()) {
          if (
            subscription.topic !== frame.event.topic ||
            !eventMatchesSubscriptionScope(
              frame.event.scope,
              subscription.scope
            )
          ) {
            continue;
          }
          for (const topicListener of subscription.listeners) {
            topicListener(frame.event);
          }
        }
        return;
      }
      case "pong":
        resolveHeartbeatPong();
        return;
      case "ready":
        return;
    }
  }

  function rejectPendingPublishes(error: Error): void {
    for (const pendingPublish of pendingPublishes.values()) {
      pendingPublish.reject(error);
    }
    pendingPublishes.clear();
  }

  function resetSocketState(nextSocket: TuttidEventStreamSocket): void {
    if (socket === nextSocket) {
      socket = null;
    }
    connectPromise = null;
    ready = false;
    stopHeartbeat();
    if (!disposed) {
      notifyConnectionState("disconnected");
    }
  }

  function startHeartbeat(activeSocket: TuttidEventStreamSocket): void {
    stopHeartbeat();
    heartbeatIntervalCleanup = heartbeat.scheduleInterval(() => {
      if (!ready || socket !== activeSocket || awaitingPong) {
        return;
      }

      const pingFrame: BusinessEventClientFrameV1 = {
        kind: "ping",
        requestId: createRequestID(),
        sentAt: new Date().toISOString()
      };
      assertValidClientFrame(pingFrame);
      activeSocket.send(JSON.stringify(pingFrame));
      awaitingPong = true;
      pongTimeoutCleanup = heartbeat.scheduleTimeout(() => {
        if (socket !== activeSocket || !awaitingPong) {
          return;
        }

        activeSocket.close(4000, "heartbeat_timeout");
      }, heartbeat.pongTimeoutMs);
    }, heartbeat.pingIntervalMs);
  }

  function resolveHeartbeatPong(): void {
    awaitingPong = false;
    if (pongTimeoutCleanup) {
      pongTimeoutCleanup();
      pongTimeoutCleanup = null;
    }
  }

  function stopHeartbeat(): void {
    awaitingPong = false;
    if (heartbeatIntervalCleanup) {
      heartbeatIntervalCleanup();
      heartbeatIntervalCleanup = null;
    }
    if (pongTimeoutCleanup) {
      pongTimeoutCleanup();
      pongTimeoutCleanup = null;
    }
  }

  function scheduleReconnect(): void {
    if (!reconnect || disposed || reconnectCleanup !== null) {
      return;
    }
    reconnectAttempt += 1;
    const delayMs = Math.min(
      reconnect.initialDelayMs * 2 ** Math.max(0, reconnectAttempt - 1),
      reconnect.maxDelayMs
    );
    reconnectCleanup = reconnect.scheduleTimeout(() => {
      reconnectCleanup = null;
      void connectInternal().catch(() => {
        scheduleReconnect();
      });
    }, delayMs);
  }

  function cancelReconnect(): void {
    if (!reconnectCleanup) {
      return;
    }
    reconnectCleanup();
    reconnectCleanup = null;
  }

  function notifyConnectionState(
    state: TuttidEventStreamConnectionState
  ): void {
    for (const listener of connectionStateListeners) {
      listener(state);
    }
  }
}

function normalizeSubscriptionScope(
  scope: BusinessEventScopeV1 | undefined
): BusinessEventScopeV1 | undefined {
  const workspaceId = scope?.workspaceId?.trim();
  if (!workspaceId) {
    return undefined;
  }
  return { workspaceId };
}

function createSubscriptionKey(
  topic: ServerToClientEventTopic,
  scope: BusinessEventScopeV1 | undefined
): string {
  return `${topic}\n${scope?.workspaceId ?? ""}`;
}

function eventMatchesSubscriptionScope(
  eventScope: BusinessEventScopeV1 | undefined,
  subscriptionScope: BusinessEventScopeV1 | undefined
): boolean {
  const workspaceId = subscriptionScope?.workspaceId?.trim();
  if (!workspaceId) {
    return true;
  }
  return eventScope?.workspaceId?.trim() === workspaceId;
}

function createClientEvent<TTopic extends ClientToServerEventTopic>(
  topic: TTopic,
  payload: ClientEventByTopic[TTopic]["payload"]
): ClientEventByTopic[TTopic] {
  return {
    emittedAt: new Date().toISOString(),
    id: globalThis.crypto.randomUUID(),
    payload,
    topic,
    version: businessEventProtocolVersion
  };
}

function defaultTuttidEventStreamSocketFactory(
  url: string
): TuttidEventStreamSocket {
  return new WebSocket(url);
}

function parseServerFrame(data: unknown): ParsedServerFrame {
  if (typeof data !== "string") {
    return {
      error: new Error(
        "Tuttid event stream received a non-text server frame during handshake."
      ),
      ok: false
    };
  }

  try {
    const frame = JSON.parse(data) as unknown;
    const readyMismatchError = getReadyCompatibilityError(frame);
    if (readyMismatchError) {
      return {
        error: readyMismatchError,
        ok: false
      };
    }

    assertValidServerFrame(frame);
    return {
      frame,
      ok: true
    };
  } catch {
    return {
      error: new Error(
        "Tuttid event stream received an invalid server frame during handshake."
      ),
      ok: false
    };
  }
}

function getReadyCompatibilityError(frame: unknown): Error | null {
  if (!isRecord(frame) || frame.kind !== "ready") {
    return null;
  }

  if (frame.protocolVersion !== businessEventProtocolVersion) {
    return new Error(
      `Tuttid event stream protocol version mismatch. Expected ${businessEventProtocolVersion}, received ${String(frame.protocolVersion)}.`
    );
  }

  if (frame.catalogRevision !== businessEventCatalogRevision) {
    return new Error(
      `Tuttid event stream catalog revision mismatch. Expected ${businessEventCatalogRevision}, received ${String(frame.catalogRevision)}.`
    );
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function detachSocketListeners(
  socket: TuttidEventStreamSocket,
  listeners: SocketListeners | null
): void {
  if (!listeners) {
    return;
  }

  socket.removeEventListener("message", listeners.message);
  socket.removeEventListener("error", listeners.error);
  socket.removeEventListener("close", listeners.close);
}

function createCloseError(event: CloseEvent): Error {
  const suffix = event.reason ? `: ${event.reason}` : "";
  return new Error(
    `Tuttid event stream closed (${event.code || 1006})${suffix}.`
  );
}

function createFrameError(
  frame: Extract<BusinessEventServerFrameV1, { kind: "error" }>
): Error {
  return new Error(frame.message || frame.code || "Tuttid event stream error.");
}
