import * as vscode from 'vscode';
import { WorkflowStep, WorkflowStepType } from '../types';

export function getWorkflowStepTypeLabel(type: WorkflowStepType): string {
  switch (type) {
    case 'build.compile':
      return vscode.l10n.t('Build (Compile)');
    case 'build.rebuild':
      return vscode.l10n.t('Rebuild');
    case 'build.clean':
      return vscode.l10n.t('Clean');
    case 'build.download':
      return vscode.l10n.t('Download');
    case 'build.menuconfig':
      return vscode.l10n.t('Menuconfig');
    case 'shell.command':
      return vscode.l10n.t('Shell Command');
    case 'monitor.open':
      return vscode.l10n.t('Open Serial Monitor');
    case 'monitor.close':
      return vscode.l10n.t('Close Serial Monitor');
    case 'serial.selectPort':
      return vscode.l10n.t('Select Serial Port');
    default:
      return type;
  }
}

export function getWorkflowStepDisplayLabel(step: WorkflowStep): string {
  const typeLabel = getWorkflowStepTypeLabel(step.type);
  const alias = step.name?.trim();
  return alias ? `${alias} (${typeLabel})` : typeLabel;
}
