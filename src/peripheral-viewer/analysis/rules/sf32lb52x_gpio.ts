import { PeripheralAnalysisRuntime } from '../runtime';
import { registerAnalyzers, RuleBasedAnalyzer } from './base';

const PA_PINMUX = [
  ['GPIO', 'LCDC1_SPI_RSTB', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'LCDC1_8080_RSTB', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'LCDC1_SPI_TE', 'NONE', 'I2S1_MCLK', 'I2C/UART', 'TIM', 'LCDC1_JDI_B2', 'LCDC1_8080_TE', 'NONE', 'DBG_DO0'],
  ['GPIO', 'LCDC1_SPI_CS', 'NONE', 'I2S1_SDO', 'I2C/UART', 'TIM', 'LCDC1_JDI_B1', 'LCDC1_8080_CS', 'NONE', 'DBG_DO1'],
  ['GPIO', 'LCDC1_SPI_CLK', 'NONE', 'I2S1_SDI', 'I2C/UART', 'TIM', 'LCDC1_JDI_G1', 'LCDC1_8080_WR', 'NONE', 'DBG_DO2'],
  ['GPIO', 'LCDC1_SPI_DIO0', 'NONE', 'I2S1_BCK', 'I2C/UART', 'TIM', 'LCDC1_JDI_R1', 'LCDC1_8080_RD', 'NONE', 'DBG_DO3'],
  [
    'GPIO',
    'LCDC1_SPI_DIO1',
    'NONE',
    'I2S1_LRCK',
    'I2C/UART',
    'TIM',
    'LCDC1_JDI_HXT',
    'LCDC1_8080_DC',
    'NONE',
    'DBG_DO4',
  ],
  [
    'GPIO',
    'LCDC1_SPI_DIO2',
    'NONE',
    'PDM1_CLK',
    'I2C/UART',
    'TIM',
    'LCDC1_JDI_ENB',
    'LCDC1_8080_DIO0',
    'NONE',
    'DBG_DO5',
  ],
  [
    'GPIO',
    'LCDC1_SPI_DIO3',
    'NONE',
    'PDM1_DATA',
    'I2C/UART',
    'TIM',
    'LCDC1_JDI_VST',
    'LCDC1_8080_DIO1',
    'NONE',
    'DBG_DO6',
  ],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'DBG_DO7'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'AUD_CLK_EXT'],
  ['GPIO', 'MPI2_CS', 'SD1_DIO2', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'MPI2_DIO1', 'SD1_DIO3', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'MPI2_DIO2', 'SD1_CLK', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'MPI2_DIO0', 'SD1_CMD', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'MPI2_CLK', 'SD1_DIO0', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'MPI2_DIO3', 'SD1_DIO1', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'SWDIO', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'SWCLK', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'DBG_CLK'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'NONE', 'PDM1_CLK', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'NONE', 'PDM1_DATA', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'SPI1_DIO', 'I2S1_MCLK', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'SPI1_DI', 'I2S1_SDO', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'SPI1_CLK', 'I2S1_SDI', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'SPI1_CS', 'I2S1_BCK', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'NONE', 'I2S1_LRCK', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'DBG_DO8'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'SPI2_DIO', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'LCDC1_8080_DIO2', 'NONE', 'DBG_DO9'],
  ['GPIO', 'NONE', 'SPI2_DI', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'NONE'],
  ['GPIO', 'NONE', 'SPI2_CLK', 'NONE', 'I2C/UART', 'TIM', 'LCDC1_JDI_VCK', 'LCDC1_8080_DIO3', 'NONE', 'DBG_DO10'],
  ['GPIO', 'NONE', 'SPI2_CS', 'NONE', 'I2C/UART', 'TIM', 'LCDC1_JDI_XRST', 'LCDC1_8080_DIO4', 'NONE', 'DBG_DO11'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'LCDC1_JDI_HCK', 'LCDC1_8080_DIO5', 'NONE', 'DBG_DO12'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'LCDC1_JDI_R2', 'LCDC1_8080_DIO6', 'NONE', 'DBG_DO13'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'LCDC1_JDI_G2', 'LCDC1_8080_DIO7', 'NONE', 'DBG_DO14'],
  ['GPIO', 'NONE', 'NONE', 'NONE', 'I2C/UART', 'TIM', 'NONE', 'NONE', 'NONE', 'DBG_DO15'],
] as const;

const padIndex = (pin: number) => pin.toString().padStart(2, '0');
const padPa = (pinmux: any, pin: number) => pinmux?.[`PAD_PA${padIndex(pin)}`];

class HpsysGpioAnalyzer52 extends RuleBasedAnalyzer {
  constructor() {
    super('SF32LB52X', 'HPSYS_GPIO');
  }

