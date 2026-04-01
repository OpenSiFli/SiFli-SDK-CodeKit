import { PeripheralAnalysisRuntime } from '../runtime';
import { PeripheralSnapshot } from '../types';
import { registerAnalyzers, RuleBasedAnalyzer } from './base';

const DMAC1_SELECT = [
  'MPI1',
  'MPI2',
  'NONE',
  'I2C4',
  'USART1_TX',
  'USART1_RX',
  'USART2_TX',
  'USART2_RX',
  'GPTIM1_UPDATE',
  'GPTIM1_TRIGGER',
  'GPTIM1_CC1',
  'GPTIM1_CC2',
  'GPTIM1_CC3',
  'GPTIM1_CC4',
  'BTIM1',
  'BTIM2',
  'ATIM1_UPDATE',
  'ATIM1_TRIGGER',
  'ATIM1_CC1',
  'ATIM1_CC2',
  'ATIM1_CC3',
  'ATIM1_CC4',
  'I2C1',
  'I2C2',
  'I2C3',
  'ATIM1_COM',
  'USART3_TX',
  'USART3_RX',
  'SPI1_TX',
  'SPI1_RX',
  'SPI2_TX',
  'SPI2_RX',
  'I2S1_TX',
  'I2S1_RX',
  'NONE',
  'NONE',
  'PDM1_L',
  'PDM1_R',
  'GPADC',
  'AUDADC_CH0',
  'AUDADC_CH1',
  'AUDDAC_CH0',
  'AUDDAC_CH1',
  'GPTIM2_UPDATE',
  'GPTIM2_TRIGGER',
  'GPTIM2_CC1',
  'AUDPRC_TX_OUT_CH1',
  'AUDPRC_TX_OUT_CH0',
  'AUDPRC_TX_CH3',
  'AUDPRC_TX_CH2',
  'AUDPRC_TX_CH1',
  'AUDPRC_TX_CH0',
  'AUDPRC_RX_CH1',
  'AUDPRC_RX_CH0',
  'GPTIM2_CC2',
  'GPTIM2_CC3',
  'GPTIM2_CC4',
  'SDMMC1',
  'NONE',
  'NONE',
  'NONE',
  'NONE',
  'NONE',
  'NONE',
] as const;

const DMAC2_SELECT = ['USART4_TX', 'USART4_RX', 'USART5_TX', 'USART5_RX', 'NONE', 'NONE', 'BTIM3', 'BTIM4'] as const;

const PERIPHERAL_DMA_TARGETS: Record<string, { target: 'src' | 'dst' | 'any'; addr: number }> = {
  MPI1: { target: 'dst', addr: 0x50041004 },
  MPI2: { target: 'dst', addr: 0x50042004 },
  I2C1: { target: 'any', addr: 0x5009c030 },
  I2C2: { target: 'any', addr: 0x5009d030 },
  I2C3: { target: 'any', addr: 0x5009e030 },
  I2C4: { target: 'any', addr: 0x5009f030 },
  USART1_TX: { target: 'dst', addr: 0x50084028 },
  USART1_RX: { target: 'src', addr: 0x50084024 },
  USART2_TX: { target: 'dst', addr: 0x50085028 },
  USART2_RX: { target: 'src', addr: 0x50085024 },
  USART3_TX: { target: 'dst', addr: 0x50086028 },
  USART3_RX: { target: 'src', addr: 0x50086024 },
  USART4_TX: { target: 'dst', addr: 0x40005028 },
  USART4_RX: { target: 'src', addr: 0x40005024 },
  USART5_TX: { target: 'dst', addr: 0x40006028 },
  USART5_RX: { target: 'src', addr: 0x40006024 },
  SPI1_TX: { target: 'dst', addr: 0x50095010 },
  SPI1_RX: { target: 'src', addr: 0x50095010 },
  SPI2_TX: { target: 'dst', addr: 0x50096010 },
  SPI2_RX: { target: 'src', addr: 0x50096010 },
  I2S1_TX: { target: 'dst', addr: 0x50009400 },
  I2S1_RX: { target: 'src', addr: 0x50009440 },
  PDM1_L: { target: 'src', addr: 0x5009a03c },
  PDM1_R: { target: 'src', addr: 0x5009a040 },
  SDMMC1: { target: 'any', addr: 0x50045200 },
};

const ADC_CHANNEL_PINS = [28, 29, 30, 31, 32, 33, 34];

const padIndex = (pin: number) => pin.toString().padStart(2, '0');
const padPa = (pinmux: any, pin: number) => pinmux?.[`PAD_PA${padIndex(pin)}`];
const padPb = (pinmux: any, pin: number) => pinmux?.[`PAD_PB${padIndex(pin)}`];

const computeDllClock = (dll: any): number => {
  if (!dll || dll.EN === 0) {
    return 0;
  }

  let clock = 24 * ((dll.STG ?? 0) + 1);
  if (dll.OUT_DIV2_EN) {
    clock /= 2;
  }
  return clock;
};

const getHpsysClocks = (hpsysRcc: any) => {
  const clkDll1 = computeDllClock(hpsysRcc?.DLL1CR);
  const clkDll2 = computeDllClock(hpsysRcc?.DLL2CR);
  let clkHpsys = 48;
  let invalid = false;

  if (hpsysRcc?.CSR?.SEL_SYS_LP) {
    invalid = true;
  } else if ((hpsysRcc?.CSR?.SEL_SYS ?? 0) < 2) {
    clkHpsys = 48;
  } else if (hpsysRcc?.CSR?.SEL_SYS === 2) {
    invalid = true;
  } else {
    clkHpsys = clkDll1;
  }

  if (invalid) {
    return {
      invalid,
      clkHpsys: 999,
      hclkHpsys: 999,
      pclkHpsys: 999,
      pclk2Hpsys: 999,
      clkDll1,
      clkDll2,
      clkPeriHpsys: 48,
    };
  }

  const hdiv = hpsysRcc?.CFGR?.HDIV ?? 1;
  const hclkHpsys = hdiv < 2 ? clkHpsys : clkHpsys / hdiv;
  const pclkHpsys = hclkHpsys / 2 ** (hpsysRcc?.CFGR?.PDIV1 ?? 0);
  const pclk2Hpsys = hclkHpsys / 2 ** (hpsysRcc?.CFGR?.PDIV2 ?? 0);

  return {
    invalid,
    clkHpsys,
    hclkHpsys,
    pclkHpsys,
    pclk2Hpsys,
    clkDll1,
    clkDll2,
    clkPeriHpsys: 48,
  };
};

const getLpsysClocks = (hpsysAon: any, lpsysRcc: any) => {
  if (!hpsysAon?.ISSR?.LP_ACTIVE) {
    return undefined;
  }

  const clkLpsys = 48;
  const hclkLpsys = clkLpsys / Math.max(1, lpsysRcc?.CFGR?.HDIV1 ?? 1);
  const pclkLpsys = hclkLpsys / 2 ** (lpsysRcc?.CFGR?.PDIV1 ?? 0);
  const pclk2Lpsys = hclkLpsys / 2 ** (lpsysRcc?.CFGR?.PDIV2 ?? 0);

  return {
    clkLpsys,
    hclkLpsys,
    pclkLpsys,
    pclk2Lpsys,
    clkPeriLpsys: 48,
  };
};

const findDmac1Mapping = (dmac1: any, index: number): number => {
  if (dmac1?.CSELR1?.C1S === index) {
    return 1;
  }
  if (dmac1?.CSELR1?.C2S === index) {
    return 2;
  }
  if (dmac1?.CSELR1?.C3S === index) {
    return 3;
  }
  if (dmac1?.CSELR1?.C4S === index) {
    return 4;
  }
  if (dmac1?.CSELR2?.C5S === index) {
    return 5;
  }
  if (dmac1?.CSELR2?.C6S === index) {
    return 6;
  }
  if (dmac1?.CSELR2?.C7S === index) {
    return 7;
  }
  if (dmac1?.CSELR2?.C8S === index) {
    return 8;
  }
  return 0;
};

abstract class Sf32lb52xAnalyzer extends RuleBasedAnalyzer {
  protected constructor(groupName: string) {
    super('SF32LB52X', groupName);
  }
}

class RccAnalyzer52 extends Sf32lb52xAnalyzer {
  constructor(groupName: 'HPSYS_RCC' | 'LPSYS_RCC') {
    super(groupName);
  }

