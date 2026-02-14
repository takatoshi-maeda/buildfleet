import type { SystemEvent } from "../router.js";
import { BacklogService } from "../../domain/backlog/backlog-service.js";

export interface EventSink {
  publish(event: SystemEvent): Promise<void>;
}

interface ReadyEpicProbe {
  hasReadyEpic(): Promise<boolean>;
}

class BacklogServiceReadyEpicProbe implements ReadyEpicProbe {
  constructor(private readonly backlogService: Pick<BacklogService, "listReadyEpics"> = new BacklogService()) {}

  async hasReadyEpic(): Promise<boolean> {
    // For Developer wake-up we only care about epics that are ready to start now.
    const readyEpics = await this.backlogService.listReadyEpics();
    return readyEpics.length > 0;
  }
}

export class BacklogPoller {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly sink: EventSink,
    private readonly pollIntervalMs: number = 3_000,
    private readonly probe: ReadyEpicProbe = new BacklogServiceReadyEpicProbe(),
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }

    void this.emitTick();
    this.timer = setInterval(() => {
      void this.emitTick();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  private async emitTick(): Promise<void> {
    if (!(await this.probe.hasReadyEpic())) {
      return;
    }

    await this.sink.publish({ type: "backlog.epic.ready" });
  }
}
