import * as assert from 'assert';
import { describe, it } from 'mocha';
import { getReleaseNotesNotificationAction } from '../utils/releaseNotesUtils';

describe('releaseNotesUtils', () => {
  it('skips when the current version is unavailable', () => {
    assert.strictEqual(getReleaseNotesNotificationAction('1.2.5', undefined), 'skip');
  });

  it('records without notifying on first install', () => {
    assert.strictEqual(getReleaseNotesNotificationAction(undefined, '1.2.6'), 'recordOnly');
  });

  it('skips when the version has not changed', () => {
    assert.strictEqual(getReleaseNotesNotificationAction('1.2.6', '1.2.6'), 'skip');
  });

  it('notifies when the extension version changed', () => {
    assert.strictEqual(getReleaseNotesNotificationAction('1.2.5', '1.2.6'), 'notify');
  });
});
