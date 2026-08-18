const userMembershipTails = new Map<string, Promise<void>>();

/** Wait until every membership operation that has already entered the queue finishes. */
export async function drainUserMembershipLocks(): Promise<void> {
  while (userMembershipTails.size > 0) {
    await Promise.allSettled([...userMembershipTails.values()]);
  }
}

/** Serialize one user's room-membership transitions across different rooms. */
export async function withUserMembershipLock<T>(userId: string, task: () => Promise<T> | T): Promise<T> {
  const previous = userMembershipTails.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  userMembershipTails.set(userId, tail);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (userMembershipTails.get(userId) === tail) userMembershipTails.delete(userId);
  }
}
