import type { SystemEvent } from "../router.js";
import { BacklogService } from "../../domain/backlog/backlog-service.js";
import { AcceptanceTestService } from "../../domain/acceptance/acceptance-test-service.js";

export interface EventSink {
  publish(event: SystemEvent): Promise<void>;
}

interface BacklogTickProbe {
  hasReadyEpic(): Promise<boolean>;
  isAcceptanceTestRunRequired(): Promise<boolean>;
}

class BacklogServiceTickProbe implements BacklogTickProbe {
  constructor(
    private readonly backlogService: Pick<BacklogService, "listReadyEpics" | "list"> = new BacklogService(),
    private readonly acceptanceTestService: Pick<AcceptanceTestService, "list"> = new AcceptanceTestService(),
  ) {}

  async hasReadyEpic(): Promise<boolean> {
    // For Developer wake-up we only care about epics that are ready to start now.
    const readyEpics = await this.backlogService.listReadyEpics();
    return readyEpics.length > 0;
  }

  async isAcceptanceTestRunRequired(): Promise<boolean> {
    const backlog = await this.backlogService.list({ includeHidden: true });
    if (backlog.epics.length === 0) {
      return false;
    }
    const allEpicsDone = backlog.epics.every((epic) => epic.status === "done");
    if (!allEpicsDone) {
      return false;
    }

    const tests = await this.acceptanceTestService.list();
    return tests.some((test) => test.lastExecutionStatus === "not-run");
  }
}

export class BacklogPoller {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly sink: EventSink,
    private readonly pollIntervalMs: number = 3_000,
    private readonly probe: BacklogTickProbe = new BacklogServiceTickProbe(),
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
    if (await this.probe.hasReadyEpic()) {
      await this.sink.publish({ type: "backlog.epic.ready" });
    }
    if (await this.probe.isAcceptanceTestRunRequired()) {
      await this.sink.publish({ type: "acceptance-test.required" });
    }
  }
}
