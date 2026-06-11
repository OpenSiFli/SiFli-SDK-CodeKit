export type SftoolStubOptions = {
  stubPath?: string;
  stubConfigPath?: string;
};

export function quoteSftoolCommandArg(value: string): string {
  return `"${value}"`;
}

export function buildSftoolStubArgs(options: SftoolStubOptions): string {
  const args: string[] = [];
  const stubPath = options.stubPath?.trim();
  const stubConfigPath = options.stubConfigPath?.trim();

  if (stubPath) {
    args.push('--stub', quoteSftoolCommandArg(stubPath));
  }

  if (stubConfigPath) {
    args.push('--stub-config', quoteSftoolCommandArg(stubConfigPath));
  }

  return args.join(' ');
}
