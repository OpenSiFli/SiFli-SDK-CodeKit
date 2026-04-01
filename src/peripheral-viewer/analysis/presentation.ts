import * as vscode from 'vscode';
import {
  AnalysisBucketId,
  AnalysisBucketPresentation,
  AnalysisFilterState,
  AnalysisFinding,
  AnalysisFindingPresentation,
  AnalysisGroupPresentation,
  AnalysisInstancePresentation,
  AnalysisPresentationSnapshot,
  AnalysisSessionState,
  AnalysisSeverity,
  AnalysisSummary,
  AnalysisViewMode,
} from './types';

export const ANALYSIS_FILTER_EMPTY_MESSAGE = 'No peripheral analysis results match the current filters.';

interface AnalysisCountShape {
  errorCount: number;
  warningCount: number;
  issueCount: number;
  cleanCount: number;
  notAnalyzedCount: number;
}

const EMPTY_COUNTS: AnalysisCountShape = {
  errorCount: 0,
  warningCount: 0,
  issueCount: 0,
  cleanCount: 0,
  notAnalyzedCount: 0,
};

function cloneEmptyCounts(): AnalysisCountShape {
  return { ...EMPTY_COUNTS };
}

function addCounts(target: AnalysisCountShape, source: AnalysisCountShape): void {
  target.errorCount += source.errorCount;
  target.warningCount += source.warningCount;
  target.issueCount += source.issueCount;
  target.cleanCount += source.cleanCount;
  target.notAnalyzedCount += source.notAnalyzedCount;
}

function countsForFindings(findings: AnalysisFindingPresentation[]): AnalysisCountShape {
  const counts = cloneEmptyCounts();
  counts.issueCount = findings.length;
  for (const finding of findings) {
    if (finding.severity === AnalysisSeverity.Error) {
      counts.errorCount += 1;
    } else if (finding.severity === AnalysisSeverity.Warning) {
      counts.warningCount += 1;
    }
  }
  return counts;
}

function createFindingId(
  sessionId: string,
  groupName: string,
  peripheralName: string,
  finding: AnalysisFinding,
  index: number
): string {
  return [
    sessionId,
    groupName,
    peripheralName,
    finding.severity,
    finding.relatedRegister ?? '',
    finding.message,
    String(index),
  ].join('::');
}

function createFindingPresentation(
  sessionId: string,
  groupName: string,
  peripheralName: string,
  finding: AnalysisFinding,
  index: number
): AnalysisFindingPresentation {
  return {
    ...finding,
    id: createFindingId(sessionId, groupName, peripheralName, finding, index),
    groupName,
    peripheralName,
  };
}

function createIssueInstancePresentation(
  sessionId: string,
  groupName: string,
  peripheralName: string,
  findings: AnalysisFinding[]
): AnalysisInstancePresentation | undefined {
  if (findings.length === 0) {
    return undefined;
  }

  const findingPresentations = findings.map((finding, index) =>
    createFindingPresentation(sessionId, groupName, peripheralName, finding, index)
  );
  const counts = countsForFindings(findingPresentations);

  return {
    id: `${groupName}::${peripheralName}`,
    peripheralName,
    groupName,
    status: 'issues',
    findings: findingPresentations,
    ...counts,
  };
}

function createIssueInstanceFromPresentations(
  groupName: string,
  peripheralName: string,
  findings: AnalysisFindingPresentation[]
): AnalysisInstancePresentation | undefined {
  if (findings.length === 0) {
    return undefined;
  }

  const counts = countsForFindings(findings);
  return {
    id: `${groupName}::${peripheralName}`,
    peripheralName,
    groupName,
    status: 'issues',
    findings,
    ...counts,
  };
}

function createStatusInstancePresentation(
  groupName: string,
  peripheralName: string,
  status: 'ok' | 'not-analyzed'
): AnalysisInstancePresentation {
  return {
    id: `${groupName}::${peripheralName}`,
    peripheralName,
    groupName,
    status,
    findings: [],
    errorCount: 0,
    warningCount: 0,
    issueCount: 0,
    cleanCount: status === 'ok' ? 1 : 0,
    notAnalyzedCount: status === 'not-analyzed' ? 1 : 0,
  };
}

