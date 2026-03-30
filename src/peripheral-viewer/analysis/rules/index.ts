import { PeripheralAnalysisRuntime } from '../runtime';
import { registerSf32lb52xAnalyzers } from './sf32lb52x';
import { registerSf32lb56xAnalyzers } from './sf32lb56x';

export function registerBuiltInPeripheralAnalyzers(runtime: PeripheralAnalysisRuntime): void {
  registerSf32lb52xAnalyzers(runtime);
  registerSf32lb56xAnalyzers(runtime);
}