  protected async run(): Promise<void> {
    if (this.groupName === 'HPSYS_RCC') {
      const hpsysRcc = await this.requirePeripheral('HPSYS_RCC');
      const hpsysCfg = await this.requirePeripheral('HPSYS_CFG');
      if (!hpsysRcc || !hpsysCfg) {
        return;
      }

      const clocks = getHpsysClocks(hpsysRcc);
      if (hpsysRcc.CSR?.SEL_SYS_LP) {
        this.error('The system clock was switched to clk_wdt unexpectedly', 'Set HPSYS_RCC.CSR.SEL_SYS_LP to 0');
      }
      if (hpsysRcc.CSR?.SEL_SYS === 2) {
        this.error(
          'The system clock was switched to source 2 unexpectedly',
          'Valid values of HPSYS_RCC.CSR.SEL_SYS are 0, 1, and 3'
        );
      }
      if (hpsysRcc.CSR?.SEL_SYS === 3 && hpsysCfg.SYSCR?.LDO_VSEL) {
        this.error(
          'clk_dll1 cannot be used in basic operating mode',
          'In basic operating mode, valid values of HPSYS_RCC.CSR.SEL_SYS are 0 and 1'
        );
      }
      if (clocks.clkHpsys !== 999) {
        if (hpsysCfg.SYSCR?.LDO_VSEL && clocks.clkHpsys > 48) {
          this.error(this.text('{0} {1} MHz exceeds the {2} MHz limit', 'clk_hpsys', clocks.clkHpsys, 48));
        } else if (clocks.clkHpsys > 240) {
          this.error(this.text('{0} {1} MHz exceeds the {2} MHz limit', 'clk_hpsys', clocks.clkHpsys, 240));
        }
      } else {
        this.error(this.text('Failed to read the {0} frequency', 'clk_hpsys'));
      }
      if (clocks.hclkHpsys !== 999) {
        if (hpsysCfg.SYSCR?.LDO_VSEL && clocks.hclkHpsys > 48) {
          this.error(this.text('{0} {1} MHz exceeds the {2} MHz limit', 'hclk_hpsys', clocks.hclkHpsys, 48));
        } else if (clocks.hclkHpsys > 240) {
          this.error(this.text('{0} {1} MHz exceeds the {2} MHz limit', 'hclk_hpsys', clocks.hclkHpsys, 240));
        }
      } else {
        this.error(this.text('Failed to read the {0} frequency', 'hclk_hpsys'));
      }
      if (clocks.pclkHpsys !== 999) {
        if (hpsysCfg.SYSCR?.LDO_VSEL && clocks.pclkHpsys > 48) {
          this.error(this.text('{0} {1} MHz exceeds the {2} MHz limit', 'pclk_hpsys', clocks.pclkHpsys, 48));
        } else if (clocks.pclkHpsys > 120) {
          this.error(this.text('{0} {1} MHz exceeds the {2} MHz limit', 'pclk_hpsys', clocks.pclkHpsys, 120));
        }
      } else {
        this.error(this.text('Failed to read the {0} frequency', 'pclk_hpsys'));
      }
      if (clocks.pclk2Hpsys !== 999) {
        if (hpsysCfg.SYSCR?.LDO_VSEL && clocks.pclk2Hpsys > 6) {
          this.error(this.text('{0} {1} MHz exceeds the {2} MHz limit', 'pclk2_hpsys', clocks.pclk2Hpsys, 6));
        } else if (clocks.pclk2Hpsys > 7.5) {
          this.error(this.text('{0} {1} MHz exceeds the {2} MHz limit', 'pclk2_hpsys', clocks.pclk2Hpsys, 7.5));
        }
      } else {
        this.error(this.text('Failed to read the {0} frequency', 'pclk2_hpsys'));
      }
      if (hpsysRcc.ENR2?.MPI1) {
        if (![0, 1, 2].includes(hpsysRcc.CSR?.SEL_MPI1 ?? -1)) {
          this.error(
            'MPI1 functional clock selection is incorrect',
            'Valid values of HPSYS_RCC.CSR.SEL_MPI1 are 0, 1, and 2'
          );
        } else if (hpsysRcc.CSR?.SEL_MPI1 === 1 && clocks.clkDll1 === 0) {
          this.warn('clk_dll1 is not enabled, so MPI1 cannot operate');
        } else if (hpsysRcc.CSR?.SEL_MPI1 === 2 && clocks.clkDll2 === 0) {
          this.warn('clk_dll2 is not enabled, so MPI1 cannot operate');
        }
      }
      if (hpsysRcc.ENR2?.MPI2) {
        if (![0, 1, 2].includes(hpsysRcc.CSR?.SEL_MPI2 ?? -1)) {
          this.error(
            'MPI2 functional clock selection is incorrect',
            'Valid values of HPSYS_RCC.CSR.SEL_MPI2 are 0, 1, and 2'
          );
        } else if (hpsysRcc.CSR?.SEL_MPI2 === 1 && clocks.clkDll1 === 0) {
          this.warn('clk_dll1 is not enabled, so MPI2 cannot operate');
        } else if (hpsysRcc.CSR?.SEL_MPI2 === 2 && clocks.clkDll2 === 0) {
          this.warn('clk_dll2 is not enabled, so MPI2 cannot operate');
        }
      }
      return;
    }

    const hpsysAon = await this.requirePeripheral('HPSYS_AON');
    const lpsysRcc = await this.requirePeripheral('LPSYS_RCC');
    const lpsysCfg = await this.requirePeripheral('LPSYS_CFG');
    if (!hpsysAon || !lpsysRcc || !lpsysCfg) {
      return;
    }
    if (!hpsysAon.ISSR?.LP_ACTIVE) {
      this.error(
        this.text('LPSYS is asleep, so {0} cannot be accessed', this.peripheralName),
        'Wake LPSYS before accessing LPSYS_RCC'
      );
      return;
    }
    if (lpsysRcc.CSR?.SEL_SYS_LP) {
      this.error('The system clock was switched to clk_wdt unexpectedly', 'Set LPSYS_RCC.CSR.SEL_SYS_LP to 0');
    }
    const clocks = getLpsysClocks(hpsysAon, lpsysRcc);
    if (!clocks) {
      this.error('LPSYS is asleep, so its clock tree cannot be read');
      return;
    }
    if (!lpsysCfg.SYSCR?.LDO_VSEL && clocks.hclkLpsys > 24) {
      this.error(this.text('{0} {1} MHz exceeds the {2} MHz limit', 'hclk_lpsys', clocks.hclkLpsys, 24));
    }
    if (!lpsysCfg.SYSCR?.LDO_VSEL && clocks.pclkLpsys > 24) {
      this.error(this.text('{0} {1} MHz exceeds the {2} MHz limit', 'pclk_lpsys', clocks.pclkLpsys, 24));
    }
    if (lpsysCfg.SYSCR?.LDO_VSEL && clocks.pclk2Lpsys > 6) {
      this.error(this.text('{0} {1} MHz exceeds the {2} MHz limit', 'pclk2_lpsys', clocks.pclk2Lpsys, 6));
    } else if (!lpsysCfg.SYSCR?.LDO_VSEL && clocks.pclk2Lpsys > 3) {
      this.error(this.text('{0} {1} MHz exceeds the {2} MHz limit', 'pclk2_lpsys', clocks.pclk2Lpsys, 3));
    }
  }
}

class TsenAnalyzer52 extends Sf32lb52xAnalyzer {
  constructor() {
    super('TSEN');
  }

  protected async run(): Promise<void> {
    const hpsysRcc = await this.requirePeripheral('HPSYS_RCC');
    const hpsysCfg = await this.requirePeripheral('HPSYS_CFG');
    const tsen = await this.requirePeripheral(this.peripheralName);
    if (!hpsysRcc || !hpsysCfg || !tsen) {
      return;
    }

    if (hpsysRcc.ENR2?.TSEN !== 1) {
      this.reportModuleClockDisabled('HPSYS_RCC.ENR2_TSEN');
    }
    if (hpsysRcc.RSTR2?.TSEN !== 0) {
      this.reportModuleResetAsserted('HPSYS_RCC.RSTR2_TSEN');
    }
    if (hpsysCfg.ANAU_CR?.EN_BG !== 1) {
      this.error('Bandgap is not enabled', 'Set HPSYS_CFG.ANAU_CR.EN_BG to 1 while TSEN is running');
    }
    if (tsen.TSEN_CTRL_REG?.ANAU_TSEN_EN !== 1) {
      this.error('TSEN is not enabled', 'Set TSEN.TSEN_CTRL_REG.ANAU_TSEN_EN to 1 while TSEN is running');
    }
    if (tsen.TSEN_CTRL_REG?.ANAU_TSEN_RSTB !== 1) {
      this.warn(
        'TSEN RSTB setting is incorrect',
        'When TSEN is running, toggle TSEN.TSEN_CTRL_REG.ANAU_TSEN_RSTB from 0 to 1 and leave it at 1'
      );
    }
    if (tsen.TSEN_CTRL_REG?.ANAU_TSEN_PU !== 1) {
      this.warn('TSEN PU setting is incorrect', 'TSEN.TSEN_CTRL_REG.ANAU_TSEN_PU must be 1 while TSEN is running');
    }
    if (tsen.TSEN_CTRL_REG?.ANAU_TSEN_RUN !== 1) {
      this.warn('TSEN RUN setting is incorrect', 'TSEN.TSEN_CTRL_REG.ANAU_TSEN_RUN must be 1 while TSEN is running');
    }

    const clocks = getHpsysClocks(hpsysRcc);
    const clkDiv = Math.max(1, tsen.TSEN_CTRL_REG?.ANAU_TSEN_CLK_DIV ?? 1);
    const tsenFreq = clocks.pclkHpsys / clkDiv;
    if (tsenFreq > 2) {
      this.error('TSEN clock frequency exceeds the 2 MHz limit');
    }
  }
}