function buildGroupPresentation(
  groupName: string,
  instances: AnalysisInstancePresentation[]
): AnalysisGroupPresentation {
  const counts = cloneEmptyCounts();
  for (const instance of instances) {
    addCounts(counts, instance);
  }

  return {
    id: groupName,
    groupName,
    instances,
    ...counts,
  };
}

function buildBucketPresentation(
  id: AnalysisBucketId,
  label: string,
  groups: AnalysisGroupPresentation[]
): AnalysisBucketPresentation | undefined {
  if (groups.length === 0) {
    return undefined;
  }

  const counts = cloneEmptyCounts();
  for (const group of groups) {
    addCounts(counts, group);
  }

  return {
    id,
    label,
    groups,
    ...counts,
  };
}

function filterIssueFindings(findings: AnalysisFinding[], filters: AnalysisFilterState): AnalysisFinding[] {
  if (filters.severity === 'all') {
    return findings;
  }

  return findings.filter(finding => finding.severity === filters.severity);
}

function createVisibleGroupPresentations(
  sessionState: AnalysisSessionState,
  filters: AnalysisFilterState
): AnalysisGroupPresentation[] {
  const selectedGroups = new Set(filters.groups);
  const groups: AnalysisGroupPresentation[] = [];

  for (const group of sessionState.groups) {
    if (selectedGroups.size > 0 && !selectedGroups.has(group.groupName)) {
      continue;
    }

    const instances: AnalysisInstancePresentation[] = [];
    for (const instance of group.instances) {
      if (instance.status === 'not-analyzed') {
        if (filters.status !== 'all' || filters.severity !== 'all') {
          continue;
        }

        instances.push(createStatusInstancePresentation(group.groupName, instance.peripheralName, 'not-analyzed'));
        continue;
      }

      if (instance.status === 'ok') {
        if (filters.status === 'issues' || filters.severity !== 'all') {
          continue;
        }

        instances.push(createStatusInstancePresentation(group.groupName, instance.peripheralName, 'ok'));
        continue;
      }

      if (filters.status === 'clean') {
        continue;
      }

      const visibleFindings = filterIssueFindings(instance.findings, filters);
      const issueInstance = createIssueInstancePresentation(
        sessionState.sessionId,
        group.groupName,
        instance.peripheralName,
        visibleFindings
      );
      if (issueInstance) {
        instances.push(issueInstance);
      }
    }

    if (instances.length > 0) {
      groups.push(buildGroupPresentation(group.groupName, instances));
    }
  }

  return groups;
}

function filterGroupByBucket(
  group: AnalysisGroupPresentation,
  bucketId: AnalysisBucketId
): AnalysisGroupPresentation | undefined {
  const instances: AnalysisInstancePresentation[] = [];

  for (const instance of group.instances) {
    if (bucketId === 'error') {
      const findings = instance.findings.filter(finding => finding.severity === AnalysisSeverity.Error);
      const issueInstance = createIssueInstanceFromPresentations(group.groupName, instance.peripheralName, findings);
      if (issueInstance) {
        instances.push(issueInstance);
      }
      continue;
    }

    if (bucketId === 'warning') {
      const findings = instance.findings.filter(finding => finding.severity === AnalysisSeverity.Warning);
      const issueInstance = createIssueInstanceFromPresentations(group.groupName, instance.peripheralName, findings);
      if (issueInstance) {
        instances.push(issueInstance);
      }
      continue;
    }

    if (bucketId === 'clean' && instance.status === 'ok') {
      instances.push(createStatusInstancePresentation(group.groupName, instance.peripheralName, 'ok'));
      continue;
    }

    if (bucketId === 'not-analyzed' && instance.status === 'not-analyzed') {
      instances.push(createStatusInstancePresentation(group.groupName, instance.peripheralName, 'not-analyzed'));
    }
  }

  return instances.length > 0 ? buildGroupPresentation(group.groupName, instances) : undefined;
}

