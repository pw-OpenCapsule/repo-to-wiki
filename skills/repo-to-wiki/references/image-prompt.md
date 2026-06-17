# 固定生图提示词：烂图风 + 内容正确

插图统一走 `chatgpt-imagegen`。**风格是固定的、内容是每张不同的。** 铁律：**烂的是风格，内容质量必须有。**

## 风格原话（产品 owner 定的，照这个意图）

> 使用最大的色块、涂鸦感更重，尽可能弄得惨兮兮的。用白底，做得像是在老式电脑画图程序里拿鼠标画出来的。要隐约有点像，但又不太像，像是对上了又哪哪都不对，别扭得让人迷惑，呈现那种低清、一像素一像素蹭出来的感觉，突出它到底有多离谱地烂。算了，随便吧，你想怎么画就怎么画，记住烂的是风格，内容质量还是要有的。

## 实测能出「丑但对」的英文 STYLE 前缀（直接用）

```
Deliberately UGLY, low-resolution, mouse-drawn-in-an-old-MS-Paint look on a plain WHITE background. Use the BIGGEST crude flat COLOR blocks, heavy childish scribble/graffiti crayon fills spilling outside the lines, wobbly shaky hand outlines, jagged one-pixel-at-a-time aliased edges, wonky lopsided shapes — pathetic and absurdly badly drawn, almost-recognizable but everything slightly off and confusing. BUT the CONTENT must be CORRECT: the boxes, arrows, order and short ENGLISH labels must be accurate and readable. Ugly colorful style, correct content.
```

## 调用范式

```bash
IMG=/path/to/chatgpt-imagegen   # 见 chatgpt-imagegen skill 的安装路径
"$IMG" "$STYLE Subject: <这张图要画的正确结构，用短英文标签描述框/箭头/顺序>" \
  -o <repo>/.understand-anything/wiki-assets/<name>.png --size 1536x1024 --quiet
```

- 每张图先写 `$STYLE`，再接 `Subject:` 描述**正确的结构**（哪些框、什么标签、箭头怎么连、顺序）。
- 标签用**短英文**（模型对中文渲染容易糊）。结构对、标签清，比「画得糊」更重要。
- 横图用 `--size 1536x1024`，方图 `1024x1024`。
- web backend 不耗 Codex 额度（借登录的 ChatGPT），并发=1，会排队；批量可 `--backend codex`。

## 反例（别犯）

- ❌ 提示词只写风格、不写内容 → 出一个孤零零的地球/苦瓜脸浏览器，好看但啥也不解释。
- ❌ 为了「更烂」把分辨率/糊度拉满 → 标签读不出来，图就废了。
- ✅ 风格拉满的同时，框、箭头、顺序、标签都对得上。

## 每张图画什么（按页配）

- hero（索引页）：项目全貌或「从一团乱 → 一张地图」的转变。
- 架构页：分层 stack（按真实层名，从上到下）。
- 流程页：主链路 flowchart（入口 → ... → 出口，含分叉）。
- 业务页：角色 → 配置 → 系统 → 多目标 的业务流。
- 其它页：该页主题的正确示意（如算法分流、KV 结构、模板选择）。