class ExtdmaAnalyzer52 extends Sf32lb52xAnalyzer {
  constructor() {
    super('EXTDMA');
  }

  protected async run(): Promise<void> {
    const hpsysRcc = await this.requirePeripheral('HPSYS_RCC');
    const extdma = await this.requirePeripheral(this.peripheralName);
    if (!hpsysRcc || !extdma) {
      return;
    }
    if (hpsysRcc.ENR1?.EXTDMA !== 1) {
      this.reportModuleClockDisabled('HPSYS_RCC.ESR1_EXTDMA');
    }
    if (hpsysRcc.RSTR1?.EXTDMA !== 0) {
      this.reportModuleResetAsserted('HPSYS_RCC.RSTR1_EXTDMA');
    }
    if (extdma.CCR?.SRCSIZE !== 2) {
      this.error('The source data width is not 4 bytes', 'CCR.SRCSIZE must be 2');
    }
    if (extdma.CCR?.DSTSIZE !== 2) {
      this.error('The destination data width is not 4 bytes', 'CCR.DSTSIZE must be 2');
    }
    if ((extdma.SRCAR?.value ?? 0) !== 0 || (extdma.DSTAR?.value ?? 0) !== 0) {
      if ((extdma.SRCAR?.value ?? 0) & 3) {
        this.error(
          this.text(
            'Source address 0x{0} is not 4-byte aligned',
            (extdma.SRCAR?.value ?? 0).toString(16).padStart(8, '0')
          ),
          'The source address must be 4-byte aligned'
        );
      }
      if ((extdma.DSTAR?.value ?? 0) & 3) {
        this.error(
          this.text(
            'Destination address 0x{0} is not 4-byte aligned',
            (extdma.DSTAR?.value ?? 0).toString(16).padStart(8, '0')
          ),
          'The destination address must be 4-byte aligned'
        );
      }
      if (this.isIllegalExtdmaAddress(extdma.SRCAR?.value ?? 0)) {
        this.error(
          this.text(
            'Source address 0x{0} is in an address range that {1} cannot access',
            (extdma.SRCAR?.value ?? 0).toString(16).padStart(8, '0'),
            this.peripheralName
          ),
          'Check the configured addresses'
        );
      }
      if (this.isIllegalExtdmaAddress(extdma.DSTAR?.value ?? 0)) {
        this.error(
          this.text(
            'Destination address 0x{0} is in an address range that {1} cannot access',
            (extdma.DSTAR?.value ?? 0).toString(16).padStart(8, '0'),
            this.peripheralName
          ),
          'Check the configured addresses'
        );
      }
      if ((extdma.CCR?.TCIE ?? 0) === 0 && (extdma.CCR?.HTIE ?? 0) === 0) {
        this.warn(
          'Neither the transfer-complete interrupt (TCIE) nor the half-transfer interrupt (HTIE) is enabled',
          'Set TCIE or HTIE to 1 to enable interrupts'
        );
      }
    }
  }

  private isIllegalExtdmaAddress(addr: number): boolean {
    if (addr >= 0x20000000 && addr < 0x20080000) {
      return false;
    }
    if (addr >= 0x60000000 && addr < 0xa0000000) {
      return false;
    }
    if (addr >= 0x20400000 && addr < 0x20410000) {
      return false;
    }
    if (addr >= 0x40000000 && addr < 0x400d0000) {
      return false;
    }
    return true;
  }
}

class BtimAnalyzer52 extends Sf32lb52xAnalyzer {
  constructor() {
    super('BTIM');
  }

  protected async run(): Promise<void> {
    const instNum = this.getInstanceNum();
    const hpsysRcc = await this.requirePeripheral('HPSYS_RCC');
    if (!hpsysRcc) {
      return;
    }

    if (instNum === 1) {
      if (hpsysRcc.ENR1?.BTIM1 !== 1) {
        this.reportModuleClockDisabled('HPSYS_RCC.ESR1_BTIM1');
      }
      if (hpsysRcc.RSTR1?.BTIM1 !== 0) {
        this.reportModuleResetAsserted('HPSYS_RCC.RSTR1_BTIM1');
      }
      return;
    }
    if (instNum === 2) {
      if (hpsysRcc.ENR1?.BTIM2 !== 1) {
        this.reportModuleClockDisabled('HPSYS_RCC.ESR1_BTIM2');
      }
      if (hpsysRcc.RSTR1?.BTIM2 !== 0) {
        this.reportModuleResetAsserted('HPSYS_RCC.RSTR1_BTIM2');
      }
      return;
    }

    const hpsysAon = await this.requirePeripheral('HPSYS_AON');
    const lpsysRcc = await this.requirePeripheral('LPSYS_RCC');
    if (!hpsysAon || !lpsysRcc) {
      return;
    }
    if (!hpsysAon.ISSR?.LP_ACTIVE) {
      this.error(
        this.text('LPSYS is asleep, so {0} cannot be accessed', this.peripheralName),
        this.text('Wake LPSYS before accessing {0}', this.peripheralName)
      );
      return;
    }
    if (instNum === 3) {
      if (lpsysRcc.ENR1?.BTIM3 !== 1) {
        this.reportModuleClockDisabled('LPSYS_RCC.ESR1_BTIM3');
      }
      if (lpsysRcc.RSTR1?.BTIM3 !== 0) {
        this.reportModuleResetAsserted('LPSYS_RCC.RSTR1_BTIM3');
      }
    } else if (instNum === 4) {
      if (lpsysRcc.ENR1?.BTIM4 !== 1) {
        this.reportModuleClockDisabled('LPSYS_RCC.ESR1_BTIM4');
      }
      if (lpsysRcc.RSTR1?.BTIM4 !== 0) {
        this.reportModuleResetAsserted('LPSYS_RCC.RSTR1_BTIM4');
      }
    }
  }
}

class PdmAnalyzer52 extends Sf32lb52xAnalyzer {
  constructor() {
    super('PDM');
  }

  protected async run(): Promise<void> {
    const hpsysRcc = await this.requirePeripheral('HPSYS_RCC');
    const hpsysPinmux = await this.requirePeripheral('HPSYS_PINMUX');
    if (!hpsysRcc || !hpsysPinmux) {
      return;
    }
    if (hpsysRcc.ENR1?.PDM1 !== 1) {
      this.reportModuleClockDisabled('HPSYS_RCC.ESR1_PDM1');
    }
    if (hpsysRcc.RSTR1?.PDM1 !== 0) {
      this.reportModuleResetAsserted('HPSYS_RCC.RSTR1_PDM1');
    }

    const clkPin = this.findPinByFsel(hpsysPinmux, [7, 22], 3);
    if (clkPin === undefined) {
      this.error('No IO assignment was found for CLK', 'Available IOs: PA7,PA22');
    } else if (padPa(hpsysPinmux, clkPin)?.PE === 1) {
      this.warn(
        this.text('{0} {1} has an internal pull resistor enabled, which may cause leakage', 'CLK', formatPa(clkPin)),
        this.text('Set HPSYS_PINMUX->PAD_{0}.PE to 0 to disable the internal pull resistor', formatPa(clkPin))
      );
    }

    const dataPin = this.findPinByFsel(hpsysPinmux, [8, 23], 3);
    if (dataPin === undefined) {
      this.warn('No IO assignment was found for DATA', 'Available IOs: PA8,PA23');
    } else {
      if (padPa(hpsysPinmux, dataPin)?.IE !== 1) {
        this.error(
          this.text('{0} {1} input is not enabled', 'DATA', formatPa(dataPin)),
          this.text('Set HPSYS_PINMUX->PAD_{0}.IE to 1', formatPa(dataPin))
        );
      }
      if (padPa(hpsysPinmux, dataPin)?.PE === 1) {
        this.warn(
          this.text(
            '{0} {1} has an internal pull resistor enabled, which may cause leakage',
            'DATA',
            formatPa(dataPin)
          ),
          this.text('Set HPSYS_PINMUX->PAD_{0}.PE to 0 to disable the internal pull resistor', formatPa(dataPin))
        );
      }
    }
  }

  private findPinByFsel(pinmux: any, candidates: number[], expectedFsel: number): number | undefined {
    return candidates.find(pin => padPa(pinmux, pin)?.FSEL === expectedFsel);
  }
}

class GpadcAnalyzer52 extends Sf32lb52xAnalyzer {
  constructor() {
    super('GPADC');
  }

