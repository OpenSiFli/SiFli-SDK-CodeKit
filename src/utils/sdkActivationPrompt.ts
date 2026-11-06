export function promptForSdkSelection(
  showPrompt: () => PromiseLike<string | undefined>,
  selectSdkAction: string,
  activateSdkEnvironment: () => PromiseLike<void> | void
): void {
  void Promise.resolve(showPrompt()).then(response => {
    if (response === selectSdkAction) {
      void activateSdkEnvironment();
    }
  });
}
