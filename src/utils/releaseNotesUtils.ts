export type ReleaseNotesNotificationAction = 'skip' | 'recordOnly' | 'notify';

export function getReleaseNotesNotificationAction(
  previousVersion: string | undefined,
  currentVersion: string | undefined
): ReleaseNotesNotificationAction {
  if (!currentVersion) {
    return 'skip';
  }

  if (!previousVersion) {
    return 'recordOnly';
  }

  if (previousVersion === currentVersion) {
    return 'skip';
  }

  return 'notify';
}
