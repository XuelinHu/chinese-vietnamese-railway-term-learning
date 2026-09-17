# Android 端接入：WebView 与 `window.RailwayNative` 桥接协议

本项目是 H5 应用，Android 端用 WebView 承载。语音能力有两条路径：

| 路径 | 谁来录音/识别 | 何时使用 |
|---|---|---|
| **A. 服务端 Whisper**（推荐主力） | WebView 里 `MediaRecorder` 录音 → 上传 `/api/agent/asr` → 服务端 faster-whisper 转写 | 默认。中越英三语都准，与 H5 完全同一套代码 |
| **B. 原生桥接**（可选备选） | App 用 `SpeechRecognizer` / `TextToSpeech`，通过 `window.RailwayNative` 把结果交给 JS | 设备无网络、或要把识别交给系统级引擎时 |

前端 `client/src/voice/index.js` 的探测顺序是 **Android 原生桥 > 服务端 Whisper > Web Speech**：
只要 `window.RailwayNative` 存在且声明支持，就走原生；否则自动落到服务端；服务端也不可用时再降级到浏览器 `webkitSpeechRecognition`。

**因此：即使 App 完全不实现桥接，语音功能也能用**（走路径 A）。桥接是可选的增强，不是必需项。

---

## 一、必须做对的一件事：安全上下文

`navigator.mediaDevices.getUserMedia()` 只在**安全上下文**下存在：`https://`、`file://` 或 `localhost`。

如果 WebView 加载 `http://192.168.1.9:4026`（局域网明文 HTTP），那么：

```js
navigator.mediaDevices        // => undefined
navigator.mediaDevices.getUserMedia()   // => TypeError，且不会给你任何权限提示
```

**这是最难排查的失败模式**：没有任何异常冒泡、没有权限弹窗、`MediaRecorder` 相关代码静默失效。
Android 上 `android:usesCleartextTraffic` 打开也**不能**绕过这条限制——它管的是网络策略，不是安全上下文。

### 正确做法：用 `https://localhost` 加载

Capacitor 默认就是这套配置（`androidScheme: 'https'` + `hostname: 'localhost'`）。手写 WebView 时等价配置：

```kotlin
// 1) 把前端产物放进 app/src/main/assets/public/
// 2) 用 WebViewAssetLoader 把 https://localhost/ 映射到 assets
val assetLoader = WebViewAssetLoader.Builder()
    .setDomain("localhost")
    .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
    .build()

webView.webViewClient = object : WebViewClientCompat() {
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
        assetLoader.shouldInterceptRequest(request.url)
}

webView.loadUrl("https://localhost/index.html")
```

若必须连远程后端，就用真实的 `https://` 域名（配合 FRP + TLS），不要用 `http://<IP>`。

---

## 二、麦克风权限：重写 `onPermissionRequest`

`getUserMedia` 的权限请求**不会**走 Android 运行时权限回调，而是走 `WebChromeClient.onPermissionRequest`。
不重写它，WebView 会直接拒绝，且同样是静默失败。

```kotlin
class MicChromeClient(
    private val activity: Activity,
    private val permissionLauncher: ActivityResultLauncher<String>
) : WebChromeClient() {

    override fun onPermissionRequest(request: PermissionRequest) {
        val wantsAudio = request.resources.any { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }
        if (!wantsAudio) { request.deny(); return }

        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        } else {
            // 先把 request 存起来，等用户授权后再 grant，否则这次请求会被丢掉
            pendingPermissionRequest = request
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }
}

// 回调里补上 grant
private var pendingPermissionRequest: PermissionRequest? = null

private val micLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    val request = pendingPermissionRequest ?: return@registerForActivityResult
    if (granted) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
    else request.deny()
    pendingPermissionRequest = null
}
```

`AndroidManifest.xml` 还需要：

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

---

## 三、`window.RailwayNative` 桥接协议

前端通过 `client/src/voice/android.js` 调用。**同步返回值、异步回调**——这是 Android `@JavascriptInterface` 的固有限制（它不能返回 Promise）。

