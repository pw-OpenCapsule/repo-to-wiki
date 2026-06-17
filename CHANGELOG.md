# Changelog

遵循语义化版本。改动必须同步 bump `skills/repo-to-wiki/VERSION` + 这里加一条 + 打 tag。

## 1.2.2 — 2026-06-17
- **修复 Workflow 模式始终「missing args」**：args 经 Workflow 工具传到脚本时是 JSON 字符串（不是对象），脚本现先 `JSON.parse` 再读字段。这是 workflow 模式之前根本跑不起来的真因（探针实测 typeof args === "string"）。
- missing-args 报错带上实际收到的内容，便于排查。

## 1.2.1 — 2026-06-17
- 更新指引改用官方 `npx skills update -g`（更新全部）；`npx skills add` 降为「只更这个」的备选。

## 1.2.0 — 2026-06-17
- **默认改为 Workflow 模式**：被调用时默认凑齐 args 后调用 Workflow 工具，除非用户明确要手动/逐步才回退 Skill 模式。Skill 模式降级为显式回退。

## 1.1.0 — 2026-06-17
- Workflow 模式说明改强硬：明确「唯一职责是调用 Workflow 工具」、凑齐 3 个 args 后立即调用，别手动跑整条链路（修复「workflow 模式没启动」）。
- README 配图（assets/hero.png，固定烂图风）。

## 1.0.0 — 2026-06-17
首个发布版本。
- 一条链路：understand-anything → codegraph → code-search → domain-analyzer → chatgpt-imagegen → lark-doc/wiki + portwind-wiki。
- 两种用法：Skill 模式 / Workflow 模式（`repo-to-wiki.workflow.js`，子页「写内容→出图」并行 pipeline + 顺序发布）。
- 增量/幂等：图已存在跳过、发布前 find-or-create 不建重复页、`args.only` 只补指定页、`args.force` 强制重做。
- 固定生图风格（烂图风 + 内容正确）内嵌。
- 版本自检：使用前比对远端 VERSION，落后则提示更新。
