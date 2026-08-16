# dsh-plugin-pin-window

DeepSeek Harness 网页版插件：在每条助手消息下方的操作条里新增一个 **固定消息（Pin）** 按钮。点击后打开一个只读的新窗口，只展示被选中的那条消息（及其所在的完整 turn），没有任何其他功能。

## 效果

- 消息操作条（复制 / 分支 / 反馈 那一排）新增一个外链图标按钮
- 点击后弹出新窗口：
  - **像素级还原原版渲染**：直接克隆当前页面已渲染好的消息 DOM，并注入原版样式表（壳层 CSS + 插件注入的 CSS）
  - 完整展示该 turn 的内容：正文 Markdown（表格 / 代码高亮 / 文件提及等原样）、思考过程、工具调用卡片、产出文件行
  - 动作条（复制 / 分支 / 反馈 / pin）会被剥离
  - 折叠行默认折叠，点击可展开 / 收起；工具行折叠态显示原版工具图标，悬停显示小箭头，展开后显示箭头
  - 文件提及按原版样式显示
  - 跟随当前深色 / 浅色主题
- 纯展示：没有复制、编辑、存储、打开文件等交互

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

## 已知限制

- 点击 pin 时，原页面会**短暂闪烁一下**（折叠行会快速展开再收起）。这是为了在克隆前让 React 把折叠内容渲染出来，属预期行为。
- 克隆的是点击那一刻的页面状态；如果未来 dsh 前端 DOM 结构大幅调整，可能需要同步适配。
- 新窗口为纯展示：原版里的打开文件、Inspect、复制等按钮不会执行。

## 开发

源码在 `src/`，浏览器端入口是 `src/client/index.ts`。当前仓库直接使用预构建的 `lib/client.js`；如需二次开发，建议在 DeepSeek Harness 仓库的 `packages/client/ui-message-pin` 内开发调试，构建后把 `lib/client.js` 与 `lib/index.js` 同步回本仓库。

核心实现：

- 通过 `snapshot.chat.locations.getTurn(turn)` 拿到该 turn 的所有聊天节点 key
- 用 `data-chat-flow-key` 在页面上定位这些节点并克隆 DOM
- 克隆前程序化展开折叠行，克隆后再还原原页面状态
- popup 注入原版 `<link>` 样式表与所有 `<style>` 插件样式，并带一个轻量脚本恢复折叠态与图标

## License

MIT