### 3.1 能力声明

```ts
window.RailwayNative.supported: string   // JSON 数组字符串，如 '["asr","tts"]'
```

前端据此决定是否走原生路径。`asr` 声明「能识别」，`tts` 声明「能播报」。两个都不给，等同于没有桥接。

### 3.2 语音识别（ASR）

```ts
window.RailwayNative.startVoice(lang: string): void
window.RailwayNative.stopVoice(): void
window.RailwayNative.cancelVoice(): void
```

`lang` 取 `'zh-CN'` / `'vi-VN'` / `'en-US'`。开始识别后，原生侧**必须**回调前端预先注册的全局函数：

```js
// 前端已注册（android.js 里做的），原生侧直接调用：
window.__railwayVoiceResult(JSON.stringify({
  type: 'result',      // 'result' | 'partial' | 'error' | 'end'
  text: '道岔',
  isFinal: true,
  message: ''          // type === 'error' 时填原因
}))
```

| 字段 | 说明 |
|---|---|
| `type` | `partial` 中间结果（可选，用于实时上屏）、`result` 最终结果、`error` 失败、`end` 结束 |
| `text` | 识别文本。`error`/`end` 时可为空 |
| `isFinal` | 配合 `result` 使用，`true` 表示这句说完了 |
| `message` | 仅 `error` 时使用，给用户看的原因 |

**前端保证**：`type: 'end'` 或 `type: 'error'` 之后这次识别的 Promise 一定会 settle，不会悬挂。所以原生侧无论成功失败都**必须**发一次 `end` 或 `error`。

### 3.3 语音播报（TTS）

```ts
window.RailwayNative.speak(text: string, lang: string, utteranceId: string): void
window.RailwayNative.stopSpeak(): void
```

`utteranceId` 由前端生成，用于把回调对上号。播报状态通过同一个全局函数回报：

```js
window.__railwayVoiceResult(JSON.stringify({
  type: 'speak',       // 'speak' | 'speakError'
  utteranceId: 'u-3',
  state: 'done',       // 'start' | 'done' | 'error'
  message: ''
}))
```

**回声抑制**：连续对话模式下，前端在播报期间会暂停收音，避免把 AI 自己的声音录进去。
这依赖 `state: 'done'` 的准确回报——如果原生侧播完不发这个回调，麦克风会一直静音。

### 3.4 权限探测

```ts
window.RailwayNative.hasMicPermission(): boolean
window.RailwayNative.requestMicPermission(): void   // 结果仍通过 __railwayVoiceResult 回报
```

---

## 四、Kotlin 参考实现（可直接粘贴）

> 定位：**可选备选**。默认走服务端 Whisper 已经能满足中越双语识别，且准确率更高。
> 下面这段的价值在于「无网络也能识别」和「用系统级引擎」。

