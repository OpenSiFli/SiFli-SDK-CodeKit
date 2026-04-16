import { DebugSnapshotCandidateSource } from '../../types/debugSnapshot';

export interface DebugSnapshotTemplateMemoryItem {
  kind: 'memoryRegion';
  name: string;
  fileName: string;
  address: number;
  size: number;
  memoryKind: string;
  selectedByDefault: boolean;
  source: Exclude<DebugSnapshotCandidateSource, 'dynamicPsram' | 'svdExtra'>;
}

export interface DebugSnapshotTemplateRegisterItem {
  kind: 'registerBlock';
  name: string;
  fileName: string;
  blockName: string;
  selectedByDefault: boolean;
  source: Exclude<DebugSnapshotCandidateSource, 'dynamicPsram' | 'svdExtra'>;
  sourceType: 'fixedAddress' | 'svdPeripheral';
  address?: number;
  size?: number;
  peripheralName?: string;
}

export type DebugSnapshotTemplateItem = DebugSnapshotTemplateMemoryItem | DebugSnapshotTemplateRegisterItem;

export interface DebugSnapshotPartTemplate {
  items: DebugSnapshotTemplateItem[];
}

const PARTS_52X = ['SF32LB52BU36', 'SF32LB52BU56', 'SF32LB52DUB6', 'SF32LB52EUB6', 'SF32LB52GUC6', 'SF32LB52JUD6'];
const PARTS_52x = ['SF32LB520U36', 'SF32LB523UB6', 'SF32LB525UC6', 'SF32LB527UD6'];
const PARTS_56x = [
  'SF32LB560UNN26',
  'SF32LB561UBN26',
  'SF32LB563UCN26',
  'SF32LB56WUND26',
  'SF32LB565',
  'SF32LB566VCB36',
  'SF32LB567VND36',
];
const PARTS_58x = [
  'SF32LB580VNN36',
  'SF32LB581VCN36',
  'SF32LB583VCC36',
  'SF32LB585V5E56',
  'SF32LB586VDD36',
  'SF32LB587VEE56',
];

function fixedMemory(
  source: DebugSnapshotTemplateMemoryItem['source'],
  fileName: string,
  address: number,
  size: number,
  memoryKind: string
): DebugSnapshotTemplateMemoryItem {
  return {
    kind: 'memoryRegion',
    name: fileName,
    fileName,
    address,
    size,
    memoryKind,
    selectedByDefault: true,
    source,
  };
}

function fixedRegister(
  source: DebugSnapshotTemplateRegisterItem['source'],
  fileName: string,
  address: number,
  size: number,
  peripheralName?: string
): DebugSnapshotTemplateRegisterItem {
  return {
    kind: 'registerBlock',
    name: fileName,
    fileName,
    blockName: fileName.replace(/\.bin$/i, ''),
    selectedByDefault: true,
    source,
    sourceType: 'fixedAddress',
    address,
    size,
    peripheralName,
  };
}

function svdRegister(
  source: DebugSnapshotTemplateRegisterItem['source'],
  fileName: string,
  peripheralName: string
): DebugSnapshotTemplateRegisterItem {
  return {
    kind: 'registerBlock',
    name: fileName,
    fileName,
    blockName: fileName.replace(/\.bin$/i, ''),
    selectedByDefault: true,
    source,
    sourceType: 'svdPeripheral',
    peripheralName,
  };
}

function cloneTemplate(template: DebugSnapshotPartTemplate): DebugSnapshotPartTemplate {
  return {
    items: template.items.map(item => ({ ...item })),
  };
}

export class SnapshotTemplateRegistry {
  private readonly baseTemplate: DebugSnapshotPartTemplate = {
    items: [
      fixedRegister('baseTemplate', 'systick.bin', 0xe000e010, 0x10),
      fixedRegister('baseTemplate', 'scb.bin', 0xe000ed00, 0x278),
    ],
  };

  private readonly partTemplates = new Map<string, DebugSnapshotPartTemplate>();

