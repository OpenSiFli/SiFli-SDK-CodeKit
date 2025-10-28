import * as net from 'net';

export interface GetPortOptions {
  port?: number;
  host?: string;
}

const DEFAULT_HOST = '127.0.0.1';

/**
 * Minimal replacement for the `get-port` package to find a free TCP port.
 * When a specific port is requested, the function resolves with that port
 * if it is available, otherwise it resolves to -1.
 */
export function getAvailablePort(options?: GetPortOptions): Promise<number> {
  const requestedPort = options?.port;
  const host = options?.host ?? DEFAULT_HOST;

  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();

    server.on('error', (error: NodeJS.ErrnoException) => {
      server.close();
      if (requestedPort && error.code === 'EADDRINUSE') {
        resolve(-1);
      } else if (error.code === 'EACCES') {
        reject(new Error(`Port ${requestedPort ?? ''} requires elevated privileges`));
      } else {
        reject(error);
      }
    });

    server.listen(
      {
        port: requestedPort ?? 0,
        host,
        exclusive: true,
      },
      () => {
        const address = server.address();
        server.close(() => {
          if (typeof address === 'object' && address) {
            resolve(address.port);
          } else if (typeof requestedPort === 'number') {
            resolve(requestedPort);
          } else {
            resolve(0);
          }
        });
      }
    );
  });
}