  protected async run(): Promise<void> {
    const hpsysRcc = await this.requirePeripheral('HPSYS_RCC');
    const hpsysCfg = await this.requirePeripheral('HPSYS_CFG');
    const hpsysPinmux = await this.requirePeripheral('HPSYS_PINMUX');
    const gpadc = await this.requirePeripheral(this.peripheralName);
    if (!hpsysRcc || !hpsysCfg || !hpsysPinmux || !gpadc) {
      return;
    }
    if (hpsysRcc.ENR2?.GPADC !== 1) {
      this.reportModuleClockDisabled('HPSYS_RCC.ENR2_GPADC');
    }
    if (hpsysRcc.RSTR2?.GPADC !== 0) {
      this.reportModuleResetAsserted('HPSYS_RCC.RSTR2_GPADC');
    }

    for (let slotNum = 0; slotNum < 8; slotNum += 1) {
      const slot = gpadc[`ADC_SLOT${slotNum}_REG`];
      if (!slot?.SLOT_EN) {
        continue;
      }
      const psel = slot.PCHNL_SEL;
      if (psel !== 7) {
        const pin = ADC_CHANNEL_PINS[psel];
        if (pin === undefined) {
          continue;
        }
        if (padPa(hpsysPinmux, pin)?.FSEL !== 7) {
          this.error(
            'ADC CH is configured for the wrong function; GPADC is not selected',
            this.text('Set HPSYS_PINMUX->PAD_{0}.FSEL to {1}', formatPa(pin), 7)
          );
        }
        if (padPa(hpsysPinmux, pin)?.PE === 1) {
          this.error(
            'Internal pull resistors are enabled on ADC CHANNEL, which can break measurements',
            this.text('Set HPSYS_PINMUX->PAD_{0}.PE to 0 to disable the internal pull resistor', formatPa(pin))
          );
        }
      }
    }

    if (hpsysCfg.ANAU_CR?.EN_BG !== 1) {
      this.error('Bandgap is not enabled', 'Set HPSYS_CFG.ANAU_CR.EN_BG to 1 while GPADC is running');
    }
    if (gpadc.ADC_CFG_REG1?.ANAU_GPADC_LDOREF_EN !== 1) {
      this.warn(
        'GPADC reference voltage is not enabled',
        'Set PADC.ADC_CFG_REG1.ANAU_GPADC_LDOREF_EN to 1 while GPADC is running'
      );
    }
    if (gpadc.ADC_CFG_REG1?.ANAU_GPADC_MUTE === 1) {
      this.error('MUTE mode is enabled', 'Set GPADC.ADC_CFG_REG1.ANAU_GPADC_MUTE to 0 while GPADC is running');
    }
    if (gpadc.ADC_CFG_REG1?.ANAU_GPADC_P_INT_EN === 1) {
      this.error(
        'P_INT_EN is configured incorrectly',
        'Set GPADC.ADC_CFG_REG1.ANAU_GPADC_P_INT_EN to 0 while GPADC is running'
      );
    }
    if (gpadc.ADC_CFG_REG1?.ANAU_GPADC_SE !== 1) {
      this.warn('GPADC is configured for differential input mode');
    }

    const clocks = getHpsysClocks(hpsysRcc);
    const convWidth = gpadc.ADC_CTRL_REG2?.CONV_WIDTH ?? 0;
    const sampWidth = gpadc.ADC_CTRL_REG2?.SAMP_WIDTH ?? 0;
    const dataDly = gpadc.ADC_CTRL_REG?.DATA_SAMP_DLY ?? 0;
    const gpadcFreq = (clocks.pclkHpsys / Math.max(1, convWidth + sampWidth + dataDly + 2)) * 1000;
    if (gpadcFreq > 4000) {
      this.error('The sampling frequency exceeds the 4 MHz maximum', 'Reconfigure the sampling frequency');
    }

    if ((gpadc.ADC_CTRL_REG?.DMA_EN ?? 0) === 1 && (gpadc.ADC_CTRL_REG?.ADC_OP_MODE ?? 0) === 0) {
      this.warn(
        'GPADC DMA is enabled while GPADC is still in single-sample mode',
        'If DMA is used to fetch samples, GPADC should run in continuous conversion mode with ADC_OP_MODE = 1'
      );
      if ((gpadc.ADC_CTRL_REG?.DMA_DATA_SEL ?? 0) === 1) {
        this.error('DMA data source selection is incorrect', 'Set DMA_DATA_SEL to 0 for normal operation');
      }
    }
  }
}

class I2sAnalyzer52 extends Sf32lb52xAnalyzer {
  constructor() {
    super('I2S');
  }

  protected async run(): Promise<void> {
    const instNum = this.getInstanceNum();
    const hpsysRcc = await this.requirePeripheral('HPSYS_RCC');
    const hpsysPinmux = await this.requirePeripheral('HPSYS_PINMUX');
    if (!hpsysRcc || !hpsysPinmux) {
      return;
    }
    if (instNum !== 1) {
      return;
    }
    if (hpsysRcc.ENR1?.I2S1 !== 1) {
      this.reportModuleClockDisabled('HPSYS_RCC.ESR1_I2S1');
    }
    if (hpsysRcc.RSTR1?.I2S1 !== 0) {
      this.reportModuleResetAsserted('HPSYS_RCC.RSTR1_I2S1');
    }

    this.checkMappedI2sPin(hpsysPinmux, 'BCK', [5, 29], true, false);
    this.checkMappedI2sPin(hpsysPinmux, 'LRCK', [6, 30], true, false);
    this.checkMappedI2sPin(hpsysPinmux, 'SDO', [3, 25], false, false);
    this.checkMappedI2sPin(hpsysPinmux, 'SDI', [4, 28], false, true);
    this.checkMappedI2sPin(hpsysPinmux, 'MCLK', [2, 24], false, false);
  }

  private checkMappedI2sPin(
    pinmux: any,
    label: string,
    candidates: number[],
    required: boolean,
    requiresInput: boolean
  ): void {
    const pin = candidates.find(candidate => padPa(pinmux, candidate)?.FSEL === 3);
    if (pin === undefined) {
      if (required) {
        this.error(
          this.text('No IO assignment was found for {0}', label),
          this.text('Available IOs: PA{0}', candidates.join(',PA'))
        );
      } else {
        this.warn(
          this.text('No IO assignment was found for {0}', label),
          this.text('Available IOs: PA{0}', candidates.join(',PA'))
        );
      }
      return;
    }
    if (requiresInput && padPa(pinmux, pin)?.IE !== 1) {
      this.error(
        this.text('{0} {1} input is not enabled', label, formatPa(pin)),
        this.text('Set HPSYS_PINMUX->PAD_{0}.IE to 1', formatPa(pin))
      );
    }
    if (padPa(pinmux, pin)?.PE === 1) {
      this.warn(
        this.text('{0} {1} has an internal pull resistor enabled, which may cause leakage', label, formatPa(pin)),
        this.text('Set HPSYS_PINMUX->PAD_{0}.PE to 0 to disable the internal pull resistor', formatPa(pin))
      );
    }
  }
}

class SpiAnalyzer52 extends Sf32lb52xAnalyzer {
  constructor() {
    super('SPI');
  }

