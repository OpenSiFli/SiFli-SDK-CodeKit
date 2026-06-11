export type SftoolStubOptions = {
  stubPath?: string;
  stubConfigPath?: string;
};

export function quoteSftoolCommandArg(value: string, platform: NodeJS.Platform = process.platform): string {
  return `"${escapeSftoolDoubleQuotedArg(value, platform)}"`;
}

export function buildSftoolStubArgs(options: SftoolStubOptions, platform: NodeJS.Platform = process.platform): string {
  const args: string[] = [];
  const stubPath = options.stubPath?.trim();
  const stubConfigPath = options.stubConfigPath?.trim();

  if (stubPath) {
    args.push('--stub', quoteSftoolCommandArg(stubPath, platform));
  }

  if (stubConfigPath) {
    args.push('--stub-config', quoteSftoolCommandArg(stubConfigPath, platform));
  }

  return args.join(' ');
}

function escapeSftoolDoubleQuotedArg(value: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return value.replace(/[`"$]/g, match => `\`${match}`);
  }

  return value.replace(/(["\\$`])/g, '\\$1');
}
