import { PeripheralAnalysisRuntime } from '../runtime';
import {
  AnalysisFinding,
  AnalysisSeverity,
  PeripheralAnalysisContext,
  PeripheralGroupAnalyzer,
  PeripheralSnapshot,
  SupportedChipModel,
} from '../types';

export abstract class RuleBasedAnalyzer implements PeripheralGroupAnalyzer {
  private findings: AnalysisFinding[] = [];
  private currentPeripheralName = '';
  private currentContext?: PeripheralAnalysisContext;

  protected constructor(
    public readonly chipModel: SupportedChipModel,
    public readonly groupName: string
  ) {}

  public async analyze(peripheralName: string, context: PeripheralAnalysisContext): Promise<AnalysisFinding[]> {
    this.findings = [];
    this.currentPeripheralName = peripheralName;
    this.currentContext = context;
    await this.run();
    return this.findings;
  }

  protected abstract run(): Promise<void>;

  protected get peripheralName(): string {
    return this.currentPeripheralName;
  }

  protected get context(): PeripheralAnalysisContext {
    if (!this.currentContext) {
      throw new Error('Analyzer context is not initialized.');
    }
    return this.currentContext;
  }

  protected getInstanceNum(peripheralName = this.peripheralName, groupName = this.groupName): number {
    return this.context.getInstanceNum(peripheralName, groupName);
  }

  protected async readPeripheral(name: string): Promise<PeripheralSnapshot | undefined> {
    return this.context.readPeripheral(name);
  }

  protected async requirePeripheral(name: string): Promise<PeripheralSnapshot | undefined> {
    const peripheral = await this.readPeripheral(name);
    if (!peripheral) {
      this.error(`无法读取 ${name} 的寄存器快照`);
    }
    return peripheral;
  }

  protected warn(message: string, suggestion?: string, relatedRegister?: string): void {
    this.findings.push({
      severity: AnalysisSeverity.Warning,
      message,
      suggestion,
      relatedPeripheral: this.peripheralName,
      relatedRegister,
    });
  }

  protected error(message: string, suggestion?: string, relatedRegister?: string): void {
    this.findings.push({
      severity: AnalysisSeverity.Error,
      message,
      suggestion,
      relatedPeripheral: this.peripheralName,
      relatedRegister,
    });
  }
}

export function registerAnalyzers(runtime: PeripheralAnalysisRuntime, analyzers: PeripheralGroupAnalyzer[]): void {
  for (const analyzer of analyzers) {
    runtime.register(analyzer);
  }
}
