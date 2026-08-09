/** Turn cleanup into one shared promise so every failure/finally path is safe. */
export function onceAsync(action) {
  let promise = null;
  return () => {
    if (!promise) promise = Promise.resolve().then(action);
    return promise;
  };
}

/** Ensure startup failures cannot escape without awaiting cleanup. */
export async function withStartupCleanup(startup, cleanup) {
  try {
    return await startup();
  } catch (startupError) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError([startupError, cleanupError], '服务启动失败且清理未完成');
    }
    throw startupError;
  }
}