  constructor() {
    const template52 = this.composeTemplate([
      fixedMemory('partTemplate', 'hcpu_ram.bin', 0x20000000, 0x80000, 'hcpuRam'),
      fixedMemory('partTemplate', 'lcpu_ram.bin', 0x20400000, 0x10000, 'lcpuRam'),
      svdRegister('partTemplate', 'hpsys_rcc.bin', 'HPSYS_RCC'),
      svdRegister('partTemplate', 'mpi1.bin', 'MPI1'),
      svdRegister('partTemplate', 'mpi2.bin', 'MPI2'),
      svdRegister('partTemplate', 'hpsys_aon.bin', 'HPSYS_AON'),
      svdRegister('partTemplate', 'pmu.bin', 'PMUC'),
      svdRegister('partTemplate', 'hpsys_cfg.bin', 'HPSYS_CFG'),
      svdRegister('partTemplate', 'lcdc_reg.bin', 'LCDC1'),
      svdRegister('partTemplate', 'epic_reg.bin', 'EPIC'),
      svdRegister('partTemplate', 'ezip_reg.bin', 'EZIP1'),
      svdRegister('partTemplate', 'lpsys_aon_reg.bin', 'LPSYS_AON'),
      svdRegister('partTemplate', 'mac.bin', 'MAC'),
      svdRegister('partTemplate', 'rf.bin', 'RF'),
      fixedRegister('partTemplate', 'rf_mem.bin', 0x40082000, 0x200),
      fixedRegister('partTemplate', 'phy.bin', 0x40084000, 0x1c0),
    ]);

    const template56 = this.composeTemplate([
      fixedMemory('partTemplate', 'hcpu_ram.bin', 0x20000000, 0xc8000, 'hcpuRam'),
      fixedMemory('partTemplate', 'lcpu_ram.bin', 0x20c00000, 0x20000, 'lcpuRam'),
      fixedMemory('partTemplate', 'lcpu_dtcm.bin', 0x203fc000, 0x4000, 'lcpuDtcm'),
      fixedMemory('partTemplate', 'lcpu_itcm.bin', 0x20bfc000, 0x4000, 'lcpuItcm'),
      svdRegister('partTemplate', 'hpsys_rcc.bin', 'HPSYS_RCC'),
      svdRegister('partTemplate', 'mpi1.bin', 'MPI1'),
      svdRegister('partTemplate', 'mpi2.bin', 'MPI2'),
      svdRegister('partTemplate', 'mpi3.bin', 'MPI3'),
      svdRegister('partTemplate', 'hpsys_aon.bin', 'HPSYS_AON'),
      svdRegister('partTemplate', 'pmu.bin', 'PMUC'),
      svdRegister('partTemplate', 'hpsys_cfg.bin', 'HPSYS_CFG'),
      svdRegister('partTemplate', 'lcdc_reg.bin', 'LCDC1'),
      svdRegister('partTemplate', 'epic_reg.bin', 'EPIC'),
      svdRegister('partTemplate', 'ezip_reg.bin', 'EZIP1'),
      svdRegister('partTemplate', 'lpsys_aon_reg.bin', 'LPSYS_AON'),
      svdRegister('partTemplate', 'mac.bin', 'MAC'),
      svdRegister('partTemplate', 'rf.bin', 'RF'),
    ]);

    const template58 = this.composeTemplate([
      fixedMemory('partTemplate', 'hcpu_ram.bin', 0x20000000, 0x280000, 'hcpuRam'),
      fixedMemory('partTemplate', 'ret_ram.bin', 0x00020000, 0x10000, 'retRam'),
      fixedMemory('partTemplate', 'hcpu_itcm.bin', 0x00010000, 0x10000, 'hcpuItcm'),
      fixedMemory('partTemplate', 'lcpu_ram.bin', 0x20c00000, 0x100000, 'lcpuRam'),
      fixedMemory('partTemplate', 'lcpu_dtcm.bin', 0x203fc000, 0x4000, 'lcpuDtcm'),
      fixedMemory('partTemplate', 'lcpu_itcm.bin', 0x20bfc000, 0x4000, 'lcpuItcm'),
      svdRegister('partTemplate', 'mpi1.bin', 'MPI1'),
      svdRegister('partTemplate', 'mpi2.bin', 'MPI2'),
      svdRegister('partTemplate', 'epic_reg.bin', 'EPIC'),
      svdRegister('partTemplate', 'dsi_host_reg.bin', 'DSI_HOST'),
      svdRegister('partTemplate', 'dsi_phy_reg.bin', 'DSI_PHY'),
      svdRegister('partTemplate', 'ezip_reg.bin', 'EZIP1'),
      svdRegister('partTemplate', 'lcdc_reg.bin', 'LCDC1'),
      svdRegister('partTemplate', 'gpio1_reg.bin', 'GPIO1'),
      svdRegister('partTemplate', 'gpio2_reg.bin', 'GPIO2'),
      svdRegister('partTemplate', 'pinmux1_reg.bin', 'PINMUX1'),
      svdRegister('partTemplate', 'pinmux2_reg.bin', 'PINMUX2'),
      svdRegister('partTemplate', 'hpsys_aon_reg.bin', 'HPSYS_AON'),
      svdRegister('partTemplate', 'lpsys_aon_reg.bin', 'LPSYS_AON'),
      svdRegister('partTemplate', 'rf.bin', 'RF'),
      svdRegister('partTemplate', 'mac.bin', 'MAC'),
    ]);

    this.registerMany(PARTS_52X, template52);
    this.registerMany(PARTS_52x, template52);
    this.registerMany(PARTS_56x, template56);
    this.registerMany(PARTS_58x, template58);
  }

  public getTemplate(partNumber: string): DebugSnapshotPartTemplate | undefined {
    const template = this.partTemplates.get(partNumber);
    return template ? cloneTemplate(template) : undefined;
  }

  private registerMany(partNumbers: readonly string[], template: DebugSnapshotPartTemplate): void {
    for (const partNumber of partNumbers) {
      this.partTemplates.set(partNumber, cloneTemplate(template));
    }
  }

  private composeTemplate(items: DebugSnapshotTemplateItem[]): DebugSnapshotPartTemplate {
    return {
      items: [...this.baseTemplate.items.map(item => ({ ...item })), ...items],
    };
  }
}