  protected async run(): Promise<void> {
    const hpsysRcc = await this.requirePeripheral('HPSYS_RCC');
    const hpsysCfg = await this.requirePeripheral('HPSYS_CFG');
    const hpsysPinmux = await this.requirePeripheral('HPSYS_PINMUX');
    const hpsysGpio = await this.requirePeripheral('HPSYS_GPIO');
    if (!hpsysRcc || !hpsysCfg || !hpsysPinmux || !hpsysGpio) {
      return;
    }

    if (hpsysRcc.ENR2?.GPIO1 !== 1) {
      this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR2_GPIO1置1以开启模块时钟');
    }
    if (hpsysRcc.RSTR2?.GPIO1 !== 0) {
      this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR2_GPIO1置0以释放模块复位');
    }
    if (hpsysRcc.ENR1?.PINMUX1 !== 1) {
      this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR1_PINMUX1置1以开启模块时钟');
    }
    if (hpsysRcc.RSTR1?.PINMUX1 !== 0) {
      this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_PINMUX1置0以释放模块复位');
    }
    if (hpsysRcc.ENR1?.SYSCFG1 !== 1) {
      this.error(`${this.peripheralName}模块时钟未开启`, '需将HPSYS_RCC的ESR1_SYSCFG1置1以开启模块时钟');
    }
    if (hpsysRcc.RSTR1?.SYSCFG1 !== 0) {
      this.error(`${this.peripheralName}模块被复位`, '需将HPSYS_RCC的RSTR1_SYSCFG1置0以释放模块复位');
    }

    for (let pin = 0; pin <= 44; pin += 1) {
      const pad = padPa(hpsysPinmux, pin);
      const pinFsel = pad?.FSEL ?? 0;
      const pinIe = pad?.IE ?? 0;
      const pinPe = pad?.PE ?? 0;
      const pinPs = pad?.PS ?? 0;
      const pinFunction: string = pinFsel > 9 ? 'NONE' : (PA_PINMUX[pin]?.[pinFsel] ?? 'NONE');

      const pinOe = pin < 32 ? (hpsysGpio.DOER0?.value >> pin) & 1 : (hpsysGpio.DOER1?.value >> (pin - 32)) & 1;
      const pinOut = pin < 32 ? (hpsysGpio.DOR0?.value >> pin) & 1 : (hpsysGpio.DOR1?.value >> (pin - 32)) & 1;
      const pinIntEn = pin < 32 ? (hpsysGpio.IER0?.value >> pin) & 1 : (hpsysGpio.IER1?.value >> (pin - 32)) & 1;
      const pinIntType = pin < 32 ? (hpsysGpio.ITR0?.value >> pin) & 1 : (hpsysGpio.ITR1?.value >> (pin - 32)) & 1;
      const pinIntPolH = pin < 32 ? (hpsysGpio.IPHR0?.value >> pin) & 1 : (hpsysGpio.IPHR1?.value >> (pin - 32)) & 1;
      const pinIntPolL = pin < 32 ? (hpsysGpio.IPLR0?.value >> pin) & 1 : (hpsysGpio.IPLR1?.value >> (pin - 32)) & 1;
      const pinIn = pinIe
        ? pin < 32
          ? (hpsysGpio.DIR0?.value >> pin) & 1
          : (hpsysGpio.DIR1?.value >> (pin - 32)) & 1
        : 0;

      let resolvedFunction = pinFunction;
      if (pinFunction === 'I2C/UART') {
        const mappings = this.checkI2cUart(hpsysCfg, pin);
        if (mappings.length === 0) {
          this.error(
            `PA${padIndex(pin)}映射到I2C/UART，但是没有指定具体功能`,
            `请在HPSYS_CFG中将对应功能的PINR指定到PA${padIndex(pin)}上`
          );
        } else if (mappings.length > 1) {
          this.error(
            `PA${padIndex(pin)}映射到如下多个功能上:${mappings.join(',')}`,
            '请在HPSYS_CFG中将多余功能的PINR映射到其它IO上，或者不需要映射时设置为0x3f'
          );
        } else {
          resolvedFunction = mappings[0];
        }
      } else if (pinFunction === 'TIM') {
        const mappings = this.checkTim(hpsysCfg, pin);
        if (mappings.length === 0) {
          this.error(
            `PA${padIndex(pin)}映射到TIM，但是没有指定具体功能`,
            `请在HPSYS_CFG中将对应功能的PINR指定到PA${padIndex(pin)}上`
          );
        } else if (mappings.length > 1) {
          this.error(
            `PA${padIndex(pin)}映射到如下多个功能上:${mappings.join(',')}`,
            '请在HPSYS_CFG中将多余功能的PINR映射到其它IO上，或者不需要映射时设置为0x3f'
          );
        } else {
          resolvedFunction = mappings[0];
        }
      }

      this.checkPull(resolvedFunction, pinPe, pinPs, pinOe, pinOut);

      if (this.requireIe(resolvedFunction) && !pinIe) {
        this.error(`${resolvedFunction}功能需要获取输入信号，但是输入使能未开启`, '请在HPSYS_PINMUX中将IE置1');
      }
      if (!pinIe && pinIntEn) {
        this.error('输入关闭，无法触发中断', '如需触发中断，请在HPSYS_PINMUX中将IE置1');
      }
      if (pinOe && pinIntEn) {
        this.error('GPIO输出时，无法触发中断', '如需触发中断，请在HPSYS_GPIO中将对应OE置0');
      }
      if (pinIntEn && !pinIntType && pinIntPolH && pinIntPolL) {
        this.warn('所有电平都会触发中断', '请确认中断需求');
      }
      if (pinIntEn && !pinIntPolH && !pinIntPolL) {
        this.warn('没有配置中断触发的电平或边沿，无法触发中断', '请确认中断需求');
      }
      if (pin === 34 && pinIe && pinIn) {
        this.warn('PA34输入为高,持续约10秒会复位芯片', '请确认PA34连接');
      } else if (pin === 34 && pinOe && pinOut) {
        this.error('PA34输出为高,持续约10秒会复位芯片', 'PA34应避免作为输出IO');
      }
    }
  }

