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
        this.error('系统时钟被误切换到clk_wdt', '需将HPSYS_RCC的CSR.SEL_SYS_LP置0');
      }
      if (hpsysRcc.CSR?.SEL_SYS === 2) {
        this.error('系统时钟被误切换到源2', 'HPSYS_RCC的CSR.SEL_SYS有效值为0,1,3');
      }
      if (hpsysRcc.CSR?.SEL_SYS === 3 && hpsysCfg.SYSCR?.LDO_VSEL) {
        this.error('基础工作模式不能使用clk_dll1', '基础工作模式下,HPSYS_RCC的CSR.SEL_SYS有效值为0,1');
      }
      if (clocks.clkHpsys !== 999) {
        if (hpsysCfg.SYSCR?.LDO_VSEL && clocks.clkHpsys > 48) {
          this.error(`clk_hpsys ${clocks.clkHpsys}MHz,超出48MHz频率上限`);
        } else if (clocks.clkHpsys > 240) {
          this.error(`clk_hpsys ${clocks.clkHpsys}MHz,超出240MHz频率上限`);
        }
      } else {
        this.error('clk_hpsys频率获取异常');
      }
      if (clocks.hclkHpsys !== 999) {
        if (hpsysCfg.SYSCR?.LDO_VSEL && clocks.hclkHpsys > 48) {
          this.error(`hclk_hpsys ${clocks.hclkHpsys}MHz,超出48MHz频率上限`);
        } else if (clocks.hclkHpsys > 240) {
          this.error(`hclk_hpsys ${clocks.hclkHpsys}MHz,超出240MHz频率上限`);
        }
      } else {
        this.error('hclk_hpsys频率获取异常');
      }
      if (clocks.pclkHpsys !== 999) {
        if (hpsysCfg.SYSCR?.LDO_VSEL && clocks.pclkHpsys > 48) {
          this.error(`pclk_hpsys ${clocks.pclkHpsys}MHz,超出48MHz频率上限`);
        } else if (clocks.pclkHpsys > 120) {
          this.error(`pclk_hpsys ${clocks.pclkHpsys}MHz,超出120MHz频率上限`);
        }
      } else {
        this.error('pclk_hpsys频率获取异常');
      }
      if (clocks.pclk2Hpsys !== 999) {
        if (hpsysCfg.SYSCR?.LDO_VSEL && clocks.pclk2Hpsys > 6) {
          this.error(`pclk2_hpsys ${clocks.pclk2Hpsys}MHz,超出6MHz频率上限`);
        } else if (clocks.pclk2Hpsys > 7.5) {
          this.error(`pclk2_hpsys ${clocks.pclk2Hpsys}MHz,超出7.5MHz频率上限`);
        }
      } else {
        this.error('pclk2_hpsys频率获取异常');
      }
      if (hpsysRcc.ENR2?.MPI1) {
        if (![0, 1, 2].includes(hpsysRcc.CSR?.SEL_MPI1 ?? -1)) {
          this.error('MPI1的功能时钟选择错误', 'HPSYS_RCC的CSR.SEL_MPI1有效值为0,1,2');
        } else if (hpsysRcc.CSR?.SEL_MPI1 === 1 && clocks.clkDll1 === 0) {
          this.warn('clk_dll1未开启，MPI1无法工作');
        } else if (hpsysRcc.CSR?.SEL_MPI1 === 2 && clocks.clkDll2 === 0) {
          this.warn('clk_dll2未开启，MPI1无法工作');
        }
      }
      if (hpsysRcc.ENR2?.MPI2) {
        if (![0, 1, 2].includes(hpsysRcc.CSR?.SEL_MPI2 ?? -1)) {
          this.error('MPI2的功能时钟选择错误', 'HPSYS_RCC的CSR.SEL_MPI2有效值为0,1,2');
        } else if (hpsysRcc.CSR?.SEL_MPI2 === 1 && clocks.clkDll1 === 0) {
          this.warn('clk_dll1未开启，MPI2无法工作');
        } else if (hpsysRcc.CSR?.SEL_MPI2 === 2 && clocks.clkDll2 === 0) {
          this.warn('clk_dll2未开启，MPI2无法工作');
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
      this.error(`LPSYS处于睡眠状态，无法访问${this.peripheralName}`, '需将LPSYS唤醒后才能访问LPSYS_RCC');
      return;
    }
    if (lpsysRcc.CSR?.SEL_SYS_LP) {
      this.error('系统时钟被误切换到clk_wdt', '需将LPSYS_RCC的CSR.SEL_SYS_LP置0');
    }
    const clocks = getLpsysClocks(hpsysAon, lpsysRcc);
    if (!clocks) {
      this.error('LPSYS处于睡眠状态，无法获取LPSYS时钟');
      return;
    }
    if (!lpsysCfg.SYSCR?.LDO_VSEL && clocks.hclkLpsys > 24) {
      this.error(`hclk_lpsys ${clocks.hclkLpsys}MHz,超出24MHz频率上限`);
    }
    if (!lpsysCfg.SYSCR?.LDO_VSEL && clocks.pclkLpsys > 24) {
      this.error(`pclk_lpsys ${clocks.pclkLpsys}MHz,超出24MHz频率上限`);
    }
    if (lpsysCfg.SYSCR?.LDO_VSEL && clocks.pclk2Lpsys > 6) {
      this.error(`pclk2_lpsys ${clocks.pclk2Lpsys}MHz,超出6MHz频率上限`);
    } else if (!lpsysCfg.SYSCR?.LDO_VSEL && clocks.pclk2Lpsys > 3) {
      this.error(`pclk2_lpsys ${clocks.pclk2Lpsys}MHz,超出3MHz频率上限`);
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
      this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ENR2_TSEN置1以开启模块时钟');
    }
    if (hpsysRcc.RSTR2?.TSEN !== 0) {
      this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR2_TSEN置0以释放模块复位');
    }
    if (hpsysCfg.ANAU_CR?.EN_BG !== 1) {
      this.error('Bandgap 没有打开', 'TSEN工作时应将HPSYS_CFG.ANAU_CR.EN_BG设为1');
    }
    if (tsen.TSEN_CTRL_REG?.ANAU_TSEN_EN !== 1) {
      this.error('TSEN模块没有使能', 'TSEN工作时应将TSEN.TSEN_CTRL_REG.ANAU_TSEN_EN设为1');
    }
    if (tsen.TSEN_CTRL_REG?.ANAU_TSEN_RSTB !== 1) {
      this.warn('TSEN RSTB错误', 'TSEN工作时，TSEN.TSEN_CTRL_REG.ANAU_TSEN_RSTB先置0后置1，最后应为1');
    }
    if (tsen.TSEN_CTRL_REG?.ANAU_TSEN_PU !== 1) {
      this.warn('TSEN PU错误', 'TSEN工作时，TSEN.TSEN_CTRL_REG.ANAU_TSEN_PU应为1');
    }
    if (tsen.TSEN_CTRL_REG?.ANAU_TSEN_RUN !== 1) {
      this.warn('TSEN RUN错误', 'TSEN工作时，TSEN.TSEN_CTRL_REG.ANAU_TSEN_RUN应为1');
    }

    const clocks = getHpsysClocks(hpsysRcc);
    const clkDiv = Math.max(1, tsen.TSEN_CTRL_REG?.ANAU_TSEN_CLK_DIV ?? 1);
    const tsenFreq = clocks.pclkHpsys / clkDiv;
    if (tsenFreq > 2) {
      this.error('TSEN时钟频率高于最高频率2MHz');
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
      this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR1_EXTDMA置1以开启模块时钟');
    }
    if (hpsysRcc.RSTR1?.EXTDMA !== 0) {
      this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_EXTDMA置0以释放模块复位');
    }
    if (extdma.CCR?.SRCSIZE !== 2) {
      this.error('源数据类型不是四字节', 'CCR.SRCSIZE必须为2');
    }
    if (extdma.CCR?.DSTSIZE !== 2) {
      this.error('目的数据类型不是四字节', 'CCR.DSTSIZE必须为2');
    }
    if ((extdma.SRCAR?.value ?? 0) !== 0 || (extdma.DSTAR?.value ?? 0) !== 0) {
      if ((extdma.SRCAR?.value ?? 0) & 3) {
        this.error(
          `源地址0x${(extdma.SRCAR?.value ?? 0).toString(16).padStart(8, '0')}不是四字节对齐`,
          '源地址必须为四字节对齐'
        );
      }
      if ((extdma.DSTAR?.value ?? 0) & 3) {
        this.error(
          `目的地址0x${(extdma.DSTAR?.value ?? 0).toString(16).padStart(8, '0')}不是四字节对齐`,
          '目的地址必须为四字节对齐'
        );
      }
      if (this.isIllegalExtdmaAddress(extdma.SRCAR?.value ?? 0)) {
        this.error(
          `源地址0x${(extdma.SRCAR?.value ?? 0).toString(16).padStart(8, '0')}处于${this.peripheralName}无法访问的区间`,
          '请检查地址设置'
        );
      }
      if (this.isIllegalExtdmaAddress(extdma.DSTAR?.value ?? 0)) {
        this.error(
          `目的地址0x${(extdma.DSTAR?.value ?? 0).toString(16).padStart(8, '0')}处于${this.peripheralName}无法访问区间`,
          '请检查地址设置'
        );
      }
      if ((extdma.CCR?.TCIE ?? 0) === 0 && (extdma.CCR?.HTIE ?? 0) === 0) {
        this.warn('传输完成中断(TCIE)与传输过半中断(HTIE)均未使能', '请将TCIE或HTIE置1使能中断');
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
        this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR1_BTIM1置1以开启模块时钟');
      }
      if (hpsysRcc.RSTR1?.BTIM1 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_BTIM1置0以释放模块复位');
      }
      return;
    }
    if (instNum === 2) {
      if (hpsysRcc.ENR1?.BTIM2 !== 1) {
        this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR1_BTIM2置1以开启模块时钟');
      }
      if (hpsysRcc.RSTR1?.BTIM2 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_BTIM2置0以释放模块复位');
      }
      return;
    }

    const hpsysAon = await this.requirePeripheral('HPSYS_AON');
    const lpsysRcc = await this.requirePeripheral('LPSYS_RCC');
    if (!hpsysAon || !lpsysRcc) {
      return;
    }
    if (!hpsysAon.ISSR?.LP_ACTIVE) {
      this.error(`LPSYS处于睡眠状态，无法访问${this.peripheralName}`, `需将LPSYS唤醒后才能访问${this.peripheralName}`);
      return;
    }
    if (instNum === 3) {
      if (lpsysRcc.ENR1?.BTIM3 !== 1) {
        this.error(`${this.peripheralName}模块时钟未开启`, '需将LPSYS_RCC的ESR1_BTIM3置1以开启模块时钟');
      }
      if (lpsysRcc.RSTR1?.BTIM3 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将LPSYS_RCC的RSTR1_BTIM3置0以释放模块复位');
      }
    } else if (instNum === 4) {
      if (lpsysRcc.ENR1?.BTIM4 !== 1) {
        this.error(`${this.peripheralName}模块时钟未开启`, '需将LPSYS_RCC的ESR1_BTIM4置1以开启模块时钟');
      }
      if (lpsysRcc.RSTR1?.BTIM4 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将LPSYS_RCC的RSTR1_BTIM4置0以释放模块复位');
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
      this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR1_PDM1置1以开启模块时钟');
    }
    if (hpsysRcc.RSTR1?.PDM1 !== 0) {
      this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_PDM1置0以释放模块复位');
    }

    const clkPin = this.findPinByFsel(hpsysPinmux, [7, 22], 3);
    if (clkPin === undefined) {
      this.error('未找到CLK分配的IO', '可分配IO为PA7,PA22');
    } else if (padPa(hpsysPinmux, clkPin)?.PE === 1) {
      this.warn(
        `CLK ${formatPa(clkPin)}内部上下拉开启，可能产生漏电`,
        `可将HPSYS_PINMUX->PAD_${formatPa(clkPin)}.PE设为0以关闭内部上下拉电阻`
      );
    }

    const dataPin = this.findPinByFsel(hpsysPinmux, [8, 23], 3);
    if (dataPin === undefined) {
      this.warn('未找到DATA分配的IO', '可分配IO为PA8,PA23');
    } else {
      if (padPa(hpsysPinmux, dataPin)?.IE !== 1) {
        this.error(`DATA ${formatPa(dataPin)}输入未使能`, `将HPSYS_PINMUX->PAD_${formatPa(dataPin)}.IE设为1`);
      }
      if (padPa(hpsysPinmux, dataPin)?.PE === 1) {
        this.warn(
          `DATA ${formatPa(dataPin)}内部上下拉开启，可能产生漏电`,
          `可将HPSYS_PINMUX->PAD_${formatPa(dataPin)}.PE设为0以关闭内部上下拉电阻`
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
      this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ENR2_GPADC置1以开启模块时钟');
    }
    if (hpsysRcc.RSTR2?.GPADC !== 0) {
      this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR2_GPADC置0以释放模块复位');
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
          this.error('ADC CH配置错误，未选择GPADC功能', `应将HPSYS_PINMUX->PAD_${formatPa(pin)}.FSEL设为7`);
        }
        if (padPa(hpsysPinmux, pin)?.PE === 1) {
          this.error(
            'ADC CHANNEL内部上下拉开启，测量会出错',
            `应将HPSYS_PINMUX->PAD_${formatPa(pin)}.PE设为0以关闭内部上下拉电阻`
          );
        }
      }
    }

    if (hpsysCfg.ANAU_CR?.EN_BG !== 1) {
      this.error('Bandgap 没有打开', 'GPADC工作时应将HPSYS_CFG.ANAU_CR.EN_BG设为1');
    }
    if (gpadc.ADC_CFG_REG1?.ANAU_GPADC_LDOREF_EN !== 1) {
      this.warn('GPADC参考电压没有打开', 'GPADC工作时应将PADC.ADC_CFG_REG1.ANAU_GPADC_LDOREF_EN设为1');
    }
    if (gpadc.ADC_CFG_REG1?.ANAU_GPADC_MUTE === 1) {
      this.error('MUTE模式已打开', 'GPADC工作时应将GPADC.ADC_CFG_REG1.ANAU_GPADC_MUTE设为0');
    }
    if (gpadc.ADC_CFG_REG1?.ANAU_GPADC_P_INT_EN === 1) {
      this.error('P_INT_EN设置错误', 'GPADC工作时应将GPADC.ADC_CFG_REG1.ANAU_GPADC_P_INT_EN设为0');
    }
    if (gpadc.ADC_CFG_REG1?.ANAU_GPADC_SE !== 1) {
      this.warn('GPADC处于差分输入模式');
    }

    const clocks = getHpsysClocks(hpsysRcc);
    const convWidth = gpadc.ADC_CTRL_REG2?.CONV_WIDTH ?? 0;
    const sampWidth = gpadc.ADC_CTRL_REG2?.SAMP_WIDTH ?? 0;
    const dataDly = gpadc.ADC_CTRL_REG?.DATA_SAMP_DLY ?? 0;
    const gpadcFreq = (clocks.pclkHpsys / Math.max(1, convWidth + sampWidth + dataDly + 2)) * 1000;
    if (gpadcFreq > 4000) {
      this.error('采样频率超过4MHz最高采样频率', '请重新配置采样频率');
    }

    if ((gpadc.ADC_CTRL_REG?.DMA_EN ?? 0) === 1 && (gpadc.ADC_CTRL_REG?.ADC_OP_MODE ?? 0) === 0) {
      this.warn('GPADC的DMA使能且处于单次采样模式', '如果使用DMA取数，GPADC应工作在连续采样模式，即ADC_OP_MODE设为1');
      if ((gpadc.ADC_CTRL_REG?.DMA_DATA_SEL ?? 0) === 1) {
        this.error('DMA数据源选择错误', '正常使用时DMA_DATA_SEL应设为0');
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
      this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR1_I2S1置1以开启模块时钟');
    }
    if (hpsysRcc.RSTR1?.I2S1 !== 0) {
      this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_I2S1置0以释放模块复位');
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
        this.error(`未找到${label}分配的IO`, `可分配IO为PA${candidates.join(',PA')}`);
      } else {
        this.warn(`未找到${label}分配的IO`, `可分配IO为PA${candidates.join(',PA')}`);
      }
      return;
    }
    if (requiresInput && padPa(pinmux, pin)?.IE !== 1) {
      this.error(`${label} ${formatPa(pin)}输入未使能`, `将HPSYS_PINMUX->PAD_${formatPa(pin)}.IE设为1`);
    }
    if (padPa(pinmux, pin)?.PE === 1) {
      this.warn(
        `${label} ${formatPa(pin)}内部上下拉开启，可能产生漏电`,
        `可将HPSYS_PINMUX->PAD_${formatPa(pin)}.PE设为0以关闭内部上下拉电阻`
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
        this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR1_SPI1置1以开启模块时钟');
      }
      if (hpsysRcc.RSTR1?.SPI1 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_SPI1置0以释放模块复位');
      }
    } else if (instNum === 2) {
      if (hpsysRcc.ENR1?.SPI2 !== 1) {
        this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR1_SPI2置1以开启模块时钟');
      }
      if (hpsysRcc.RSTR1?.SPI2 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_SPI2置0以释放模块复位');
      }
      clkPin = 39;
      csPin = 40;
      dioPin = 37;
      diPin = 38;
    }

    if (padPa(hpsysPinmux, clkPin)?.FSEL !== 2) {
      this.error(
        `CLK ${formatPa(clkPin)}功能错误，未选择SPI功能`,
        `应将HPSYS_PINMUX->PAD_${formatPa(clkPin)}.FSEL设为2`
      );
    }
    if (padPa(hpsysPinmux, clkPin)?.PE === 1) {
      this.warn(
        `CLK ${formatPa(clkPin)}内部上下拉开启，可能产生漏电`,
        `应将HPSYS_PINMUX->PAD_${formatPa(clkPin)}.PE设为0以关闭内部上下拉电阻`
      );
    }
    if (padPa(hpsysPinmux, csPin)?.FSEL !== 2) {
      this.error(`CS ${formatPa(csPin)}功能错误，未选择SPI功能`, `应将HPSYS_PINMUX->PAD_${formatPa(csPin)}.FSEL设为2`);
    }
    if (padPa(hpsysPinmux, csPin)?.PE === 1 && padPa(hpsysPinmux, csPin)?.PS === 0) {
      this.error(
        `CS ${formatPa(csPin)}内部下拉开启，会产生漏电`,
        `应将HPSYS_PINMUX->PAD_${formatPa(csPin)}.PS设为1改成内部上拉`
      );
    }
    if (padPa(hpsysPinmux, dioPin)?.FSEL !== 2) {
      this.error(
        `DIO ${formatPa(dioPin)}功能错误，未选择SPI功能`,
        `应将HPSYS_PINMUX->PAD_${formatPa(dioPin)}.FSEL设为2`
      );
    }
    if (padPa(hpsysPinmux, dioPin)?.IE !== 1 && spi.TRIWIRE_CTRL?.SPI_TRI_WIRE_EN === 1) {
      this.warn(
        `DIO ${formatPa(dioPin)}输入未使能`,
        `SPI三线模式需开启DIO输入使能，将HPSYS_PINMUX->PAD_${formatPa(dioPin)}.IE设为1`
      );
    }
    if (padPa(hpsysPinmux, diPin)?.FSEL !== 2) {
      this.warn(
        `DI ${formatPa(diPin)}未选择SPI功能`,
        `SPI四线模式下，将HPSYS_PINMUX->PAD_${formatPa(diPin)}.FSEL设为2`
      );
    }
    if (padPa(hpsysPinmux, diPin)?.IE !== 1 && spi.TRIWIRE_CTRL?.SPI_TRI_WIRE_EN === 1) {
      this.warn(
        `DI ${formatPa(diPin)}输入未使能`,
        `SPI四线模式需开启DI输入使能，将HPSYS_PINMUX->PAD_${formatPa(diPin)}.IE设为1`
      );
    }

    if (spi.TOP_CTRL?.SSE !== 1) {
      this.error('SSE设置错误，未使能SPI', '正常工作时应将SSE设为1');
    }
    if (spi.TOP_CTRL?.FRF === 3) {
      this.error('SPI协议设置错误，配置为RSVD', '正常工作时应将FRF设为0/1/2中的一个');
    }
    if (spi.CLK_CTRL?.CLK_SSP_EN !== 1) {
      this.error('SPI时钟设置错误，没有使能', '正常工作应将CLK_SSP_EN设为1');
    }
    if (spi.TRIWIRE_CTRL?.SPI_TRI_WIRE_EN === 1 && spi.CLK_CTRL?.SPI_DI_SEL !== 1) {
      this.error('SPI三线设置错误', '三线时SPI_DI_SEL应设为1');
    }
    if (spi.STATUS?.ROR === 1) {
      this.error('RXFIFO 发生溢出！', '请检查RXFIFO读数流程');
    }
    if (spi.STATUS?.TUR === 1) {
      this.error('TXFIFO 发生下溢！', '请检查向TXFIFO送数流程');
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
        this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_USART1置0以释放模块复位');
      }
      ctsPin = hpsysCfg.USART1_PINR?.CTS_PIN;
      rtsPin = hpsysCfg.USART1_PINR?.RTS_PIN;
      rxdPin = hpsysCfg.USART1_PINR?.RXD_PIN;
      txdPin = hpsysCfg.USART1_PINR?.TXD_PIN;
    } else if (instNum === 2) {
      if (hpsysRcc.ENR1?.USART2 !== 1) {
        this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR1_USART2置1以开启模块时钟');
      }
      if (hpsysRcc.RSTR1?.USART2 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_USART2置0以释放模块复位');
      }
      ctsPin = hpsysCfg.USART2_PINR?.CTS_PIN;
      rtsPin = hpsysCfg.USART2_PINR?.RTS_PIN;
      rxdPin = hpsysCfg.USART2_PINR?.RXD_PIN;
      txdPin = hpsysCfg.USART2_PINR?.TXD_PIN;
    } else if (instNum === 3) {
      if (hpsysRcc.ENR2?.USART3 !== 1) {
        this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR2_USART3置1以开启模块时钟');
      }
      if (hpsysRcc.RSTR2?.USART3 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR2_USART3置0以释放模块复位');
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
          `LPSYS处于睡眠状态，无法访问${this.peripheralName}`,
          `需将LPSYS唤醒后才能访问${this.peripheralName}`
        );
        return;
      }
      hpsysPins = false;
      noAssignValue = 7;
      maxPin = 3;
      if (instNum === 4) {
        if (lpsysRcc.ENR1?.USART4 !== 1) {
          this.error(`${this.peripheralName}模块时钟未开启`, '需将LPSYS_RCC的ESR1_USART4置1以开启模块时钟');
        }
        if (lpsysRcc.RSTR1?.USART4 !== 0) {
          this.error(`${this.peripheralName}模块被复位`, '需将LPSYS_RCC的RSTR1_USART4置0以释放模块复位');
        }
        ctsPin = lpsysCfg.USART4_PINR?.CTS_PIN;
        rtsPin = lpsysCfg.USART4_PINR?.RTS_PIN;
        rxdPin = lpsysCfg.USART4_PINR?.RXD_PIN;
        txdPin = lpsysCfg.USART4_PINR?.TXD_PIN;
      } else if (instNum === 5) {
        if (lpsysRcc.ENR1?.USART5 !== 1) {
          this.error(`${this.peripheralName}模块时钟未开启`, '需将LPSYS_RCC的ESR1_USART5置1以开启模块时钟');
        }
        if (lpsysRcc.RSTR1?.USART5 !== 0) {
          this.error(`${this.peripheralName}模块被复位`, '需将LPSYS_RCC的RSTR1_USART5置0以释放模块复位');
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
        this.warn(`${label}没有分配IO`, `需将${this.peripheralName.toUpperCase()}_PINR.${label}_PIN配置到对应IO`);
      }
      return;
    }
    if (pin > maxPin) {
      this.error(`${label}分配的${prefix}${padIndex(pin)}不存在`, `可分配IO为${prefix}00~${prefix}${padIndex(maxPin)}`);
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
        `${label} ${prefix}${padIndex(pin)}功能错误，未选择UART功能`,
        `应将${hpsysPins ? 'HPSYS' : 'LPSYS'}_PINMUX->PAD_${prefix}${padIndex(pin)}.FSEL设为${expectedFsel}`
      );
    }
    if (checkIe && pad?.IE !== 1) {
      this.error(
        `${label} ${prefix}${padIndex(pin)}输入未使能`,
        `应将${hpsysPins ? 'HPSYS' : 'LPSYS'}_PINMUX->PAD_${prefix}${padIndex(pin)}.IE设为1`
      );
    }
    if (warnPullUp && pad?.PE === 1 && pad?.PS === 1) {
      this.warn(
        `${label} ${prefix}${padIndex(pin)}内部上拉开启，可能产生漏电`,
        `可将${hpsysPins ? 'HPSYS' : 'LPSYS'}_PINMUX->PAD_${prefix}${padIndex(pin)}.${
          label === 'RTS' ? 'PE设为0以关闭内部上拉' : 'PS设为0改为内部下拉'
        }`
      );
    }
    if (!warnPullUp && pad?.PE === 1 && pad?.PS === 0) {
      const suggestion = errorPullDown
        ? `可将${hpsysPins ? 'HPSYS' : 'LPSYS'}_PINMUX->PAD_${prefix}${padIndex(pin)}.PE设为0以关闭内部下拉`
        : `可将${hpsysPins ? 'HPSYS' : 'LPSYS'}_PINMUX->PAD_${prefix}${padIndex(pin)}.PE设为0以关闭内部下拉`;
      const message = `${label} ${prefix}${padIndex(pin)}内部下拉开启，可能产生漏电`;
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
        this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR1_I2C1置1以开启模块时钟');
      }
      if (hpsysRcc.RSTR1?.I2C1 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_I2C1置0以释放模块复位');
      }
      sclPin = hpsysCfg.I2C1_PINR?.SCL_PIN;
      sdaPin = hpsysCfg.I2C1_PINR?.SDA_PIN;
      dmaIndex = 22;
    } else if (instNum === 2) {
      if (hpsysRcc.ENR1?.I2C2 !== 1) {
        this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR1_I2C2置1以开启模块时钟');
      }
      if (hpsysRcc.RSTR1?.I2C2 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_I2C2置0以释放模块复位');
      }
      sclPin = hpsysCfg.I2C2_PINR?.SCL_PIN;
      sdaPin = hpsysCfg.I2C2_PINR?.SDA_PIN;
      dmaIndex = 23;
    } else if (instNum === 3) {
      if (hpsysRcc.ENR2?.I2C3 !== 1) {
        this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR2_I2C3置1以开启模块时钟');
      }
      if (hpsysRcc.RSTR2?.I2C3 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR2_I2C3置0以释放模块复位');
      }
      sclPin = hpsysCfg.I2C3_PINR?.SCL_PIN;
      sdaPin = hpsysCfg.I2C3_PINR?.SDA_PIN;
      dmaIndex = 24;
    } else if (instNum === 4) {
      if (hpsysRcc.ENR2?.I2C4 !== 1) {
        this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR2_I2C4置1以开启模块时钟');
      }
      if (hpsysRcc.RSTR2?.I2C4 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR2_I2C4置0以释放模块复位');
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
      this.warn('I2C为高速模式，需使用专用格式访问', '请确认是否需要3.4M高速模式(HS-mode)');
    }
    if (i2c.CR?.UR === 1) {
      this.warn('I2C处于复位状态', `将I2C${instNum}->CR.UR置0以解除复位`);
    }
    if (i2c.CR?.SCLE === 0) {
      this.warn('SCL输出关闭', `将I2C${instNum}->CR.SCLE置1使能SCL输出`);
    }
    if (i2c.CR?.IUE === 0) {
      this.warn('I2C未开始工作', `将I2C${instNum}->CR.IUE置1开始I2C工作`);
    }
    if (i2c.SR?.SAD === 1) {
      this.warn('I2C作为slave被寻址成功', `如果${this.peripheralName}只需作为master，应将I2C${instNum}->CR.SLVEN置0`);
    }
    if (i2c.SR?.UB === 1) {
      this.warn('I2C传输未结束', `如果传输长时间无法结束，怀疑I2C挂死，可将I2C${instNum}->CR.BRGRST置1复位I2C`);
    }
    if (i2c.SR?.UF === 1) {
      this.warn('FIFO下溢出', '请检查总线频率与DMAC状态');
    }
    if (i2c.SR?.OF === 1) {
      this.warn('FIFO溢出', '请检查总线频率与DMAC状态');
    }
    if (i2c.BMR?.SCL === 0) {
      this.warn(
        'SCL被拉低',
        `如果当前未处于传输状态，可能是SCL上拉电阻失效，或者外设挂死,请尝试发送总线复位(I2C${instNum}->CR.RSTREQ置1)`
      );
    }
    if (i2c.BMR?.SDA === 0) {
      this.warn(
        'SDA被拉低',
        `如果当前未处于传输状态，可能是SDA上拉电阻失效，或者外设挂死,请尝试发送总线复位(I2C${instNum}->CR.RSTREQ置1)`
      );
    }

    if (i2c.CR?.DMAEN === 1) {
      const dmac1 = await this.readPeripheral('DMAC1');
      const channel = dmac1 ? findDmac1Mapping(dmac1, dmaIndex) : 0;
      if (channel === 0) {
        this.error(
          `${this.peripheralName}没有映射到DMAC1的任何通道上`,
          `请检查DMAC1对应通道的CSELR1/2_CxS配置，应配置为${dmaIndex}`
        );
      }
      if (i2c.CR?.ADC_OP_MODE === 0 && i2c.CR?.DMA_DATA_SEL === 1) {
        this.error('DMA数据源选择错误', '正常使用时DMA_DATA_SEL应设为0');
      }
    }
  }

  private checkI2cAssignedPin(label: string, pin: number): void {
    if (pin === 0x3f) {
      this.error(
        `${label}没有分配IO`,
        `需将HPSYS_CFG->${this.peripheralName.toUpperCase()}_PINR.${label}_PIN配置到对应IO`
      );
      return;
    }
    if (pin > 44) {
      this.error(`${label}分配的PA${padIndex(pin)}不存在`, '可分配IO为PA00~PA44');
    }
  }

  private checkI2cPinmux(label: string, pin: number, pinmux: any): void {
    if (pin > 44 || pin === 0x3f) {
      return;
    }
    const pad = padPa(pinmux, pin);
    if (pad?.FSEL !== 4) {
      this.error(
        `${label} PA${padIndex(pin)}功能错误，未选择I2C功能`,
        `应将HPSYS_PINMUX->PAD_PA${padIndex(pin)}.FSEL设为4`
      );
    }
    if (pad?.IE !== 1) {
      this.error(`${label} PA${padIndex(pin)}输入未使能`, `应将HPSYS_PINMUX->PAD_PA${padIndex(pin)}.IE设为1`);
    }
    if (pad?.PE === 1 && pad?.PS === 0) {
      this.error(
        `${label} PA${padIndex(pin)}内部下拉开启，会产生漏电`,
        `应将HPSYS_PINMUX->PAD_PA${padIndex(pin)}.PE设为0以关闭内部下拉，同时芯片外部应有上拉电阻`
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
        this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR1_DMAC1置1以开启模块时钟');
      }
      if (hpsysRcc.RSTR1?.DMAC1 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_DMAC1置0以释放模块复位');
      }
    } else if (instNum === 2) {
      const hpsysAon = await this.requirePeripheral('HPSYS_AON');
      const lpsysRcc = await this.requirePeripheral('LPSYS_RCC');
      if (!hpsysAon || !lpsysRcc) {
        return;
      }
      if (!hpsysAon.ISSR?.LP_ACTIVE) {
        this.error('LPSYS处于睡眠状态，无法访问DMAC2', '需将LPSYS唤醒后才能访问');
        return;
      }
      if (lpsysRcc.ENR1?.DMAC2 !== 1) {
        this.error(`${this.peripheralName}模块时钟未开启`, '需将LPSYS_RCC的ESR1_DMAC2置1以开启模块时钟');
      }
      if (lpsysRcc.RSTR1?.DMAC2 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将LPSYS_RCC的RSTR1_DMAC2置0以释放模块复位');
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
          this.error(`通道${chNum}为外设模式,但没有配置正确的外设请求`, '请正确配置CSELR1/2.CxS寄存器');
        } else {
          this.checkPeripheralTargetAddress(request, chSrcAddr, chDstAddr);
        }
      } else if (ccr.CIRC) {
        this.warn('循环存储器搬运', '罕见用法，请检查需求是否合理');
      }

      if (chSrcSize === 2 && chSrcAddr & 3) {
        this.error(
          `四字节搬运时，源地址0x${chSrcAddr.toString(16).padStart(8, '0')}不是四字节对齐`,
          '源数据类型四字节时源地址必须为四字节对齐'
        );
      } else if (chSrcSize === 1 && chSrcAddr & 1) {
        this.error(
          `双字节搬运时，源地址0x${chSrcAddr.toString(16).padStart(8, '0')}不是双字节对齐`,
          '源数据类型双字节时源地址必须为双字节对齐'
        );
      }
      if (chDstSize === 2 && chDstAddr & 3) {
        this.error(
          `四字节搬运时，目的地址0x${chDstAddr.toString(16).padStart(8, '0')}不是四字节对齐`,
          '目的数据类型四字节时目的地址必须为四字节对齐'
        );
      } else if (chDstSize === 1 && chDstAddr & 1) {
        this.error(
          `双字节搬运时，目的地址0x${chDstAddr.toString(16).padStart(8, '0')}不是双字节对齐`,
          '目的数据类型双字节时目的地址必须为双字节对齐'
        );
      }
      if (this.isIllegalDmacAddress(instNum, chSrcAddr)) {
        this.error(`源地址0x${chSrcAddr.toString(16).padStart(8, '0')}处于非法区间`, '请检查地址设置');
      }
      if (this.isIllegalDmacAddress(instNum, chDstAddr)) {
        this.error(`目的地址0x${chDstAddr.toString(16).padStart(8, '0')}处于非法区间`, '请检查地址设置');
      }
      if (ccr.TCIE === 0 && ccr.HTIE === 0) {
        this.warn('传输完成中断(TCIE)与传输过半中断(HTIE)均未使能', `请将CCR${chNum}.TCIE或HTIE置1使能中断`);
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
        `${request}的目的地址0x${dstAddr.toString(16).padStart(8, '0')}错误`,
        `应当为0x${target.addr.toString(16).padStart(8, '0')}`
      );
    } else if (target.target === 'src' && srcAddr !== target.addr) {
      this.error(
        `${request}的源地址0x${srcAddr.toString(16).padStart(8, '0')}错误`,
        `应当为0x${target.addr.toString(16).padStart(8, '0')}`
      );
    } else if (target.target === 'any' && srcAddr !== target.addr && dstAddr !== target.addr) {
      this.error(
        `${request}的地址0x${srcAddr.toString(16).padStart(8, '0')}或0x${dstAddr.toString(16).padStart(8, '0')}错误`,
        `应当为0x${target.addr.toString(16).padStart(8, '0')}`
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
        this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR1_GPTIM1置1以开启模块时钟');
      }
      if (hpsysRcc.RSTR1?.GPTIM1 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_GPTIM1置0以释放模块复位');
      }
      pinRecord = hpsysCfg.GPTIM1_PINR;
      etrPin = hpsysCfg.ETR_PINR?.ETR1_PIN;
    } else if (instNum === 2) {
      if (hpsysRcc.ENR1?.GPTIM2 !== 1) {
        this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR1_GPTIM2置1以开启模块时钟');
      }
      if (hpsysRcc.RSTR1?.GPTIM2 !== 0) {
        this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_GPTIM2置0以释放模块复位');
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
        this.error(`${label}分配的PA${padIndex(pin)}不存在`, '可分配IO为PA00~PA44');
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
          `${label} PA${padIndex(pin)}功能错误，未选择TIM功能`,
          `应将HPSYS_PINMUX->PAD_PA${padIndex(pin)}.FSEL设为5`
        );
      }
    }

    if ((gptim.CR1?.CMS ?? 0) !== 0 && (gptim.CR1?.OPM ?? 0) === 1 && ((gptim.RCR?.REP ?? 0) & 1) === 0) {
      this.warn(
        '重复进行中心对齐计数时,最后一个周期当上升计数完成后就停止',
        '如果最后一个周期需要完整计数，需要将重复次数(GPTIM.RCR.REP+1)配置为偶数'
      );
    }

    for (let chNum = 1; chNum <= 4; chNum += 1) {
      const ccmr = chNum < 3 ? gptim.CCMR1 : gptim.CCMR2;
      const ocm = ccmr?.[`OC${chNum}M`];
      if ((ocm === 14 || ocm === 15) && (gptim.CR1?.CMS ?? 0) === 0) {
        this.error('非对称PWM应采用中心对齐计数', '请检查配置');
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
      this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR2_ATIM1置1以开启模块时钟');
    }
    if (hpsysRcc.RSTR2?.ATIM1 !== 0) {
      this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR2_ATIM1置0以释放模块复位');
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
        this.error(`${label}分配的PA${padIndex(pin)}不存在`, '可分配IO为PA00~PA44');
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
          `${label} PA${padIndex(pin)}功能错误，未选择TIM功能`,
          `应将HPSYS_PINMUX->PAD_PA${padIndex(pin)}.FSEL设为5`
        );
      }
    }
    if ((atim.CR1?.CMS ?? 0) !== 0 && (atim.CR1?.OPM ?? 0) === 1 && ((atim.RCR?.REP ?? 0) & 1) === 0) {
      this.warn(
        '重复进行中心对齐计数时,最后一个周期当上升计数完成后就停止',
        '如果最后一个周期需要完整计数，需要将重复次数(ATIM.RCR.REP+1)配置为偶数'
      );
    }
    if ((atim.AF1?.LOCK ?? 0) !== 0) {
      this.warn(`已开启${atim.AF1?.LOCK}级寄存器锁,部分寄存器无法改写`, '复位后才能进行修改');
    }
    for (let chNum = 1; chNum <= 4; chNum += 1) {
      const ccmr = chNum < 3 ? atim.CCMR1 : atim.CCMR2;
      const ocm = ccmr?.[`OC${chNum}M`];
      if ((ocm === 14 || ocm === 15) && (atim.CR1?.CMS ?? 0) === 0) {
        this.error('非对称PWM应采用中心对齐计数', '请检查配置');
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