```kotlin
package com.example.railwayterm

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.UUID

/**
 * window.RailwayNative 的参考实现。
 *
 * 三条硬性约束（踩过就知道疼）：
 *  1. @JavascriptInterface 只能同步返回，异步结果一律走 evaluateJavascript 回调。
 *  2. 所有回调必须在主线程 evaluateJavascript。
 *  3. 无论成功失败都要发 end/error，否则前端 Promise 永久挂起。
 */
class RailwayNativeBridge(
    private val activity: Activity,
    private val webView: WebView
) : TextToSpeech.OnInitListener {

    private var recognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var currentUtteranceId: String? = null

    init {
        tts = TextToSpeech(activity, this)
    }

    // ------------------------------ 能力声明 ------------------------------

    @JavascriptInterface
    fun supported(): String {
        val caps = JSONArray()
        if (SpeechRecognizer.isRecognitionAvailable(activity)) caps.put("asr")
        caps.put("tts")
        return caps.toString()
    }

    // ------------------------------ 权限 ------------------------------

    @JavascriptInterface
    fun hasMicPermission(): Boolean =
        ContextCompat.checkSelfPermission(activity, android.Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    @JavascriptInterface
    fun requestMicPermission() {
        // 真正的授权在 Activity 里做，这里只触发；结果由 Activity 回调本类的 onMicPermissionResult
        activity.runOnUiThread {
            activity.requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO), REQ_MIC)
        }
    }

    // ------------------------------ ASR ------------------------------

    @JavascriptInterface
    fun startVoice(lang: String) {
        activity.runOnUiThread {
            if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
                emit(JSONObject().put("type", "error").put("message", "本机不支持系统语音识别"))
                return@runOnUiThread
            }
            if (!hasMicPermission()) {
                emit(JSONObject().put("type", "error").put("message", "缺少麦克风权限"))
                return@runOnUiThread
            }

            recognizer?.destroy()
            recognizer = SpeechRecognizer.createSpeechRecognizer(activity).apply {
                setRecognitionListener(listener)
                startListening(buildIntent(lang))
            }
        }
    }

    @JavascriptInterface
    fun stopVoice() {
        activity.runOnUiThread { recognizer?.stopListening() }
    }

    @JavascriptInterface
    fun cancelVoice() {
        activity.runOnUiThread {
            recognizer?.cancel()
            emit(JSONObject().put("type", "end"))
        }
    }

    private fun buildIntent(lang: String) = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        // 注意：EXTRA_PREFER_OFFLINE 在 SDK 32+ 已失效，别指望它保证离线可用。
        // vi-VN 的离线可用性完全取决于设备是否装了对应语言包。
    }

    private val listener = object : RecognitionListener {
        override fun onPartialResults(partialResults: Bundle?) {
            val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
            if (!text.isNullOrBlank()) {
                emit(JSONObject().put("type", "partial").put("text", text).put("isFinal", false))
            }
        }

        override fun onResults(results: Bundle?) {
            val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
            emit(JSONObject().put("type", "result").put("text", text).put("isFinal", true))
            emit(JSONObject().put("type", "end"))
        }

        override fun onError(error: Int) {
            // 没听清（NO_MATCH/SPEECH_TIMEOUT）不该当错误弹给用户，静默收尾即可
            val silent = error == SpeechRecognizer.ERROR_NO_MATCH ||
                error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
            if (silent) {
                emit(JSONObject().put("type", "end"))
            } else {
                emit(JSONObject().put("type", "error").put("message", errorText(error)))
                emit(JSONObject().put("type", "end"))
            }
        }

        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun errorText(code: Int) = when (code) {
        SpeechRecognizer.ERROR_AUDIO -> "录音出错"
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "网络异常"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "缺少麦克风权限"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "识别器忙，请稍后再试"
        SpeechRecognizer.ERROR_SERVER -> "识别服务不可用"
        else -> "语音识别失败（$code）"
    }

    // ------------------------------ TTS ------------------------------

    override fun onInit(status: Int) {
        ttsReady = status == TextToSpeech.SUCCESS
        if (!ttsReady) return
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                emit(JSONObject().put("type", "speak").put("utteranceId", utteranceId).put("state", "start"))
            }

            override fun onDone(utteranceId: String?) {
                currentUtteranceId = null
                // 这个回调是「播报结束」的信号，前端靠它恢复收音，务必发
                emit(JSONObject().put("type", "speak").put("utteranceId", utteranceId).put("state", "done"))
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                currentUtteranceId = null
                emit(JSONObject().put("type", "speak").put("utteranceId", utteranceId).put("state", "error"))
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                currentUtteranceId = null
                emit(
                    JSONObject().put("type", "speak").put("utteranceId", utteranceId)
                        .put("state", "error").put("message", "TTS 错误码 $errorCode")
                )
            }
        })
    }

    @JavascriptInterface
    fun speak(text: String, lang: String, utteranceId: String) {
        activity.runOnUiThread {
            if (!ttsReady) {
                emit(
                    JSONObject().put("type", "speak").put("utteranceId", utteranceId)
                        .put("state", "error").put("message", "TTS 未就绪")
                )
                return@runOnUiThread
            }
            val locale = when {
                lang.startsWith("vi") -> Locale("vi", "VN")
                lang.startsWith("en") -> Locale.US
                else -> Locale.SIMPLIFIED_CHINESE
            }
            val available = tts?.isLanguageAvailable(locale) ?: TextToSpeech.LANG_NOT_SUPPORTED
            if (available < TextToSpeech.LANG_AVAILABLE) {
                emit(
                    JSONObject().put("type", "speak").put("utteranceId", utteranceId)
                        .put("state", "error").put("message", "系统未安装 $locale 语音包")
                )
                return@runOnUiThread
            }
            tts?.language = locale
            currentUtteranceId = utteranceId
            // QUEUE_FLUSH：新播报打断旧的，避免连点多次声音叠在一起
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
        }
    }

    @JavascriptInterface
    fun stopSpeak() {
        activity.runOnUiThread {
            tts?.stop()
            currentUtteranceId?.let { id ->
                emit(JSONObject().put("type", "speak").put("utteranceId", id).put("state", "done"))
            }
            currentUtteranceId = null
        }
    }

    // ------------------------------ 回调与释放 ------------------------------

    private fun emit(payload: JSONObject) {
        val js = "window.__railwayVoiceResult && window.__railwayVoiceResult(${JSONObject.quote(payload.toString())})"
        activity.runOnUiThread { webView.evaluateJavascript(js, null) }
    }

    fun onMicPermissionResult(granted: Boolean) {
        emit(
            JSONObject().put("type", if (granted) "permission" else "error")
                .put("message", if (granted) "" else "用户拒绝了麦克风权限")
        )
    }

    fun release() {
        recognizer?.destroy()
        recognizer = null
        tts?.stop()
        tts?.shutdown()
        tts = null
    }

    companion object {
        const val REQ_MIC = 1001
        const val JS_NAME = "RailwayNative"
    }
}
```

