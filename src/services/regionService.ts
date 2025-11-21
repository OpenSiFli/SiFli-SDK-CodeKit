import axios from 'axios';
import { LogService } from './logService';

/**
 * 负责检测用户所在区域的服务（目前仅用于判断是否在中国大陆，以便选择合适的 pip 镜像等）。
 */
export class RegionService {
  private static instance: RegionService;
  private logService: LogService;
  private isInChina?: boolean;
  private detectionPromise?: Promise<boolean>;

  private constructor() {
    this.logService = LogService.getInstance();
  }

  public static getInstance(): RegionService {
    if (!RegionService.instance) {
      RegionService.instance = new RegionService();
    }
    return RegionService.instance;
  }

  /**
   * 预先触发一次区域检测（不阻塞调用方）
   */
  public prewarm(): void {
    void this.isUserInChina();
  }

  /**
   * 判断用户是否在中国大陆。失败时默认返回 false。
   */
  public async isUserInChina(): Promise<boolean> {
    if (this.isInChina !== undefined) {
      return this.isInChina;
    }

    if (!this.detectionPromise) {
      this.detectionPromise = this.detectRegion();
    }

    try {
      this.isInChina = await this.detectionPromise;
      return this.isInChina;
    } finally {
      this.detectionPromise = undefined;
    }
  }

  private async detectRegion(): Promise<boolean> {
    try {
      const resp = await axios.get('https://ipinfo.io/json', { timeout: 3000 });
      const isCN = resp.data?.country === 'CN';
      this.logService.info(`Region detection: ${isCN ? 'CN (use mirror)' : 'non-CN (default)'}`);
      return isCN;
    } catch (err) {
      this.logService.warn('Region detection failed; defaulting to non-CN.', err);
      return false;
    }
  }
}
