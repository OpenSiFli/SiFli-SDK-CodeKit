declare module "*.json" {
  const value: any;
  export default value;
}

// Vue I18n 类型扩展
declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $t: (key: string, ...args: any[]) => string;
  }
}
