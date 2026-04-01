/*
 * Copyright 2017-2019 Marcel Ball
 * https://github.com/Marus/cortex-debug
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without
 * limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
 * Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 * TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

export class AddrRange {
  constructor(
    public base: number,
    public length: number
  ) {}

  /** return next address after this addr. range */
  public nxtAddr(): number {
    return this.base + this.length;
  }

  /** return last address in this range */
  public endAddr(): number {
    return this.nxtAddr() - 1;
  }
}

export class AddressRangesUtils {
  /**
   * Returns a set of address ranges that have 0 < length <= maxBytes
   *
   * @param ranges array of ranges to check an split
   * @param maxBytes limit of each range
   * @param dbgMsg To output debug messages -- name of address space
   * @param dbgLen To output debug messages -- total length of addr space
   */
  public static splitIntoChunks(ranges: AddrRange[], maxBytes: number, _dbgMsg = '', _dbgLen = 0): AddrRange[] {
    const newRanges = new Array<AddrRange>();
    for (const r of ranges) {
      while (r.length > maxBytes) {
        newRanges.push(new AddrRange(r.base, maxBytes));
        r.base += maxBytes;
        r.length -= maxBytes;
      }
      if (r.length > 0) {
        // Watch out, can be negative
        newRanges.push(r);
      }
    }
    return newRanges;
  }
}