  protected async run(): Promise<void> {
    const instNum = this.getInstanceNum();
    const hpsysRcc = await this.requirePeripheral('HPSYS_RCC');
    const hpsysPinmux = await this.requirePeripheral('HPSYS_PINMUX');
    const spi = await this.requirePeripheral(this.peripheralName);
    if (!hpsysRcc || !hpsysPinmux || !spi) {
      return;
    }

    let clkPin = 28;
    let csPin = 29;
    let dioPin = 24;
    let diPin = 25;
    if (instNum === 1) {
      if (hpsysRcc.ENR1?.SPI1 !== 1) {
        this.reportModuleClockDisabled('HPSYS_RCC.ESR1_SPI1');
      }
      if (hpsysRcc.RSTR1?.SPI1 !== 0) {
        this.reportModuleResetAsserted('HPSYS_RCC.RSTR1_SPI1');
      }
    } else if (instNum === 2) {
      if (hpsysRcc.ENR1?.SPI2 !== 1) {
        this.reportModuleClockDisabled('HPSYS_RCC.ESR1_SPI2');
      }
      if (hpsysRcc.RSTR1?.SPI2 !== 0) {
        this.reportModuleResetAsserted('HPSYS_RCC.RSTR1_SPI2');
      }
      clkPin = 39;
      csPin = 40;
      dioPin = 37;
      diPin = 38;
    }

    if (padPa(hpsysPinmux, clkPin)?.FSEL !== 2) {
      this.error(
        this.text('{0} {1} is configured for the wrong function; {2} is not selected', 'CLK', formatPa(clkPin), 'SPI'),
        this.text('Set HPSYS_PINMUX->PAD_{0}.FSEL to {1}', formatPa(clkPin), 2)
      );
    }
    if (padPa(hpsysPinmux, clkPin)?.PE === 1) {
      this.warn(
        this.text('{0} {1} has an internal pull resistor enabled, which may cause leakage', 'CLK', formatPa(clkPin)),
        this.text('Set HPSYS_PINMUX->PAD_{0}.PE to 0 to disable the internal pull resistor', formatPa(clkPin))
      );
    }
    if (padPa(hpsysPinmux, csPin)?.FSEL !== 2) {
      this.error(
        this.text('{0} {1} is configured for the wrong function; {2} is not selected', 'CS', formatPa(csPin), 'SPI'),
        this.text('Set HPSYS_PINMUX->PAD_{0}.FSEL to {1}', formatPa(csPin), 2)
      );
    }
    if (padPa(hpsysPinmux, csPin)?.PE === 1 && padPa(hpsysPinmux, csPin)?.PS === 0) {
      this.error(
        this.text('{0} {1} has the internal pull-down enabled, which can cause leakage', 'CS', formatPa(csPin)),
        this.text('Set HPSYS_PINMUX->PAD_{0}.PS to 1 to switch to an internal pull-up', formatPa(csPin))
      );
    }
    if (padPa(hpsysPinmux, dioPin)?.FSEL !== 2) {
      this.error(
        this.text('{0} {1} is configured for the wrong function; {2} is not selected', 'DIO', formatPa(dioPin), 'SPI'),
        this.text('Set HPSYS_PINMUX->PAD_{0}.FSEL to {1}', formatPa(dioPin), 2)
      );
    }
    if (padPa(hpsysPinmux, dioPin)?.IE !== 1 && spi.TRIWIRE_CTRL?.SPI_TRI_WIRE_EN === 1) {
      this.warn(
        this.text('{0} {1} input is not enabled', 'DIO', formatPa(dioPin)),
        this.text('Enable DIO input in three-wire SPI mode by setting HPSYS_PINMUX->PAD_{0}.IE to 1', formatPa(dioPin))
      );
    }
    if (padPa(hpsysPinmux, diPin)?.FSEL !== 2) {
      this.warn(
        this.text('{0} {1} does not select the {2} function', 'DI', formatPa(diPin), 'SPI'),
        this.text('In four-wire SPI mode, set HPSYS_PINMUX->PAD_{0}.FSEL to {1}', formatPa(diPin), 2)
      );
    }
    if (padPa(hpsysPinmux, diPin)?.IE !== 1 && spi.TRIWIRE_CTRL?.SPI_TRI_WIRE_EN === 1) {
      this.warn(
        this.text('{0} {1} input is not enabled', 'DI', formatPa(diPin)),
        this.text('Enable DI input in four-wire SPI mode by setting HPSYS_PINMUX->PAD_{0}.IE to 1', formatPa(diPin))
      );
    }

    if (spi.TOP_CTRL?.SSE !== 1) {
      this.error('SSE is configured incorrectly; SPI is not enabled', 'Set SSE to 1 for normal operation');
    }
    if (spi.TOP_CTRL?.FRF === 3) {
      this.error(
        'SPI protocol selection is invalid; FRF is configured as RSVD',
        'Set FRF to 0, 1, or 2 for normal operation'
      );
    }
    if (spi.CLK_CTRL?.CLK_SSP_EN !== 1) {
      this.error(
        'SPI clock configuration is incorrect; the clock is not enabled',
        'Set CLK_SSP_EN to 1 for normal operation'
      );
    }
    if (spi.TRIWIRE_CTRL?.SPI_TRI_WIRE_EN === 1 && spi.CLK_CTRL?.SPI_DI_SEL !== 1) {
      this.error('SPI three-wire configuration is incorrect', 'Set SPI_DI_SEL to 1 in three-wire mode');
    }
    if (spi.STATUS?.ROR === 1) {
      this.error('RXFIFO overflow occurred', 'Check the RXFIFO read flow');
    }
    if (spi.STATUS?.TUR === 1) {
      this.error('TXFIFO underflow occurred', 'Check the TXFIFO write flow');
    }
  }
}

class UsartAnalyzer52 extends Sf32lb52xAnalyzer {
  constructor() {
    super('USART');
  }

  protected async run(): Promise<void> {
    const instNum = this.getInstanceNum();
    const hpsysRcc = await this.requirePeripheral('HPSYS_RCC');
    const hpsysCfg = await this.requirePeripheral('HPSYS_CFG');
    if (!hpsysRcc || !hpsysCfg) {
      return;
    }

    let ctsPin = 0;
    let rtsPin = 0;
    let rxdPin = 0;
    let txdPin = 0;
    let hpsysPins = true;
    let noAssignValue = 0x3f;
    let maxPin = 44;

    if (instNum === 1) {
      if (hpsysRcc.RSTR1?.USART1 !== 0) {
        this.reportModuleResetAsserted('HPSYS_RCC.RSTR1_USART1');
      }
      ctsPin = hpsysCfg.USART1_PINR?.CTS_PIN;
      rtsPin = hpsysCfg.USART1_PINR?.RTS_PIN;
      rxdPin = hpsysCfg.USART1_PINR?.RXD_PIN;
      txdPin = hpsysCfg.USART1_PINR?.TXD_PIN;
    } else if (instNum === 2) {
      if (hpsysRcc.ENR1?.USART2 !== 1) {
        this.reportModuleClockDisabled('HPSYS_RCC.ESR1_USART2');
      }
      if (hpsysRcc.RSTR1?.USART2 !== 0) {
        this.reportModuleResetAsserted('HPSYS_RCC.RSTR1_USART2');
      }
      ctsPin = hpsysCfg.USART2_PINR?.CTS_PIN;
      rtsPin = hpsysCfg.USART2_PINR?.RTS_PIN;
      rxdPin = hpsysCfg.USART2_PINR?.RXD_PIN;
      txdPin = hpsysCfg.USART2_PINR?.TXD_PIN;
    } else if (instNum === 3) {
      if (hpsysRcc.ENR2?.USART3 !== 1) {
        this.reportModuleClockDisabled('HPSYS_RCC.ESR2_USART3');
      }
      if (hpsysRcc.RSTR2?.USART3 !== 0) {
        this.reportModuleResetAsserted('HPSYS_RCC.RSTR2_USART3');
      }
      ctsPin = hpsysCfg.USART3_PINR?.CTS_PIN;
      rtsPin = hpsysCfg.USART3_PINR?.RTS_PIN;
      rxdPin = hpsysCfg.USART3_PINR?.RXD_PIN;
      txdPin = hpsysCfg.USART3_PINR?.TXD_PIN;
    } else {
      const hpsysAon = await this.requirePeripheral('HPSYS_AON');
      const lpsysRcc = await this.requirePeripheral('LPSYS_RCC');
      const lpsysCfg = await this.requirePeripheral('LPSYS_CFG');
      if (!hpsysAon || !lpsysRcc || !lpsysCfg) {
        return;
      }
      if (!hpsysAon.ISSR?.LP_ACTIVE) {
        this.error(
          this.text('LPSYS is asleep, so {0} cannot be accessed', this.peripheralName),
          this.text('Wake LPSYS before accessing {0}', this.peripheralName)
        );
        return;
      }
      hpsysPins = false;
      noAssignValue = 7;
      maxPin = 3;
      if (instNum === 4) {
        if (lpsysRcc.ENR1?.USART4 !== 1) {
          this.reportModuleClockDisabled('LPSYS_RCC.ESR1_USART4');
        }
        if (lpsysRcc.RSTR1?.USART4 !== 0) {
          this.reportModuleResetAsserted('LPSYS_RCC.RSTR1_USART4');
        }
        ctsPin = lpsysCfg.USART4_PINR?.CTS_PIN;
        rtsPin = lpsysCfg.USART4_PINR?.RTS_PIN;
        rxdPin = lpsysCfg.USART4_PINR?.RXD_PIN;
        txdPin = lpsysCfg.USART4_PINR?.TXD_PIN;
      } else if (instNum === 5) {
        if (lpsysRcc.ENR1?.USART5 !== 1) {
          this.reportModuleClockDisabled('LPSYS_RCC.ESR1_USART5');
        }
        if (lpsysRcc.RSTR1?.USART5 !== 0) {
          this.reportModuleResetAsserted('LPSYS_RCC.RSTR1_USART5');
        }
        ctsPin = lpsysCfg.USART5_PINR?.CTS_PIN;
        rtsPin = lpsysCfg.USART5_PINR?.RTS_PIN;
        rxdPin = lpsysCfg.USART5_PINR?.RXD_PIN;
        txdPin = lpsysCfg.USART5_PINR?.TXD_PIN;
      }
    }

    this.checkUsartAssignedPin('CTS', ctsPin, noAssignValue, maxPin, hpsysPins);
    this.checkUsartAssignedPin('RTS', rtsPin, noAssignValue, maxPin, hpsysPins);
    this.checkUsartAssignedPin('RXD', rxdPin, noAssignValue, maxPin, hpsysPins, true);
    this.checkUsartAssignedPin('TXD', txdPin, noAssignValue, maxPin, hpsysPins, true);

    const pinmux = await this.requirePeripheral(hpsysPins ? 'HPSYS_PINMUX' : 'LPSYS_PINMUX');
    if (!pinmux) {
      return;
    }

    this.checkUsartPinmux('CTS', ctsPin, hpsysPins, pinmux, true, false, true);
    this.checkUsartPinmux('RTS', rtsPin, hpsysPins, pinmux, true, false, true);
    this.checkUsartPinmux('RXD', rxdPin, hpsysPins, pinmux, true, true, false);
    this.checkUsartPinmux('TXD', txdPin, hpsysPins, pinmux, true, false, false, true);
  }

  private checkUsartAssignedPin(
    label: string,
    pin: number,
    noAssignValue: number,
    maxPin: number,
    hpsysPins: boolean,
    warnOnMissing = false
  ): void {
    const prefix = hpsysPins ? 'PA' : 'PB';
    if (pin === noAssignValue) {
      if (warnOnMissing) {
        this.warn(
          this.text('No IO is assigned to {0}', label),
          this.text('Assign {0}_PINR.{1}_PIN to the required IO', this.peripheralName.toUpperCase(), label)
        );
      }
      return;
    }
    if (pin > maxPin) {
      this.error(
        this.text('Assigned pin {0}{1} for {2} does not exist', prefix, padIndex(pin), label),
        this.text('Available IOs: {0}00~{0}{1}', prefix, padIndex(maxPin))
      );
    }
  }

