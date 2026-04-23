export interface IdleTimeoutWatchdog {
  bump(): void;
  dispose(): void;
}

export function createIdleTimeoutWatchdog(timeoutMs: number, onTimeout: () => void): IdleTimeoutWatchdog {
  let disposed = false;
  let timer: NodeJS.Timeout | undefined;

  const arm = () => {
    if (disposed) {
      return;
    }

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      if (disposed) {
        return;
      }

      disposed = true;
      timer = undefined;
      onTimeout();
    }, timeoutMs);
  };

  arm();

  return {
    bump() {
      arm();
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
