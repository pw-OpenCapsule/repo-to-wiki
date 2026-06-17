# Changelog

遵循语义化版本。改动必须同步 bump `skills/repo-to-wiki/VERSION` + 这里加一条 + 打 tag。

## 1.0.0 — 2026-06-17
首个发布版本。
- 一条链路：understand-anything → codegraph → code-search → domain-analyzer → chatgpt-imagegen → lark-doc/wiki + portwind-wiki。
- 两种用法：Skill 模式 / Workflow 模式（`repo-to-wiki.workflow.js`，子页「写内容→出图」并行 pipeline + 顺序发布）。
- 增量/幂等：图已存在跳过、发布前 find-or-create 不建重复页、`args.only` 只补指定页、`args.force` 强制重做。
- 固定生图风格（烂图风 + 内容正确）内嵌。
- 版本自检：使用前比对远端 VERSION，落后则提示更新。
