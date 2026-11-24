# 素手归原 · 身心自愈全能创作平台

> 禅为根 · 拍为用 · 生活为体 · 国学为魂

一个独立的 AI 内容创作工作台，为「素手归原 / 黄帝内经古法拍打」垂直领域设计。

- **产出类型**：小红书图文、视频号短文案、口播稿、海报短句、禅意诗词、拍摄脚本、**直播分享主题**
- **三大知识库**：《黄帝内经》经络气血 / 素手归原古法拍打 / 道德经·周易·禅修（另含生活养生、家庭亲子辅助库）
- **使用方式**：勾选文化维度 → 自动检索知识片段 → 柔和融入文案；每次产出 4-5 个选题 + 1 篇完整成品
- **双引擎**：魔搭（Qwen3.8-Flash-Next 首选）/ 智谱（glm-4-flash），自动模式失败回退

## 一、Web 版（服务端令牌）

```bash
# 1. 配置密钥（环境变量）
export MODELSCOPE_TOKEN="ms-你的令牌"
export ZHIPU_API_KEY="智谱的KEY"
export ACCESS_CODE="你自己的访问口令"
# Windows PowerShell:
# $env:MODELSCOPE_TOKEN="ms-..."; $env:ZHIPU_API_KEY="..."; $env:ACCESS_CODE="..."

# 2. 启动
node server.js
# 打开 http://127.0.0.1:3000
```

零第三方依赖，Node 18+ 即可。监听 `PORT`、绑定 `0.0.0.0`，可直接部署到
Render / Railway / 腾讯云 / 自有服务器（Build 命令 `npm start`，填三个环境变量）。

## 二、Android APK（令牌内置，装了就能用）

`android/` 是完整 Android 工程：WebView 加载 `assets/www` 内置界面，
Java 层通过 `HttpURLConnection` **直接调用魔搭 / 智谱接口**（JS Bridge 通信），
不依赖任何在线站点。

1. 打开 `android/src/com/sushou/guiyuan/MainActivity.java`，把两个 `YOUR_*` 占位符换成你自己的令牌。
2. 安装 JDK 17+ 与 Android SDK（`platforms;android-34`、`build-tools;34.0.0`）。
3. 设置 `JAVA_HOME`、`ANDROID_HOME`，执行：
   ```bash
   cd android && bash build.sh
   ```
4. 产物 `android/app-release.apk`，签名后可安装。

> ⚠️ **APK 内的令牌可以被反编译提取**。只放入你愿意承担风险的令牌，
> 建议专门申请一个限额子账号/令牌，并定期轮换。不要把公开分发的 APK 当成密钥保险箱。

> Windows 提示：项目路径请避开中文与空格（aapt2 对中文路径支持不佳）。

## 安全说明

- Web 版令牌只存在服务端，**绝不下发到浏览器**；浏览器只保存访问口令（localStorage）。
- 访问口令用于防止令牌被当公共代理滥用，请务必改成你自己的口令。
- 智谱 / 魔搭免费额度有限，请勿公开分享链接。
- **任何出现在聊天记录、截图、公开仓库里的令牌都应视为已泄露，尽快轮换。**

## 目录

```
.
├── server.js          # HTTP 服务 + 访问口令门禁 + 静态托管
├── llm.js             # 双引擎（魔搭 / 智谱）+ 自动回退
├── secrets.js         # 密钥读取（环境变量，模板已提交）
├── shared/            # 知识库 + 下拉配置 + prompt 引擎
├── web/               # Web 版前端工作台
└── android/           # APK 工程（内置界面 + 原生直连 AI 接口）
```

## 内容安全

内置合规底线：不玄学神化、不做医疗承诺、保留拍打禁忌提示
（孕产 / 出血倾向 / 严重慢病 / 皮肤破损）、儿童老人手法轻柔、只给场景不给判决。
