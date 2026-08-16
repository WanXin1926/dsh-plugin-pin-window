# dsh-plugin-pin-window

DeepSeek Harness 网页版插件：在每条助手消息下方的操作条里新增一个 **固定消息（Pin）** 按钮。点击后打开一个只读的新窗口，只展示被选中的那条消息，没有任何其他功能。

## 效果

- 消息操作条（复制 / 分支 / 反馈 那一排）新增一个外链图标按钮
- 点击后弹出新窗口：
  - 只渲染该条助手消息的正文（支持常用 Markdown：标题、列表、有序列表、引用、代码块、行内代码、加粗、斜体、链接）
  - 思考过程默认折叠
  - 工具调用以只读 `<pre>` 展示
  - 图片显示占位提示
  - 跟随当前深色 / 浅色主题
- 纯展示：没有复制、编辑、存储等任何交互

## 安装

### 从 GitHub 安装（推荐）

```bash
dsh plugin --profile web add git+https://github.com/WanXin1926/dsh-plugin-pin-window.git
```

然后重启 `dsh web`，刷新页面即可。

### 从本地路径安装

```bash
dsh plugin --profile web add ../dsh-plugin-pin-window
```

### 从 npm 安装（如果已发布）

```bash
dsh plugin --profile web add dsh-plugin-pin-window
```

> 说明：`lib/` 已预构建并随仓库发布，插件**无需安装依赖或构建**即可使用。

## 卸载

```bash
dsh plugin --profile web remove dsh-plugin-pin-window
```

或者直接编辑 `$DSH_HOME/profiles/web/package.json`，从 `dsh.profile.bundles` 里移除 `dsh-plugin-pin-window`。

## 常见问题

- **看不到按钮**：安装后需要重启 `dsh web`，然后强制刷新页面（Ctrl+F5）。
- **如果之前手动往 `$DSH_HOME/profiles/web/cordis.patch.yml` 里加过 `ui-message-pin` 行**：请先删掉那一行，否则会出现两个 pin 按钮。
- **按钮位置**：DeepSeek Harness 的消息操作条只存在于助手消息下方，用户消息下方没有可挂载的槽位，所以按钮只出现在助手消息上。

## 开发

源码在 `src/`，浏览器端入口是 `src/client/index.ts`。当前仓库直接使用预构建的 `lib/client.js`；如需二次开发，建议在 DeepSeek Harness 仓库的 `packages/client/ui-message-pin` 内开发调试，构建后把 `lib/client.js` 与 `lib/index.js` 同步回本仓库。

## License

MIT
