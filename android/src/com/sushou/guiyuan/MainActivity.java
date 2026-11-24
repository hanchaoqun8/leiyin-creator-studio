package com.sushou.guiyuan;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * 素手归原创作台 · Android 原生壳
 * - UI：assets/www 内置，完全离线可用（除 AI 调用）
 * - AI：Java 层直接调用魔搭 / 智谱 OpenAI 兼容接口，令牌内置
 */
public class MainActivity extends Activity {

    private WebView web;

    /* 令牌做简单分段，避免被明文一眼搜到（不是强加密） */
    // TODO: 填入你自己的令牌（分段仅为避免明文一眼可见，不是加密）
    private static final String MS_TOKEN = "YOUR_MS_TOKEN_PART1" + "YOUR_MS_TOKEN_PART2";
    private static final String ZP_TOKEN = "YOUR_ZHIPU_KEY_PART1" + "YOUR_ZHIPU_KEY_PART2";

    private static final String MS_URL = "https://api-inference.modelscope.cn/v1/chat/completions";
    private static final String ZP_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

    // 智谱实测：flash 系列为非推理模型，正文稳定；4.7/4.5-air 的 reasoning 会吃光预算
    private static final String[] ZP_MODELS = {"glm-4-flash", "glm-4-flashx"};

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setTextZoom(100);

        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(), "SushouBridge");
        web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    /** JS → Java 异步桥：generate(reqId, engine, messagesJson, maxTokens) */
    public class Bridge {
        @JavascriptInterface
        public void generate(final String reqId, final String engine,
                             final String messagesJson, final int maxTokens) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    String result = doGenerate(engine, messagesJson, maxTokens);
                    final String js = "window.__sushouResult(" + JSONObject.quote(reqId)
                            + "," + JSONObject.quote(result) + ")";
                    web.post(new Runnable() {
                        @Override
                        public void run() {
                            web.evaluateJavascript(js, null);
                        }
                    });
                }
            }).start();
        }

        @JavascriptInterface
        public String version() {
            return "1.0";
        }
    }

    private String doGenerate(String engine, String messagesJson, int maxTokens) {
        long t0 = System.currentTimeMillis();
        try {
            JSONArray messages = new JSONArray(messagesJson);
            JSONArray tried = new JSONArray();

            if ("auto".equals(engine) || "modelscope".equals(engine)) {
                String[] models = {"Qwen/Qwen3.8-Flash-Next", "Qwen/Qwen3.5-27B"};
                String last = "";
                for (String m : models) {
                    tried.put(m);
                    try {
                        String content = call(MS_URL, MS_TOKEN, m, messages, maxTokens);
                        return ok(content, m, "modelscope", tried, t0);
                    } catch (Exception e) {
                        last = e.getMessage() == null ? "未知错误" : e.getMessage();
                    }
                }
                if ("modelscope".equals(engine)) return fail("魔搭生成失败：" + last, tried);
            }

            if ("auto".equals(engine) || "zhipu".equals(engine)) {
                String last = "";
                for (String m : ZP_MODELS) {
                    tried.put(m);
                    for (int mult = 1; mult <= 2; mult++) {
                        try {
                            String content = call(ZP_URL, ZP_TOKEN, m, messages, maxTokens * mult);
                            return ok(content, m, "zhipu", tried, t0);
                        } catch (Exception e) {
                            last = e.getMessage() == null ? "未知错误" : e.getMessage();
                            // 推理吃光预算 → 同模型加倍重试一次；其他错误换下一个模型
                            if (last.contains("推理") && mult == 1) continue;
                            break;
                        }
                    }
                }
                return fail("智谱生成失败：" + last, tried);
            }

            return fail("未知引擎：" + engine, tried);
        } catch (Exception e) {
            return fail("生成异常：" + (e.getMessage() == null ? e.toString() : e.getMessage()), new JSONArray());
        }
    }

    private String ok(String content, String model, String provider, JSONArray tried, long t0) {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", true);
            o.put("content", content);
            o.put("model", model);
            o.put("provider", provider);
            o.put("attempts", tried);
            o.put("ms", System.currentTimeMillis() - t0);
            return o.toString();
        } catch (Exception e) {
            return fail("结果封装失败", tried);
        }
    }

    private String fail(String msg, JSONArray tried) {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", false);
            o.put("error", msg);
            o.put("attempts", tried);
            return o.toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"未知错误\"}";
        }
    }

    /** 调用 OpenAI 兼容 chat/completions */
    private String call(String urlStr, String token, String model, JSONArray messages, int maxTokens)
            throws Exception {
        JSONObject body = new JSONObject();
        body.put("model", model);
        body.put("messages", messages);
        body.put("temperature", 0.85);
        body.put("max_tokens", maxTokens > 0 ? maxTokens : 2000);
        body.put("stream", false);

        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(20000);
        conn.setReadTimeout(150000);
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setRequestProperty("Accept", "application/json");

        OutputStream os = conn.getOutputStream();
        os.write(body.toString().getBytes(StandardCharsets.UTF_8));
        os.flush();
        os.close();

        int code = conn.getResponseCode();
        InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
        String raw = read(is);
        conn.disconnect();

        if (code < 200 || code >= 300) {
            String detail = raw == null ? "" : raw.substring(0, Math.min(180, raw.length()));
            throw new Exception("HTTP " + code + " " + detail);
        }
        JSONObject json = new JSONObject(raw);
        JSONArray choices = json.optJSONArray("choices");
        if (choices == null || choices.length() == 0) {
            String detail = raw.substring(0, Math.min(180, raw.length()));
            throw new Exception("接口无返回内容 " + detail);
        }
        JSONObject msg = choices.getJSONObject(0).optJSONObject("message");
        String content = msg == null ? "" : msg.optString("content", "");
        String reasoning = msg == null ? "" : msg.optString("reasoning_content", "");
        if (content == null || content.trim().isEmpty()) {
            throw new Exception(reasoning.length() > 0
                    ? "正文未生成：token 预算被推理占用"
                    : "返回为空");
        }
        return content.trim();
    }

    private static String read(InputStream is) throws Exception {
        if (is == null) return "";
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
        is.close();
        return new String(bos.toByteArray(), StandardCharsets.UTF_8);
    }
}
