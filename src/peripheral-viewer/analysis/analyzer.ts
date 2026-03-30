import { AnalysisContext, AnalysisResult } from './types';

export interface ISvdAnalyzer {
  readonly name: string;
  analyze(context: AnalysisContext): Promise<AnalysisResult[]>;
}

export class SvdAnalyzerRegistry {
  private analyzers: ISvdAnalyzer[] = [];

  public register(analyzer: ISvdAnalyzer): void {
    this.analyzers.push(analyzer);
  }

  public unregister(name: string): void {
    this.analyzers = this.analyzers.filter(analyzer => analyzer.name !== name);
  }

  public async runAll(context: AnalysisContext): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];

    for (const analyzer of this.analyzers) {
      try {
        const analyzerResults = await analyzer.analyze(context);
        results.push(...analyzerResults);
      } catch (error) {
        console.error(`Analyzer "${analyzer.name}" failed:`, error);
      }
    }

    return results;
  }
}
