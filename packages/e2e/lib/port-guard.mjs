import { createServer } from 'node:net';

/** Fail before spawning when a local harness port is already owned. */
export function assertPortAvailable(host, port, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', error => {
      rejectPromise(new Error(`${label} 端口已被占用: ${host}:${port}`, { cause: error }));
    });
    probe.listen({ host, port, exclusive: true }, () => {
      probe.close(error => {
        if (error) rejectPromise(error);
        else resolvePromise();
      });
    });
  });
}