  private checkI2cUart(hpsysCfg: any, pinNum: number): string[] {
    const pinmux: Record<string, number> = {
      I2C1_SDA: hpsysCfg.I2C1_PINR?.SDA_PIN,
      I2C1_SCL: hpsysCfg.I2C1_PINR?.SCL_PIN,
      I2C2_SDA: hpsysCfg.I2C2_PINR?.SDA_PIN,
      I2C2_SCL: hpsysCfg.I2C2_PINR?.SCL_PIN,
      I2C3_SDA: hpsysCfg.I2C3_PINR?.SDA_PIN,
      I2C3_SCL: hpsysCfg.I2C3_PINR?.SCL_PIN,
      I2C4_SDA: hpsysCfg.I2C4_PINR?.SDA_PIN,
      I2C4_SCL: hpsysCfg.I2C4_PINR?.SCL_PIN,
      USART1_CTS: hpsysCfg.USART1_PINR?.CTS_PIN,
      USART1_RTS: hpsysCfg.USART1_PINR?.RTS_PIN,
      USART1_RXD: hpsysCfg.USART1_PINR?.RXD_PIN,
      USART1_TXD: hpsysCfg.USART1_PINR?.TXD_PIN,
      USART2_CTS: hpsysCfg.USART2_PINR?.CTS_PIN,
      USART2_RTS: hpsysCfg.USART2_PINR?.RTS_PIN,
      USART2_RXD: hpsysCfg.USART2_PINR?.RXD_PIN,
      USART2_TXD: hpsysCfg.USART2_PINR?.TXD_PIN,
      USART3_CTS: hpsysCfg.USART3_PINR?.CTS_PIN,
      USART3_RTS: hpsysCfg.USART3_PINR?.RTS_PIN,
      USART3_RXD: hpsysCfg.USART3_PINR?.RXD_PIN,
      USART3_TXD: hpsysCfg.USART3_PINR?.TXD_PIN,
    };
    return Object.entries(pinmux)
      .filter(([, value]) => value === pinNum)
      .map(([key]) => key);
  }