  private checkUsartPinmux(
    label: string,
    pin: number,
    hpsysPins: boolean,
    pinmux: any,
    checkFsel: boolean,
    checkIe: boolean,
    warnPullUp: boolean,
    errorPullDown = false
  ): void {
    const maxPin = hpsysPins ? 44 : 3;
    const noneValue = hpsysPins ? 0x3f : 7;
    if (pin > maxPin || pin === noneValue) {
      return;
    }
    const pad = hpsysPins ? padPa(pinmux, pin) : padPb(pinmux, pin);
    const prefix = hpsysPins ? 'PA' : 'PB';
    const expectedFsel = hpsysPins ? 4 : 1;
    if (checkFsel && pad?.FSEL !== expectedFsel) {
      this.error(
        this.text(
          '{0} {1}{2} is configured for the wrong function; {3} is not selected',
          label,
          prefix,
          padIndex(pin),
          'UART'
        ),
        this.text(
          'Set {0}_PINMUX->PAD_{1}{2}.FSEL to {3}',
          hpsysPins ? 'HPSYS' : 'LPSYS',
          prefix,
          padIndex(pin),
          expectedFsel
        )
      );
    }
    if (checkIe && pad?.IE !== 1) {
      this.error(
        this.text('{0} {1}{2} input is not enabled', label, prefix, padIndex(pin)),
        this.text('Set {0}_PINMUX->PAD_{1}{2}.IE to 1', hpsysPins ? 'HPSYS' : 'LPSYS', prefix, padIndex(pin))
      );
    }
    if (warnPullUp && pad?.PE === 1 && pad?.PS === 1) {
      this.warn(
        this.text('{0} {1}{2} has the internal pull-up enabled, which may cause leakage', label, prefix, padIndex(pin)),
        label === 'RTS'
          ? this.text(
              'Set {0}_PINMUX->PAD_{1}{2}.PE to 0 to disable the internal pull-up',
              hpsysPins ? 'HPSYS' : 'LPSYS',
              prefix,
              padIndex(pin)
            )
          : this.text(
              'Set {0}_PINMUX->PAD_{1}{2}.PS to 0 to switch to an internal pull-down',
              hpsysPins ? 'HPSYS' : 'LPSYS',
              prefix,
              padIndex(pin)
            )
      );
    }
    if (!warnPullUp && pad?.PE === 1 && pad?.PS === 0) {
      const suggestion = this.text(
        'Set {0}_PINMUX->PAD_{1}{2}.PE to 0 to disable the internal pull-down',
        hpsysPins ? 'HPSYS' : 'LPSYS',
        prefix,
        padIndex(pin)
      );
      const message = this.text(
        '{0} {1}{2} has the internal pull-down enabled, which may cause leakage',
        label,
        prefix,
        padIndex(pin)
      );
      if (errorPullDown) {
        this.error(message, suggestion);
      } else {
        this.warn(message, suggestion);
      }
    }
  }
}

class I2cAnalyzer52 extends Sf32lb52xAnalyzer {
  constructor() {
    super('I2C');
  }

  protected async run(): Promise<void> {
    const instNum = this.getInstanceNum();
    const hpsysRcc = await this.requirePeripheral('HPSYS_RCC');
    const hpsysCfg = await this.requirePeripheral('HPSYS_CFG');
    const hpsysPinmux = await this.requirePeripheral('HPSYS_PINMUX');
    const i2c = await this.requirePeripheral(this.peripheralName);
    if (!hpsysRcc || !hpsysCfg || !hpsysPinmux || !i2c) {
      return;
    }

    let sclPin = 0x3f;
    let sdaPin = 0x3f;
    let dmaIndex = 22;
    if (instNum === 1) {
      if (hpsysRcc.ENR1?.I2C1 !== 1) {
        this.reportModuleClockDisabled('HPSYS_RCC.ESR1_I2C1');
      }
      if (hpsysRcc.RSTR1?.I2C1 !== 0) {
        this.reportModuleResetAsserted('HPSYS_RCC.RSTR1_I2C1');
      }
      sclPin = hpsysCfg.I2C1_PINR?.SCL_PIN;
      sdaPin = hpsysCfg.I2C1_PINR?.SDA_PIN;
      dmaIndex = 22;
    } else if (instNum === 2) {
      if (hpsysRcc.ENR1?.I2C2 !== 1) {
        this.reportModuleClockDisabled('HPSYS_RCC.ESR1_I2C2');
      }
      if (hpsysRcc.RSTR1?.I2C2 !== 0) {
        this.reportModuleResetAsserted('HPSYS_RCC.RSTR1_I2C2');
      }
      sclPin = hpsysCfg.I2C2_PINR?.SCL_PIN;
      sdaPin = hpsysCfg.I2C2_PINR?.SDA_PIN;
      dmaIndex = 23;
    } else if (instNum === 3) {
      if (hpsysRcc.ENR2?.I2C3 !== 1) {
        this.reportModuleClockDisabled('HPSYS_RCC.ESR2_I2C3');
      }
      if (hpsysRcc.RSTR2?.I2C3 !== 0) {
        this.reportModuleResetAsserted('HPSYS_RCC.RSTR2_I2C3');
      }
      sclPin = hpsysCfg.I2C3_PINR?.SCL_PIN;
      sdaPin = hpsysCfg.I2C3_PINR?.SDA_PIN;
      dmaIndex = 24;
    } else if (instNum === 4) {
      if (hpsysRcc.ENR2?.I2C4 !== 1) {
        this.reportModuleClockDisabled('HPSYS_RCC.ESR2_I2C4');
      }
      if (hpsysRcc.RSTR2?.I2C4 !== 0) {
        this.reportModuleResetAsserted('HPSYS_RCC.RSTR2_I2C4');
      }
      sclPin = hpsysCfg.I2C4_PINR?.SCL_PIN;
      sdaPin = hpsysCfg.I2C4_PINR?.SDA_PIN;
      dmaIndex = 3;
    }

    this.checkI2cAssignedPin('SCL', sclPin);
    this.checkI2cAssignedPin('SDA', sdaPin);

    this.checkI2cPinmux('SCL', sclPin, hpsysPinmux);
    this.checkI2cPinmux('SDA', sdaPin, hpsysPinmux);

    if ((i2c.CR?.MODE ?? 0) > 1) {
      this.warn(
        'I2C is in high-speed mode and must be accessed with the dedicated format',
        'Confirm whether 3.4 MHz high-speed mode (HS-mode) is actually required'
      );
    }
    if (i2c.CR?.UR === 1) {
      this.warn('I2C is still held in reset', this.text('Clear I2C{0}->CR.UR to release reset', instNum));
    }
    if (i2c.CR?.SCLE === 0) {
      this.warn('SCL output is disabled', this.text('Set I2C{0}->CR.SCLE to 1 to enable SCL output', instNum));
    }
    if (i2c.CR?.IUE === 0) {
      this.warn('I2C has not started running', this.text('Set I2C{0}->CR.IUE to 1 to start I2C', instNum));
    }
    if (i2c.SR?.SAD === 1) {
      this.warn(
        'I2C has been addressed successfully as a slave',
        this.text('If {0} only needs to operate as a master, clear I2C{1}->CR.SLVEN', this.peripheralName, instNum)
      );
    }
    if (i2c.SR?.UB === 1) {
      this.warn(
        'The I2C transfer has not finished',
        this.text('If the transfer never finishes, I2C may be stuck; set I2C{0}->CR.BRGRST to 1 to reset it', instNum)
      );
    }
    if (i2c.SR?.UF === 1) {
      this.warn('FIFO underflow occurred', 'Check the bus frequency and the DMAC status');
    }
    if (i2c.SR?.OF === 1) {
      this.warn('FIFO overflow occurred', 'Check the bus frequency and the DMAC status');
    }
    if (i2c.BMR?.SCL === 0) {
      this.warn(
        'SCL is being held low',
        this.text(
          'If no transfer is in progress, the SCL pull-up may be failing or the device may be stuck; try a bus reset with I2C{0}->CR.RSTREQ = 1',
          instNum
        )
      );
    }
    if (i2c.BMR?.SDA === 0) {
      this.warn(
        'SDA is being held low',
        this.text(
          'If no transfer is in progress, the SDA pull-up may be failing or the device may be stuck; try a bus reset with I2C{0}->CR.RSTREQ = 1',
          instNum
        )
      );
    }

    if (i2c.CR?.DMAEN === 1) {
      const dmac1 = await this.readPeripheral('DMAC1');
      const channel = dmac1 ? findDmac1Mapping(dmac1, dmaIndex) : 0;
      if (channel === 0) {
        this.error(
          this.text('{0} is not mapped to any DMAC1 channel', this.peripheralName),
          this.text('Check the DMAC1 CSELR1/2.CxS setting for the mapped channel; it should be {0}', dmaIndex)
        );
      }
      if (i2c.CR?.ADC_OP_MODE === 0 && i2c.CR?.DMA_DATA_SEL === 1) {
        this.error('DMA data source selection is incorrect', 'Set DMA_DATA_SEL to 0 for normal operation');
      }
    }
  }

