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

export enum NumberFormat {
  Auto = 0,
  Hexadecimal,
  Decimal,
  Binary,
}

export interface NodeSetting {
  node: string;
  expanded?: boolean;
  format?: NumberFormat;
  pinned?: boolean;
}

export function toStringDecHexOctBin(val: number /* should be an integer*/): string {
  if (Number.isNaN(val)) {
    return 'NaN: Not a number';
  }
  if (!Number.isSafeInteger(val)) {
    // TODO: Handle big nums. We eventually have to. We need to use bigint as javascript
    // looses precision beyond 53 bits
    return 'Big Num: ' + val.toString() + '\nother-radix values not yet available. Sorry';
  }

  let ret = `dec: ${val}`;
  if (val < 0) {
    val = -val;
    val = (~(val >>> 0) + 1) >>> 0;
  }
  let str = val.toString(16);
  str = '0x' + '0'.repeat(Math.max(0, 8 - str.length)) + str;
  ret += `\nhex: ${str}`;

  str = val.toString(8);
  str = '0'.repeat(Math.max(0, 12 - str.length)) + str;
  ret += `\noct: ${str}`;

  str = val.toString(2);
  str = '0'.repeat(Math.max(0, 32 - str.length)) + str;
  let tmp = '';
  while (true) {
    if (str.length <= 8) {
      tmp = str + tmp;
      break;
    }
    tmp = ' ' + str.slice(-8) + tmp;
    str = str.slice(0, -8);
  }
  ret += `\nbin: ${tmp}`;
  return ret;
}