function createBuckets(
  groups: AnalysisGroupPresentation[],
  filters: AnalysisFilterState
): AnalysisBucketPresentation[] {
  const buckets: AnalysisBucketPresentation[] = [];
  const definitions: Array<{ id: AnalysisBucketId; label: string; enabled: boolean }> = [
    {
      id: 'error',
      label: vscode.l10n.t('Errors'),
      enabled:
        filters.status !== 'clean' && (filters.severity === 'all' || filters.severity === AnalysisSeverity.Error),
    },
    {
      id: 'warning',
      label: vscode.l10n.t('Warnings'),
      enabled:
        filters.status !== 'clean' && (filters.severity === 'all' || filters.severity === AnalysisSeverity.Warning),
    },
    {
      id: 'clean',
      label: vscode.l10n.t('Clean'),
      enabled: filters.severity === 'all' && filters.status !== 'issues',
    },
    {
      id: 'not-analyzed',
      label: vscode.l10n.t('Not analyzed'),
      enabled: filters.severity === 'all' && filters.status === 'all',
    },
  ];

  for (const definition of definitions) {
    if (!definition.enabled) {
      continue;
    }

    const bucketGroups = groups
      .map(group => filterGroupByBucket(group, definition.id))
      .filter((group): group is AnalysisGroupPresentation => !!group);

    const bucket = buildBucketPresentation(definition.id, definition.label, bucketGroups);
    if (bucket) {
      buckets.push(bucket);
    }
  }

  return buckets;
}

function createSummary(
  sessionState: AnalysisSessionState | undefined,
  groups: AnalysisGroupPresentation[]
): AnalysisSummary {
  const summary: AnalysisSummary = {
    totalGroups: sessionState?.groups.length ?? 0,
    visibleGroups: groups.length,
    totalInstances: sessionState?.groups.reduce((count, group) => count + group.instances.length, 0) ?? 0,
    visibleInstances: groups.reduce((count, group) => count + group.instances.length, 0),
    errorCount: 0,
    warningCount: 0,
    issueCount: 0,
    cleanCount: 0,
    notAnalyzedCount: 0,
  };

  for (const group of groups) {
    summary.errorCount += group.errorCount;
    summary.warningCount += group.warningCount;
    summary.issueCount += group.issueCount;
    summary.cleanCount += group.cleanCount;
    summary.notAnalyzedCount += group.notAnalyzedCount;
  }

  return summary;
}

export function buildAnalysisPresentation(
  sessionState: AnalysisSessionState | undefined,
  viewMode: AnalysisViewMode,
  filters: AnalysisFilterState
): AnalysisPresentationSnapshot {
  const availableGroups = sessionState?.groups.map(group => group.groupName) ?? [];
  if (!sessionState) {
    return {
      hasActiveSession: false,
      viewMode,
      filters,
      availableGroups,
      summary: createSummary(undefined, []),
      groups: [],
      buckets: [],
      message: vscode.l10n.t('Peripheral analysis is available when a sifli-probe-rs debug session is active.'),
    };
  }

  if (sessionState.message) {
    return {
      hasActiveSession: true,
      sessionId: sessionState.sessionId,
      chipModel: sessionState.chipModel,
      deviceName: sessionState.deviceName,
      viewMode,
      filters,
      availableGroups,
      summary: createSummary(sessionState, []),
      groups: [],
      buckets: [],
      message: sessionState.message,
    };
  }

  const groups = createVisibleGroupPresentations(sessionState, filters);
  const buckets = createBuckets(groups, filters);
  const summary = createSummary(sessionState, groups);

  return {
    hasActiveSession: true,
    sessionId: sessionState.sessionId,
    chipModel: sessionState.chipModel,
    deviceName: sessionState.deviceName,
    viewMode,
    filters,
    availableGroups,
    summary,
    groups,
    buckets,
    message: groups.length === 0 ? vscode.l10n.t(ANALYSIS_FILTER_EMPTY_MESSAGE) : undefined,
  };
}