  private checkI2cAssignedPin(label: string, pin: number): void {
    if (pin === 0x3f) {
      this.error(
        this.text('No IO is assigned to {0}', label),
        this.text('Assign HPSYS_CFG->{0}_PINR.{1}_PIN to the required IO', this.peripheralName.toUpperCase(), label)
      );
      return;
    }
    if (pin > 44) {
      this.error(
        this.text('Assigned pin PA{0} for {1} does not exist', padIndex(pin), label),
        'Available IOs: PA00~PA44'
      );
    }
  }

  private checkI2cPinmux(label: string, pin: number, pinmux: any): void {
    if (pin > 44 || pin === 0x3f) {
      return;
    }
    const pad = padPa(pinmux, pin);
    if (pad?.FSEL !== 4) {
      this.error(
        this.text('{0} PA{1} is configured for the wrong function; {2} is not selected', label, padIndex(pin), 'I2C'),
        this.text('Set HPSYS_PINMUX->PAD_PA{0}.FSEL to {1}', padIndex(pin), 4)
      );
    }
    if (pad?.IE !== 1) {
      this.error(
        this.text('{0} PA{1} input is not enabled', label, padIndex(pin)),
        this.text('Set HPSYS_PINMUX->PAD_PA{0}.IE to 1', padIndex(pin))
      );
    }
    if (pad?.PE === 1 && pad?.PS === 0) {
      this.error(
        this.text('{0} PA{1} has the internal pull-down enabled, which can cause leakage', label, padIndex(pin)),
        this.text(
          'Set HPSYS_PINMUX->PAD_PA{0}.PE to 0 to disable the internal pull-down, and ensure an external pull-up resistor is present',
          padIndex(pin)
        )
      );
    }
  }
}

class DmacAnalyzer52 extends Sf32lb52xAnalyzer {
  constructor() {
    super('DMAC');
  }

  protected async run(): Promise<void> {
    const instNum = this.getInstanceNum();
    const hpsysRcc = await this.requirePeripheral('HPSYS_RCC');
    if (!hpsysRcc) {
      return;
    }
    if (instNum === 1) {
      if (hpsysRcc.ENR1?.DMAC1 !== 1) {
        this.reportModuleClockDisabled('HPSYS_RCC.ESR1_DMAC1');
      }
      if (hpsysRcc.RSTR1?.DMAC1 !== 0) {
        this.reportModuleResetAsserted('HPSYS_RCC.RSTR1_DMAC1');
      }
    } else if (instNum === 2) {
      const hpsysAon = await this.requirePeripheral('HPSYS_AON');
      const lpsysRcc = await this.requirePeripheral('LPSYS_RCC');
      if (!hpsysAon || !lpsysRcc) {
        return;
      }
      if (!hpsysAon.ISSR?.LP_ACTIVE) {
        this.error('LPSYS is asleep, so DMAC2 cannot be accessed', 'Wake LPSYS before accessing the peripheral');
        return;
      }
      if (lpsysRcc.ENR1?.DMAC2 !== 1) {
        this.reportModuleClockDisabled('LPSYS_RCC.ESR1_DMAC2');
      }
      if (lpsysRcc.RSTR1?.DMAC2 !== 0) {
        this.reportModuleResetAsserted('LPSYS_RCC.RSTR1_DMAC2');
      }
    }

    const dmac = await this.requirePeripheral(this.peripheralName);
    if (!dmac) {
      return;
    }

    for (let chNum = 1; chNum <= 8; chNum += 1) {
      const ccr = dmac[`CCR${chNum}`];
      const cndtr = dmac[`CNDTR${chNum}`];
      const cm0ar = dmac[`CM0AR${chNum}`];
      const cpar = dmac[`CPAR${chNum}`];
      if (!ccr || !cndtr || !cm0ar || !cpar) {
        continue;
      }
      const chM2m = ccr.MEM2MEM;
      const chSel = chNum < 5 ? dmac.CSELR1?.[`C${chNum}S`] : dmac.CSELR2?.[`C${chNum}S`];
      const chDir = ccr.DIR;
      const chSrcSize = chDir ? ccr.MSIZE : ccr.PSIZE;
      const chDstSize = chDir ? ccr.PSIZE : ccr.MSIZE;
      const chSrcAddr = chDir ? cm0ar.value : cpar.value;
      const chDstAddr = chDir ? cpar.value : cm0ar.value;

      if (chSrcAddr === 0 && chDstAddr === 0) {
        continue;
      }

      if (!chM2m) {
        const request = instNum === 1 ? (DMAC1_SELECT[chSel] ?? 'NONE') : (DMAC2_SELECT[chSel] ?? 'NONE');
        if (request === 'NONE') {
          this.error(
            this.text('Channel {0} is in peripheral mode, but the peripheral request selection is incorrect', chNum),
            'Configure the CSELR1/2.CxS registers correctly'
          );
        } else {
          this.checkPeripheralTargetAddress(request, chSrcAddr, chDstAddr);
        }
      } else if (ccr.CIRC) {
        this.warn(
          'Circular memory transfer is enabled',
          'This is an uncommon usage pattern; verify that it is intentional'
        );
      }

      if (chSrcSize === 2 && chSrcAddr & 3) {
        this.error(
          this.text(
            'For 4-byte transfers, source address 0x{0} is not 4-byte aligned',
            chSrcAddr.toString(16).padStart(8, '0')
          ),
          'The source address must be 4-byte aligned when the source data width is 4 bytes'
        );
      } else if (chSrcSize === 1 && chSrcAddr & 1) {
        this.error(
          this.text(
            'For 2-byte transfers, source address 0x{0} is not 2-byte aligned',
            chSrcAddr.toString(16).padStart(8, '0')
          ),
          'The source address must be 2-byte aligned when the source data width is 2 bytes'
        );
      }
      if (chDstSize === 2 && chDstAddr & 3) {
        this.error(
          this.text(
            'For 4-byte transfers, destination address 0x{0} is not 4-byte aligned',
            chDstAddr.toString(16).padStart(8, '0')
          ),
          'The destination address must be 4-byte aligned when the destination data width is 4 bytes'
        );
      } else if (chDstSize === 1 && chDstAddr & 1) {
        this.error(
          this.text(
            'For 2-byte transfers, destination address 0x{0} is not 2-byte aligned',
            chDstAddr.toString(16).padStart(8, '0')
          ),
          'The destination address must be 2-byte aligned when the destination data width is 2 bytes'
        );
      }
      if (this.isIllegalDmacAddress(instNum, chSrcAddr)) {
        this.error(
          this.text('Source address 0x{0} is in an invalid range', chSrcAddr.toString(16).padStart(8, '0')),
          'Check the configured addresses'
        );
      }
      if (this.isIllegalDmacAddress(instNum, chDstAddr)) {
        this.error(
          this.text('Destination address 0x{0} is in an invalid range', chDstAddr.toString(16).padStart(8, '0')),
          'Check the configured addresses'
        );
      }
      if (ccr.TCIE === 0 && ccr.HTIE === 0) {
        this.warn(
          'Neither the transfer-complete interrupt (TCIE) nor the half-transfer interrupt (HTIE) is enabled',
          this.text('Set CCR{0}.TCIE or HTIE to 1 to enable interrupts', chNum)
        );
      }
    }
  }

  private checkPeripheralTargetAddress(request: string, srcAddr: number, dstAddr: number): void {
    const target = PERIPHERAL_DMA_TARGETS[request];
    if (!target) {
      return;
    }

    if (target.target === 'dst' && dstAddr !== target.addr) {
      this.error(
        this.text('Destination address 0x{0} for {1} is incorrect', dstAddr.toString(16).padStart(8, '0'), request),
        this.text('Expected 0x{0}', target.addr.toString(16).padStart(8, '0'))
      );
    } else if (target.target === 'src' && srcAddr !== target.addr) {
      this.error(
        this.text('Source address 0x{0} for {1} is incorrect', srcAddr.toString(16).padStart(8, '0'), request),
        this.text('Expected 0x{0}', target.addr.toString(16).padStart(8, '0'))
      );
    } else if (target.target === 'any' && srcAddr !== target.addr && dstAddr !== target.addr) {
      this.error(
        this.text(
          'Address 0x{0} or 0x{1} for {2} is incorrect',
          srcAddr.toString(16).padStart(8, '0'),
          dstAddr.toString(16).padStart(8, '0'),
          request
        ),
        this.text('Expected 0x{0}', target.addr.toString(16).padStart(8, '0'))
      );
    }
  }

