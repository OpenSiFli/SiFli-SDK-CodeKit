import * as assert from 'assert';
import { describe, it } from 'mocha';
import { promptForSdkSelection } from '../utils/sdkActivationPrompt';

describe('sdkActivationPrompt', () => {
  it('returns without waiting for the notification to be resolved', () => {
    let resolvePrompt!: (value: string | undefined) => void;
    const prompt = new Promise<string | undefined>(resolve => {
      resolvePrompt = resolve;
    });
    let activated = 0;

    const result = promptForSdkSelection(
      () => prompt,
      'Select SDK',
      () => {
        activated += 1;
      }
    );

    assert.strictEqual(result, undefined);
    assert.strictEqual(activated, 0);
    resolvePrompt(undefined);
  });

  it('activates the SDK after the notification action is selected', async () => {
    let resolvePrompt!: (value: string | undefined) => void;
    const prompt = new Promise<string | undefined>(resolve => {
      resolvePrompt = resolve;
    });
    let activated = 0;

    promptForSdkSelection(
      () => prompt,
      'Select SDK',
      () => {
        activated += 1;
      }
    );

    resolvePrompt('Select SDK');
    await prompt;
    await Promise.resolve();

    assert.strictEqual(activated, 1);
  });

  it('does nothing when the notification is dismissed', async () => {
    let resolvePrompt!: (value: string | undefined) => void;
    const prompt = new Promise<string | undefined>(resolve => {
      resolvePrompt = resolve;
    });
    let activated = 0;

    promptForSdkSelection(
      () => prompt,
      'Select SDK',
      () => {
        activated += 1;
      }
    );

    resolvePrompt(undefined);
    await prompt;
    await Promise.resolve();

    assert.strictEqual(activated, 0);
  });
});
