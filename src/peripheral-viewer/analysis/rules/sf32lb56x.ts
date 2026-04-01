import { PeripheralAnalysisRuntime } from '../runtime';
import { registerAnalyzers, RuleBasedAnalyzer } from './base';

class NoopAnalyzer extends RuleBasedAnalyzer {
  constructor(groupName: string) {
    super('SF32LB56X', groupName);
  }

  protected async run(): Promise<void> {}
}

export function registerSf32lb56xAnalyzers(runtime: PeripheralAnalysisRuntime): void {
  registerAnalyzers(runtime, [new NoopAnalyzer('HPSYS_GPIO'), new NoopAnalyzer('I2C'), new NoopAnalyzer('SPI')]);
}