  private isIllegalDmacAddress(instNum: number, addr: number): boolean {
    if (instNum === 1) {
      if (addr >= 0xa0000000 && addr < 0xa0010000) {
        return false;
      }
      if (addr >= 0x20000000 && addr < 0x20080000) {
        return false;
      }
      if (addr >= 0x50000000 && addr < 0x50100000) {
        return false;
      }
      if (addr >= 0x60000000 && addr < 0xa0000000) {
        return false;
      }
      if (addr >= 0x20800000 && addr < 0x20860000) {
        return false;
      }
      if (addr >= 0x20400000 && addr < 0x20410000) {
        return false;
      }
      if (addr >= 0x40000000 && addr < 0x400d0000) {
        return false;
      }
      return true;
    }
    if (addr >= 0x2a000000 && addr < 0x2a080000) {
      return false;
    }
    if (addr >= 0x50000000 && addr < 0x50100000) {
      return false;
    }
    if (addr >= 0x60000000 && addr < 0xa0000000) {
      return false;
    }
    if (addr >= 0x00000000 && addr < 0x00060000) {
      return false;
    }
    if (addr >= 0x20400000 && addr < 0x20410000) {
      return false;
    }
    if (addr >= 0x40000000 && addr < 0x400d0000) {
      return false;
    }
    return true;
  }
}

class GptimAnalyzer52 extends Sf32lb52xAnalyzer {
  constructor() {
    super('GPTIM');
  }

  protected async run(): Promise<void> {
    const instNum = this.getInstanceNum();
    const hpsysRcc = await this.requirePeripheral('HPSYS_RCC');
    const hpsysCfg = await this.requirePeripheral('HPSYS_CFG');
    if (!hpsysRcc || !hpsysCfg) {
      return;
    }

    let pinRecord: any;
    let etrPin = 0x3f;
    if (instNum === 1) {
      if (hpsysRcc.ENR1?.GPTIM1 !== 1) {
        this.reportModuleClockDisabled('HPSYS_RCC.ESR1_GPTIM1');
      }
      if (hpsysRcc.RSTR1?.GPTIM1 !== 0) {
        this.reportModuleResetAsserted('HPSYS_RCC.RSTR1_GPTIM1');
      }
      pinRecord = hpsysCfg.GPTIM1_PINR;
      etrPin = hpsysCfg.ETR_PINR?.ETR1_PIN;
    } else if (instNum === 2) {
      if (hpsysRcc.ENR1?.GPTIM2 !== 1) {
        this.reportModuleClockDisabled('HPSYS_RCC.ESR1_GPTIM2');
      }
      if (hpsysRcc.RSTR1?.GPTIM2 !== 0) {
        this.reportModuleResetAsserted('HPSYS_RCC.RSTR1_GPTIM2');
      }
      pinRecord = hpsysCfg.GPTIM2_PINR;
      etrPin = hpsysCfg.ETR_PINR?.ETR2_PIN;
    } else {
      return;
    }

    const pins = [
      ['CH1', pinRecord?.CH1_PIN],
      ['CH2', pinRecord?.CH2_PIN],
      ['CH3', pinRecord?.CH3_PIN],
      ['CH4', pinRecord?.CH4_PIN],
      ['ETR', etrPin],
    ] as const;
    for (const [label, pin] of pins) {
      if (pin !== 0x3f && pin > 44) {
        this.error(
          this.text('Assigned pin PA{0} for {1} does not exist', padIndex(pin), label),
          'Available IOs: PA00~PA44'
        );
      }
    }

    const pinmux = await this.requirePeripheral('HPSYS_PINMUX');
    const gptim = await this.requirePeripheral(this.peripheralName);
    if (!pinmux || !gptim) {
      return;
    }
    for (const [label, pin] of pins) {
      if (pin !== 0x3f && pin <= 44 && padPa(pinmux, pin)?.FSEL !== 5) {
        this.error(
          this.text('{0} PA{1} is configured for the wrong function; {2} is not selected', label, padIndex(pin), 'TIM'),
          this.text('Set HPSYS_PINMUX->PAD_PA{0}.FSEL to {1}', padIndex(pin), 5)
        );
      }
    }

    if ((gptim.CR1?.CMS ?? 0) !== 0 && (gptim.CR1?.OPM ?? 0) === 1 && ((gptim.RCR?.REP ?? 0) & 1) === 0) {
      this.warn(
        'In repeated center-aligned counting, the last cycle stops immediately after the up-count phase completes',
        'If the final cycle must complete fully, configure the repetition count (GPTIM.RCR.REP+1) as an even number'
      );
    }

    for (let chNum = 1; chNum <= 4; chNum += 1) {
      const ccmr = chNum < 3 ? gptim.CCMR1 : gptim.CCMR2;
      const ocm = ccmr?.[`OC${chNum}M`];
      if ((ocm === 14 || ocm === 15) && (gptim.CR1?.CMS ?? 0) === 0) {
        this.error('Asymmetric PWM should use center-aligned counting', 'Check the configuration');
      }
    }
  }
}

class AtimAnalyzer52 extends Sf32lb52xAnalyzer {
  constructor() {
    super('ATIM');
  }

  protected async run(): Promise<void> {
    const instNum = this.getInstanceNum();
    if (instNum !== 1) {
      return;
    }
    const hpsysRcc = await this.requirePeripheral('HPSYS_RCC');
    const hpsysCfg = await this.requirePeripheral('HPSYS_CFG');
    if (!hpsysRcc || !hpsysCfg) {
      return;
    }
    if (hpsysRcc.ENR2?.ATIM1 !== 1) {
      this.reportModuleClockDisabled('HPSYS_RCC.ESR2_ATIM1');
    }
    if (hpsysRcc.RSTR2?.ATIM1 !== 0) {
      this.reportModuleResetAsserted('HPSYS_RCC.RSTR2_ATIM1');
    }

    const pins = [
      ['CH1', hpsysCfg.ATIM1_PINR1?.CH1_PIN],
      ['CH2', hpsysCfg.ATIM1_PINR1?.CH2_PIN],
      ['CH3', hpsysCfg.ATIM1_PINR1?.CH3_PIN],
      ['CH4', hpsysCfg.ATIM1_PINR1?.CH4_PIN],
      ['CH1N', hpsysCfg.ATIM1_PINR2?.CH1N_PIN],
      ['CH2N', hpsysCfg.ATIM1_PINR2?.CH2N_PIN],
      ['CH3N', hpsysCfg.ATIM1_PINR2?.CH3N_PIN],
      ['BK', hpsysCfg.ATIM1_PINR3?.BK_PIN],
      ['BK2', hpsysCfg.ATIM1_PINR3?.BK2_PIN],
      ['ETR', hpsysCfg.ATIM1_PINR3?.ETR_PIN],
    ] as const;
    for (const [label, pin] of pins) {
      if (pin !== 0x3f && pin > 44) {
        this.error(
          this.text('Assigned pin PA{0} for {1} does not exist', padIndex(pin), label),
          'Available IOs: PA00~PA44'
        );
      }
    }

    const pinmux = await this.requirePeripheral('HPSYS_PINMUX');
    const atim = await this.requirePeripheral(this.peripheralName);
    if (!pinmux || !atim) {
      return;
    }
    for (const [label, pin] of pins) {
      if (pin !== 0x3f && pin <= 44 && padPa(pinmux, pin)?.FSEL !== 5) {
        this.error(
          this.text('{0} PA{1} is configured for the wrong function; {2} is not selected', label, padIndex(pin), 'TIM'),
          this.text('Set HPSYS_PINMUX->PAD_PA{0}.FSEL to {1}', padIndex(pin), 5)
        );
      }
    }
    if ((atim.CR1?.CMS ?? 0) !== 0 && (atim.CR1?.OPM ?? 0) === 1 && ((atim.RCR?.REP ?? 0) & 1) === 0) {
      this.warn(
        'In repeated center-aligned counting, the last cycle stops immediately after the up-count phase completes',
        'If the final cycle must complete fully, configure the repetition count (ATIM.RCR.REP+1) as an even number'
      );
    }
    if ((atim.AF1?.LOCK ?? 0) !== 0) {
      this.warn(
        this.text('Register lock level {0} is enabled, so some registers cannot be modified', atim.AF1?.LOCK ?? 0),
        'These registers can be modified only after a reset'
      );
    }
    for (let chNum = 1; chNum <= 4; chNum += 1) {
      const ccmr = chNum < 3 ? atim.CCMR1 : atim.CCMR2;
      const ocm = ccmr?.[`OC${chNum}M`];
      if ((ocm === 14 || ocm === 15) && (atim.CR1?.CMS ?? 0) === 0) {
        this.error('Asymmetric PWM should use center-aligned counting', 'Check the configuration');
      }
    }
  }
}

export function registerSf32lb52xAnalyzers(runtime: PeripheralAnalysisRuntime): void {
  registerAnalyzers(runtime, [
    new RccAnalyzer52('HPSYS_RCC'),
    new RccAnalyzer52('LPSYS_RCC'),
    new TsenAnalyzer52(),
    new ExtdmaAnalyzer52(),
    new BtimAnalyzer52(),
    new PdmAnalyzer52(),
    new GpadcAnalyzer52(),
    new I2sAnalyzer52(),
    new SpiAnalyzer52(),
    new UsartAnalyzer52(),
    new I2cAnalyzer52(),
    new DmacAnalyzer52(),
    new GptimAnalyzer52(),
    new AtimAnalyzer52(),
  ]);
}

function formatPa(pin: number): string {
  return `PA${padIndex(pin)}`;
}
