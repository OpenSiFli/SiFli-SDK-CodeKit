import daisyui from 'daisyui';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{vue,js,ts,jsx,tsx}",
    "./src/**/*.html"
  ],
  theme: {
    extend: {
      colors: {
        // VS Code 主题变量映射
        vscode: {
          foreground: 'var(--vscode-foreground)',
          background: 'var(--vscode-editor-background)',
          'button-background': 'var(--vscode-button-background)',
          'button-foreground': 'var(--vscode-button-foreground)',
          'button-hover': 'var(--vscode-button-hoverBackground)',
          'input-background': 'var(--vscode-input-background)',
          'input-foreground': 'var(--vscode-input-foreground)',
          'input-border': 'var(--vscode-input-border)',
          'input-placeholder': 'var(--vscode-input-placeholderForeground)',
          'panel-border': 'var(--vscode-panel-border)',
          'focus-border': 'var(--vscode-focusBorder)'
        }
      },
      fontFamily: {
        vscode: ['var(--vscode-font-family)', 'ui-sans-serif', 'system-ui']
      }
    },
  },
  plugins: [daisyui],
  daisyui: {
    themes: ["dark"], // 使用简单的暗色主题
    base: false,
    styled: true,
    utils: true
  }
}
