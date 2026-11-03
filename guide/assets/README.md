# 欢迎卡摄影配图

使用内置 `image_gen.imagegen` 生成一张新的摄影风格日出素材；没有使用外部图库或参考网站的照片。

文件：

- `welcome-photo-source.png`：生成的连续色调原图。
- `welcome-photo-fullcolor.png`：裁为欢迎卡配图所需的 296×284 像素，照片版使用它。
- `welcome-photo-eink.png`：同尺寸四色抖动结果，用于单独提供的设备效果预览。

照片版横稿为上一级 `MoInk-welcome-768x552.png`，页面实际打开的是将横稿顺时针旋转 90° 的 `MoInk-welcome-552x768.png`；四色预览为 `MoInk-welcome-eink-768x552.png`。二维码保持独立的黑白区域，未参加照片裁剪、调色或抖动；90° 旋转不改变像素颜色或尺寸。

## 最终生成提示词

Use case: photorealistic-natural. Create ONE stunning photographic landscape asset for the right-side picture of a Chinese four-color e-ink welcome card. Image only, no card, no frame, no device, no text, no letters, no numbers, no logo, no watermark. Wide landscape approximately 5:4. A cinematic, believable travel photograph: an immense sharply defined snow-capped alpine peak catching fiery red-orange alpenglow at sunrise, a golden-yellow glowing sky with soft layered mist and wispy sunlit clouds, dark charcoal pine forest silhouettes low in the foreground, and a bright winding reflective river leading the eye into the mountains. Natural photographic detail in mountain rock, snow, layered ridges and light, sophisticated vivid but plausible light, dramatic contrast, atmospheric depth, peaceful and breathtaking. Keep the main mountain and luminous river large and readable at thumbnail size around 290 by 240 pixels. Warm palette is important: white snow, near-black shadows, scarlet/coral sunrise and amber/golden yellow light; avoid blue sky, cyan water, green foliage and purple, since it will later be processed with a red-yellow-black-white e-ink photographic dithering algorithm. Render smooth continuous-tone realistic photography, not four-color poster art, not vector illustration, not flat geometric shapes, not pixel art, not halftone or pre-dithered art. Full bleed composition.

## 四色预览处理

直接调用本仓库 `page/index.html` 中已有的 `warmMap`、`quantize`，没有修改设备创作页算法。

在默认配置上覆盖以下参数：`mode: natural`、`dither: stucki`、`ditherStrength: 1`、`space: std`、`autoLevels: 0`、`sharpen: 0.45`。最终四种原生像素通过相邻排列，在视觉上表现照片的明暗、渐变与更多暖色层次。它是屏幕调色板的模拟预览，最终观感仍以真机为准。
