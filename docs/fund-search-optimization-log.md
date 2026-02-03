# 基金搜索功能优化日志

## 📅 2026-02-03 优化更新

### 1. 🔍 搜索逻辑优化

#### 问题
- 后端 API 使用 `fund_open_fund_info_em` 返回的是特定基金的历史净值数据，导致搜索功能报错 "Cannot find code/name columns"。
- 旧的 API 可能只返回部分基金或需要特定参数。

#### 解决方案
- 替换为 **`ak.fund_name_em()`** 接口。
- 该接口返回全市场所有基金的代码和名称列表。
- 后端添加了自动列名检测逻辑，增强了健壮性。

### 2. ⚡️ 防抖与性能优化

#### 问题
- 用户输入时立即触发 loading 状态，导致 UI 闪烁。
- 300ms 防抖时间较短，容易触发不必要的请求。
- 快速输入时可能产生竞态条件（Race Condition），即旧请求比新请求晚返回。

#### 解决方案
- **防抖时间增加至 500ms**：给予用户更充分的输入时间。
- **延迟 Loading**：Loading 状态只在防抖结束后、请求发起前才显示。
- **请求取消 (AbortController)**：每次新搜索触发时，自动取消上一次未完成的请求，确保结果始终准确对应当前输入。

```typescript
// 核心逻辑
const controller = new AbortController();
searchTimeoutRef.current = setTimeout(async () => {
    setIsLoading(true); // 延迟显示 Loading
    try {
        const response = await fetch(url, { signal: controller.signal });
        // ...
    }
}, 500); // 500ms 延迟
```

### 3. 🎨 交互与 UI 修复

#### 问题
- 搜索下拉框被父容器截断（因为 `overflow: hidden`）。
- 用户在搜索中按 `Enter` 键会误触发"直接添加代码"操作。
- 搜索无结果时反馈不明确。

#### 解决方案
- **样式修复**：将 `Card` 组件的样式覆盖为 `overflow-visible`，确保下拉菜单完整显示。
- **Enter 键逻辑优化**：
  - 加载中 -> 忽略 Enter。
  - 有结果 -> 默认选中第一个。
  - 无结果且未加载 -> 才允许直接添加。
- **状态反馈**：添加了明确的 Loading 转圈动画和无结果提示。

---

## ✅ 验证清单

1. **全市场搜索**：输入 "004320" 或 "易方达" 均能搜到结果。
2. **防抖体验**：快速输入时不会频繁闪烁，停止输入 0.5秒后才开始搜索。
3. **下拉显示**：下拉菜单悬浮在卡片上方，不被遮挡。
4. **键盘操作**：Enter 键行为符合直觉，不会误操作。