  private checkTim(hpsysCfg: any, pinNum: number): string[] {
    const pinmux: Record<string, number> = {
      GPTIM1_CH1: hpsysCfg.GPTIM1_PINR?.CH1_PIN,
      GPTIM1_CH2: hpsysCfg.GPTIM1_PINR?.CH2_PIN,
      GPTIM1_CH3: hpsysCfg.GPTIM1_PINR?.CH3_PIN,
      GPTIM1_CH4: hpsysCfg.GPTIM1_PINR?.CH4_PIN,
      GPTIM1_ETR: hpsysCfg.ETR_PINR?.ETR1_PIN,
      GPTIM2_CH1: hpsysCfg.GPTIM2_PINR?.CH1_PIN,
      GPTIM2_CH2: hpsysCfg.GPTIM2_PINR?.CH2_PIN,
      GPTIM2_CH3: hpsysCfg.GPTIM2_PINR?.CH3_PIN,
      GPTIM2_CH4: hpsysCfg.GPTIM2_PINR?.CH4_PIN,
      GPTIM2_ETR: hpsysCfg.ETR_PINR?.ETR2_PIN,
      LPTIM1_IN: hpsysCfg.LPTIM1_PINR?.IN_PIN,
      LPTIM1_OUT: hpsysCfg.LPTIM1_PINR?.OUT_PIN,
      LPTIM1_ETR: hpsysCfg.LPTIM1_PINR?.ETR_PIN,
      LPTIM2_IN: hpsysCfg.LPTIM2_PINR?.IN_PIN,
      LPTIM2_OUT: hpsysCfg.LPTIM2_PINR?.OUT_PIN,
      LPTIM2_ETR: hpsysCfg.LPTIM2_PINR?.ETR_PIN,
      ATIM1_CH1: hpsysCfg.ATIM1_PINR1?.CH1_PIN,
      ATIM1_CH2: hpsysCfg.ATIM1_PINR1?.CH2_PIN,
      ATIM1_CH3: hpsysCfg.ATIM1_PINR1?.CH3_PIN,
      ATIM1_CH4: hpsysCfg.ATIM1_PINR1?.CH4_PIN,
      ATIM1_CH1N: hpsysCfg.ATIM1_PINR2?.CH1N_PIN,
      ATIM1_CH2N: hpsysCfg.ATIM1_PINR2?.CH2N_PIN,
      ATIM1_CH3N: hpsysCfg.ATIM1_PINR2?.CH3N_PIN,
      ATIM1_BK: hpsysCfg.ATIM1_PINR3?.BK_PIN,
      ATIM1_BK2: hpsysCfg.ATIM1_PINR3?.BK2_PIN,
      ATIM1_ETR: hpsysCfg.ATIM1_PINR3?.ETR_PIN,
      BT_ACTIVE: hpsysCfg.PTA_PINR?.BT_ACTIVE,
      BT_COLLISION: hpsysCfg.PTA_PINR?.BT_COLLISION,
      BT_PRIORITY: hpsysCfg.PTA_PINR?.BT_PRIORITY,
      WLAN_ACTIVE: hpsysCfg.PTA_PINR?.WLAN_ACTIVE,
    };
    return Object.entries(pinmux)
      .filter(([, value]) => value === pinNum)
      .map(([key]) => key);
  }

  private checkPull(pinFunction: string, pinPe: number, pinPs: number, pinOe: number, pinOut: number): void {
    const pullState = pinPe ? (pinPs ? '内部上拉' : '内部下拉') : '无上下拉';
    const outputState = pinOe ? (pinOut ? '输出为高' : '输出为低') : '输出关闭';

    if (pinFunction === 'GPIO') {
      if (outputState === '输出为高' && pullState === '内部下拉') {
        this.error('IO输出为高但是内部下拉电阻开启，会产生漏电', '可改为上拉或关闭上下拉');
      }
      if (outputState === '输出为低' && pullState === '内部上拉') {
        this.error('IO输出为低但是内部上拉电阻开启，会产生漏电', '可改为下拉或关闭上下拉');
      }
      return;
    }

    const highDefaultFunctions = [
      /UART.*TXD/,
      /UART.*RXD/,
      /^I2C/,
      /^LCDC1_SPI_CS$/,
      /^MPI.*CS$/,
      /^SD.*CMD$/,
      /^SPI.*CS$/,
    ];
    if (highDefaultFunctions.some(pattern => pattern.test(pinFunction)) && pullState === '内部下拉') {
      this.error(`${pinFunction}默认为高电平，当内部有下拉电阻时会产生漏电`, '可改为上拉或关闭上下拉');
    }
  }

  private requireIe(pinFunction: string): boolean {
    return (
      pinFunction.startsWith('I2C') ||
      /UART.*RXD/.test(pinFunction) ||
      /UART.*CTS/.test(pinFunction) ||
      (/SPI/.test(pinFunction) && /DI$/.test(pinFunction)) ||
      (/MPI/.test(pinFunction) && /DIO/.test(pinFunction)) ||
      (/LCDC/.test(pinFunction) && /DIO/.test(pinFunction)) ||
      (/LCDC/.test(pinFunction) && /TE$/.test(pinFunction)) ||
      (/I2S/.test(pinFunction) && /SDI$/.test(pinFunction)) ||
      (/PDM/.test(pinFunction) && /DATA$/.test(pinFunction)) ||
      (/SD/.test(pinFunction) && /CMD/.test(pinFunction)) ||
      (/SD/.test(pinFunction) && /DIO/.test(pinFunction))
    );
  }
}

export function registerSf32lb52xGpioAnalyzers(runtime: PeripheralAnalysisRuntime): void {
  registerAnalyzers(runtime, [new HpsysGpioAnalyzer52()]);
}