### 注册到 WebView

```kotlin
val bridge = RailwayNativeBridge(this, webView)
webView.addJavascriptInterface(bridge, RailwayNativeBridge.JS_NAME)

webView.settings.apply {
    javaScriptEnabled = true
    domStorageEnabled = true          // localStorage：token 存这里，不开就没法保持登录
    mediaPlaybackRequiresUserGesture = false   // 否则播报可能被拦
}

webView.webChromeClient = micChromeClient   // 见第一节

override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == RailwayNativeBridge.REQ_MIC) {
        bridge.onMicPermissionResult(grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED)
    }
}

override fun onDestroy() {
    bridge.release()
    super.onDestroy()
}
```

---

## 五、自测清单

在 Android 上验证语音是否真的通了，按顺序过一遍：

1. 浏览器/WebView 地址是 `https://localhost/...` 或 `https://` 域名 —— 不是 `http://<IP>`。
2. 打开弹框，点 🎤：**应当弹出系统麦克风授权框**。不弹 = `onPermissionRequest` 没重写对。
3. 说一句中文，看是否上屏。不上屏看 `/api/agent/asr` 的返回：
   - `503` → 边车没起（`npm run dev:ai`），前端会自动降级到 Web Speech。
   - `400 未收到音频数据` → `Content-Type` 不是 `audio/*`，或音频为空。
4. 点 🔊：应当听到声音。没声音先看 `/api/agent/tts` 是否 503，再看系统是否装了对应语音包。
5. 连续对话模式：播报时麦克风应当静音，播完自动重新收音。不恢复 = 原生侧没发 `state: 'done'`。

H5 端不依赖 Android 也能完整自测：在桌面 Chrome 打开 `http://localhost:4026`（`localhost` 算安全上下文），
或手机浏览器打开 FRP 的 **https** 地址。用 `http://<局域网IP>:4026` 测必然失败——这正是本文第一节要解决的问题。
