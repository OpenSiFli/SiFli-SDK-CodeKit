# 文档构建流程

## 环境准备
- `Node.js`，选择LTS版本
- `pnpm`，选择最新版

## Node.js安装

[Node.js官网](https://nodejs.org/en/download/)下载LTS版本，安装完成后在终端中执行以下命令检查是否安装成功：

```bash
node -v
```

如果输出版本号，则表示安装成功。

## pnpm安装
在终端中执行以下命令安装`pnpm`：

```bash
npm install -g pnpm
```

如果输出版本号，则表示安装成功。

## 安装依赖

在终端中切换路径到docs目录下之后，执行以下命令安装依赖：

```bash
pnpm install
```

## 预览结果

在终端中执行以下命令预览结果：

```bash
pnpm docs:dev
```
如果输出以下信息，则表示预览成功：

```bash
✔ Initializing and preparing data - done in 127ms

  vite v6.3.5 dev server running at:

  ➜  Local:   http://localhost:8080/projects/sifli-sdk-codekit/
  ➜  Network: http://192.168.1.216:8080/projects/sifli-sdk-codekit/
  ➜  Network: http://169.254.199.230:8080/projects/sifli-sdk-codekit/
```

在浏览器中打开`Local`地址即可预览结果。

