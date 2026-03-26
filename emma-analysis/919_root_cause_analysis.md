# 919 根因分析：完整證據鏈

> 分析日期：2026-03-20 ~ 2026-03-21
> 資料來源：BigQuery 全量 + Android Source Code（jeremylu-mb/invoice-android-readonly）
> BQ 查詢成本：~$0.50

---

## 結論

**919 有多重觸發來源：18% 來自 App 內的「設定領獎帳戶」WebView（setBankAccount），這是一個可修的 bug（沒有 override handleResponse 同步密碼）。但大多數 919（~76%）來自用戶在 App 外改密碼（財政部網站、其他發票 App、報稅），App 完全不知道。加上 App 只有被動偵測（用戶不開 App 就不知道 919），形成 919→沒發票→不開App→不知道 919 的死循環。**

**85% 的人修好後又壞，因為每 2 個月對獎就重複一次這個循環。**

---

## 一、數據佐證

### 1.1 對獎日是 919 爆發觸發點

919 新增量按每月日期分佈（2025-01 ~ 2026-03）：

| 日期 | 919 新增量 | vs 平時（~20K） |
|---|---|---|
| 25 號（對獎日） | **44,000** | **2.2x** |
| 26 號 | **62,902** | **3.1x**（最高峰） |
| 27 號 | **52,354** | **2.6x** |
| 6 號 | 43,964 | 2.2x（可能是系統批次同步） |
| 平時 | ~20,000 | 基線 |

**25-27 號的 919 新增量是平時的 2-3 倍。**

### 1.2 修好後又壞（85%）

曾經被修復（919→SUCCESS）的用戶後續狀態：

| 狀態 | 人數 | 比例 |
|---|---|---|
| 修好沒再壞 | 108,848 | **15%** |
| 壞了 2 次（修好又壞） | 534,302 | **73%** |
| 壞了 3 次 | 81,994 | 11% |
| 壞了 4 次+ | 9,691 | 1% |
| **修好後又壞合計** | **625,987** | **85%** |

### 1.3 修好到又壞的時間間隔

| 間隔 | 比例 | 對應 |
|---|---|---|
| 同一天 | 0.0% | — |
| 1 天後 | 2.1% | — |
| 2-7 天 | 7.3% | — |
| 8-30 天 | 14.3% | 月內 |
| **31-90 天** | **28.5%** | **跨 1-3 次對獎日** |
| **91-180 天** | **33.0%** | **跨 2-3 次對獎日** |
| 180 天+ | 14.7% | — |

**61.5% 在 1-6 個月後又壞，對應對獎週期（每 2 個月）。**

### 1.4 919 全貌（2025-09 ~ 2026-03，近 6 個月）

| 指標 | 數字 | 說明 |
|---|---|---|
| 目前 919 存量 | **1,203,004** | 載具快照中目前是 919 的人（此數字來自 `intermediate.sat__carrier` 快照直接查詢 `is_active=true AND mof_status='INACCURATE_AVAILABILITY'`，syncer view 的去重結果為 ~1,169K） |
| 此期間 SUCCESS→919 事件數 | **748,485 次** | 有人壞了不只一次 |
| 此期間曾變 919 的不重複人數 | **680,223 人** | |
| 919 前 3 天有開 App 的 | **518,166（76.2%）** | 有 session 紀錄 |
| 919 前 3 天沒開 App 的 | 162,057（23.8%） | 可能是系統端同步失敗 |

### 1.5 919 前 3 天的用戶行為

分析近 6 個月 68 萬從 SUCCESS → 919 的用戶，在變 919 前 3 天的行為：

| 行為 | 用戶數 | 佔 919 用戶 | 說明 |
|---|---|---|---|
| 有開 App | 518,166 | **76.2%** | 大部分在使用 App 過程中觸發 |
| 看了對獎結果 | **211,103** | **31.0%** | 對獎相關行為 |
| **進了 setBankAccount** | **122,486** | **18.0%** | **🔴 最大單一可追蹤觸發點** |
| 進了 setBankAccount（7天內） | 126,092 | 18.5% | 放寬到 7 天差異不大 |
| 沒開 App | 162,057 | **23.8%** | 系統端觸發（非用戶行為） |

**setBankAccount 是最大的單一可追蹤觸發點（18%），但不是唯一原因。**

### 1.6 919 觸發來源拆解（MECE）

| 來源 | 佔比 | 人數 | 證據 |
|---|---|---|---|
| **App 內 setBankAccount → 財政部** | **18.0%** | **122,486** | pageview 直接比對 |
| **對獎相關（看了對獎結果但沒進 setBankAccount）** | **~13%** | ~88,617 | prizeResult 31% - setBankAccount 18% |
| **其他 App 內行為** | **~45%** | ~307,063 | 有開 App 但不在上述兩類 |
| **未開 App（系統端/外部）** | **23.8%** | **162,057** | 沒有 session 紀錄 |

注意：
- 18% setBankAccount 是**有明確數據佐證的觸發點**
- 剩下 82% 可能來自：App 外使用財政部（瀏覽器/其他 App）、系統端同步失敗、其他 WebView 流程
- 24% 沒開 App 就壞了，可能是**財政部端主動更新**或**系統批次同步失敗**

### 1.7 驗證碼設定頁後變 919 的比例

| 時期 | 進入 passwordSetting 的人 | 7天內變 919 | 比例 |
|---|---|---|---|
| 對獎日（25-27） | 204,052 | 6,233 | 3.1% |
| 平時 | 697,169 | 32,802 | 4.7% |
| 合計 | 813,133 | 38,484 | 4.7% |

注意：對獎日進入 passwordSetting 的人主要是來「修復」919 的（已經是 919），不是來「觸發」的。觸發點在 setBankAccount。

### 1.8 對獎期間行為放大

對獎日（25-27）vs 平時的日均行為比較：

| 行為 | 對獎日均 | 平時日均 | 倍數 |
|---|---|---|---|
| 對獎結果 | 578,816 | 32,799 | **17.6x** |
| 中獎號碼查詢 | 80,342 | 16,980 | 4.7x |
| 手動對獎 | 111,503 | 30,003 | 3.7x |
| 驗證碼設定 | 30,415 | 11,896 | **2.6x** |
| 發票列表 | 1,449,958 | 487,105 | 3.0x |

對獎期間 254 萬人開 App，76.7% 看對獎結果，8% 進入驗證碼設定頁。

### 1.9 919 用戶的沉睡率

| 載具狀態 | 人數 | 沉睡率 |
|---|---|---|
| 載具正常（SUCCESS） | 3,980,583 | **44.0%** |
| **919 問題** | **1,203,004** | **87.9%** |
| 無載具 | 345,193 | 98.5% |

### 1.10 919 對 Policy 過期的影響

| 路徑 | 人數 | 佔全部 Policy 過期 |
|---|---|---|
| 919 → 沉睡 → Policy 過期 | 950,100 | **37.8%** |
| 自然沉睡 → Policy 過期 | ~1,501,000 | 59.6% |
| 有開 App 但沒續約 | 64,893 | 2.6% |

---

## 二、Code 佐證

### 2.1 領獎帳戶設定（AddBankWeb）— ❌ 沒有密碼同步

**檔案：** `app/src/main/java/tw/com/quickscanner/invoice/ui/web/AddBankWebViewModel.kt`

```kotlin
@HiltViewModel
class AddBankWebViewModel @Inject constructor(
    private val frontRepository: FrontRepository
) : WebWithJavascriptViewModel() {

    fun getAddBankAccountSetting() {
        sendApi(apiAction = {
            frontRepository.getAddBankAccountSetting()
        }) { bankAccountSetting ->
            sendEvent(Event.LoadWebView(bankAccountSetting.url, bankAccountSetting.javascript))
            // ← 載入 WebView 就結束了，沒有任何密碼同步邏輯
        }
    }
}
```

**AddBankWebActivity：**
```kotlin
// 檔案：app/src/main/java/.../ui/web/AddBankWebActivity.kt
class AddBankWebActivity : WebWithJavascriptActivity() {
    override fun loadWebView() {
        viewModel.getAddBankAccountSetting()  // 載入財政部 URL
    }
    // 沒有 override handleResponse
    // 沒有任何密碼攔截
}
```

### 2.2 基類 WebWithJavascriptViewModel — 有攔截機制但要 override

**檔案：** `app/src/main/java/.../ui/web/WebWithJavascriptViewModel.kt`

```kotlin
open class WebWithJavascriptViewModel : BaseViewModel() {
    open fun handleResponse(json: JSONObject) {
        //Override this function to handle other response
        // ← 空的！子類要自己 override
    }

    fun onJavascriptResponseReceived(response: String) {
        val json = JSONObject(response)
        when {
            json.has("showProgress") -> ...
            json.has("error") -> ...
            json.has("event_name") -> trackEvent(...)
            else -> handleResponse(json)  // ← 其他回應交給子類處理
        }
    }
}
```

### 2.3 載具登入（MofLoginWeb）— ✅ 有密碼同步

**檔案：** `app/src/main/java/.../ui/web/MofLoginWebViewModel.kt`

```kotlin
class MofLoginWebViewModel : WebWithJavascriptViewModel() {

    override fun handleResponse(json: JSONObject) {
        // ✅ 攔截財政部回傳的所有欄位
        if (LoginResponseKey.entries.all { json.has(it.key) }) {
            onMofLoginResultReceived(
                json.getString("mobile"),
                json.getString("password"),     // ← 攔截密碼！
                json.getString("email"),
                json.getString("carrierId2"),
                json.getString("publicCarrierId"),
                json.getBoolean("emailChecked")
            )
        }
    }

    private fun onMofLoginResultReceived(phone, password, ...) {
        // ✅ 把密碼同步回 server
        authRepository.loginCarrierFromMof(password: password, ...)
        // 或
        memberRepository.linkCarrierFromMof(password: password, ...)
    }
}
```

### 2.4 對比總結

| 流程 | ViewModel | override handleResponse | 密碼同步 | 919 風險 |
|---|---|---|---|---|
| 載具登入/綁定 | MofLoginWebViewModel | ✅ 有 | ✅ 有 | 低 |
| **領獎帳戶設定** | **AddBankWebViewModel** | **❌ 沒有** | **❌ 沒有** | **🔴 高** |
| 忘記密碼 | MofLoginWebViewModel（MofForgetPassword） | 部分 | 部分 | 中 |

### 2.5 919 偵測機制（被動）

```kotlin
// MemberProfileImpl.kt — 首頁
if (it.carrier?.isValid == false) openUpdateCarrierPasswordDialog.value = true

// BaseInvoiceListViewModel.kt — 發票列表
it.carrier?.isValid == false → 顯示 919 對話框

// BaseInvoiceBookViewModel.kt — 發票簿
InvoiceShared.carrier?.isValid == false → 顯示 919 對話框
```

只有用戶開 App 進入這些頁面才檢查。87.9% 的 919 用戶沉睡不開 App → 永遠觸發不了。

### 2.6 919 對話框

```xml
<!-- strings.xml -->
<string name="update_invoice_919_error_title">發票同步失敗</string>
<string name="update_invoice_919_error_desc">
  您過去曾在財政部變更過載具驗證碼，或使用過「忘記密碼」功能，
  因此目前無法在發票存摺繼續同步發票。請立即更新驗證碼，以恢復同步功能。
</string>
<string name="update_invoice_919_error_button">前往更新驗證碼</string>
```

對話框 `cancelable = false`（不可取消），強制顯示。

### 2.7 更新密碼後需 1-2 天同步

```xml
<string name="carrier_password_update_success_desc">
  系統正在同步您的發票與載具資料，最多需要一至兩天時間，請耐心稍候。
  同步完成後我們將發送推播通知您。
</string>
```

### 2.8 密碼錯 3 次 → 導向財政部（循環）

```kotlin
// UpdateCarrierPasswordViewModel.kt
companion object {
    private const val MAX_INVALID_ATTEMPTS = 3
}

private fun handleInvalidCredentials() {
    invalidCredentialErrorCount++
    if (invalidCredentialErrorCount >= MAX_INVALID_ATTEMPTS) {
        shouldShowForgetPasswordDialog(true)  // → 導向財政部重設密碼
    }
}
```

### 2.9 財政部網站流程

財政部「設定領獎帳戶」的網站流程：

```
1. 登入頁 → 需要輸入手機號碼 + 載具驗證碼
                                    ↑
                    如果忘記密碼 → 重設新密碼 → 新密碼跟 App 不同 → 919

2. 設定匯款帳戶 → 輸入銀行帳號

3. 完成
```

App 的 `AddBankWebActivity` 載入的就是這個財政部登入頁，但沒有用 JavaScript 攔截密碼欄位。

---

## 三、完整因果鏈

```
對獎日（25號）
  ↓ 用戶在 App 內對獎 → 中獎（76.7% 看對獎結果）
  ↓ 點「領獎帳戶設定」（18% 的 919 用戶在變 919 前 3 天做了這個動作）
  ↓ App 用 WebView 打開財政部（AddBankWebActivity → LoadWebView(url)）
  ↓ 財政部要求登入 → 輸入手機號碼 + 驗證碼
  ↓ 可能場景 A：正確登入（不觸發 919）
  ↓ 可能場景 B：忘記密碼 → 在財政部重設 → 新密碼跟 App 不同
  ↓ 可能場景 C：之前在其他地方改過密碼 → 用新密碼登入
  ↓
  ↓ 不管 A/B/C，AddBankWebActivity 都不會把密碼同步回 App
  ↓ （沒有 override handleResponse）
  ↓
App 內密碼跟財政部不一致 → 919
  ↓ 87.9% 沉睡（不開 App → 被動偵測觸發不了）
  ↓ 12.1% 活躍 → 看到「發票同步失敗」→ 更新密碼 → 修好
  ↓ 但更新後需 1-2 天同步（可能以為沒效）
  ↓
下次對獎日（2個月後）
  ↓ 又中獎 → 又去設定領獎帳戶 → 又 WebView → 又財政部
  ↓ 85% 會再次壞掉
  ↓ 永遠循環 ♻️
```

---

## 四、修復建議

### P0：根本修復

| 方案 | 說明 | 改動 |
|---|---|---|
| **AddBankWebViewModel 加 handleResponse** | 跟 MofLoginWebViewModel 一樣攔截密碼欄位，同步回 server | 改 `AddBankWebViewModel.kt`，增加 `override fun handleResponse` |
| **領獎帳戶原生化** | 不再用 WebView 導去財政部，直接呼叫財政部 API 完成帳戶設定 | 較大改動，需要 API 對接 |

### P1：止血

| 方案 | 說明 | 改動 |
|---|---|---|
| WebView 結束後觸發密碼驗證 | AddBankWebActivity 的 onClosed() 加一個密碼重新驗證流程 | 改 `AddBankWebActivity.kt` |
| FCM 主動推播 919 | server 偵測到 919 立即推播，不等用戶開 App | Backend + FCM |
| 忘記密碼不導去財政部 | 3 次錯誤後改用 App 內重設（手機驗證碼），不再導去財政部 | 改 `UpdateCarrierPasswordViewModel.kt` 的 `handleInvalidCredentials()` |

### P2：預防

| 方案 | 說明 |
|---|---|
| 對獎日前推播 | 每月 24 號推播「對獎請在 App 內操作」|
| 定期密碼一致性檢查 | 背景 API 定期檢查 App 密碼和財政部是否一致 |
| 更新成功後即時同步 | 改掉「1-2天同步」，更新後立即觸發一次同步 |

---

## 五、相關檔案

| 檔案 | 用途 | 問題 |
|---|---|---|
| `ui/web/AddBankWebViewModel.kt` | 領獎帳戶設定 | **🔴 沒有 handleResponse** |
| `ui/web/AddBankWebActivity.kt` | 領獎帳戶 WebView | **🔴 沒有密碼攔截** |
| `ui/web/WebWithJavascriptViewModel.kt` | WebView 基類 | handleResponse 是空的 |
| `ui/web/MofLoginWebViewModel.kt` | 載具登入 | ✅ 有 handleResponse 和密碼同步 |
| `ui/web/MofWebLoginActivity.kt` | 財政部登入 WebView | ✅ 有密碼攔截 |
| `ui/login/UpdateCarrierPasswordViewModel.kt` | 更新驗證碼 | 3 次錯誤導向財政部 |
| `ui/composeview/dialog/UpdateCarrierPasswordDialogCompose.kt` | 919 對話框 | cancelable=false |
| `ui/impl/MemberProfileImpl.kt` | 首頁 919 檢查 | 被動偵測 |
| `ui/book/BaseInvoiceListViewModel.kt` | 發票列表 919 檢查 | 被動偵測 |
| `ui/book/BaseInvoiceBookViewModel.kt` | 發票簿 919 檢查 | 被動偵測 |
| `ui/home/setting/carrier/MemberCarrierViewModel.kt` | 載具管理 | 有「919 狀態可能不同步」的註解 |
| `data/dto/response/AddBankAccountSetting.kt` | 領獎 URL 設定 | 只有 url 和 javascript |
| `res/values/strings.xml` | 919 相關文案 | 所有提示文字 |

---

## 六、三大觸發模式（完整拆解）

### 模式一：對獎日觸發（25-27號，奇數月爆發）

統一發票每 2 個月開獎一次（奇數月 25 號）。

| 月份 | 25-27號 919 數 | 是否開獎月 |
|---|---|---|
| 2025-07 | **32,053** | ✅ 開 05-06 月 |
| 2025-08 | 7,840 | |
| 2025-09 | **33,854** | ✅ 開 07-08 月 |
| 2025-10 | 10,036 | |
| 2025-11 | **34,156** | ✅ 開 09-10 月 |
| 2025-12 | 6,962 | |
| 2026-01 | **29,437** | ✅ 開 11-12 月 |
| 2026-02 | 7,856 | |

**開獎月 25-27 號的 919 是非開獎月的 4-5 倍。**

觸發路徑：用戶在 App 內對獎 → 中獎 → 設定領獎帳戶 → 財政部 WebView → 改密碼 → 919

- 對獎日的 919 中，**沒開 App 只佔 11-12%** → 主要是 App 內行為觸發

### 模式二：延遲效應（每月 5-7號）

| 月份 | 5-7號 919 數 | 說明 |
|---|---|---|
| 2025-08 | 14,973 | 距 7/25 對獎日 ~12 天 |
| 2025-10 | 13,276 | 距 9/25 對獎日 ~12 天 |
| 2025-12 | 15,529 | 距 11/25 對獎日 ~12 天 |
| **2026-01** | **36,189** | 距 12/25 + 年初效應 |
| 2026-02 | 14,525 | 距 1/25 對獎日 ~12 天 |

**每月 5-7 號固定有高峰，距離前一個月對獎日約 10-12 天。**

可能原因：
1. 用戶對獎後不是當天操作，隔幾天/跨月才去財政部領獎
2. **server 端每月初有批次同步作業**，此時偵測到密碼不一致
3. 兩者皆有

### 模式三：系統觸發（23.8% 沒開 App）

16.2 萬人在 919 前 3 天沒開 App，但 server 偵測到密碼失效。

**這群人的特徵：**

| 指標 | 數字 |
|---|---|
| 用過 App 11-30 天的 | 40.8%（不是新手） |
| 用過 App 30 天+ 的 | 23.4%（老用戶） |
| 從沒開過 App 的 | 6.4% |
| 平均最後開 App 距今 | 22 天（中位數） |

**919 前 30 天的行為（擴大窗口）：**

| 行為 | 沒開App群 | 有開App群 |
|---|---|---|
| setBankAccount | **2.1%** | 26.4% |
| scanner（掃發票） | **24.0%** | 54.0% |
| prizeResult（對獎） | **24.6%** | 60.3% |
| forgetPassword | 2.3% | 5.9% |

**結論：這群人之前是活躍用戶（24% 有掃發票），只是變 919 的那幾天沒用 App。密碼是在 App 外被改的（瀏覽器、其他發票 App、報稅），server 批次同步時偵測到。**

### 觸發模式總覽

| 模式 | 佔比 | 觸發點 | 證據 |
|---|---|---|---|
| **App 內 setBankAccount** | **18%** | 領獎帳戶 WebView → 財政部 | pageview + code（無 handleResponse） |
| **App 內 forgetPassword** | **2.6%** | 忘記密碼 → 財政部 | pageview + code |
| **App 內其他行為後** | **~31%** | 對獎→可能在 App 外去財政部 | prizeResult pageview，但無法追蹤 App 外行為 |
| **App 外改密碼** | **~24%** | 瀏覽器/其他 App/報稅 | 有 App 使用但無觸發頁面 |
| **系統端偵測** | **~24%** | server 批次同步失敗 | 919 前無 session，每月 5-7 號高峰 |

**⚠️ 重要修正：** 經追溯偶數月 5-7 號 919 用戶的上月行為，**只有 5.7% 在上月 App 內做了 setBankAccount/forgetPassword**。94.3% 的密碼是在 App 外面被改的。setBankAccount 是可以修的 bug，但 **919 的主因是「用戶在 App 外面改了密碼，App 完全不知道」**。

### 開獎日（奇數月 25-27）用戶分群

**12.7 萬人在開獎日變 919，分成 5 大群：**

#### 🔴 App 內觸發（37%）— 當下做了會改密碼的事

| 群組 | 人數 | 佔比 | 路徑 |
|---|---|---|---|
| **A: 對獎→設定帳戶** | **37,393** | **32.9%** | prizeResult → setBankAccount → 財政部 WebView → 改密碼 |
| B: 只設定帳戶 | 2,835 | 2.5% | setBankAccount → 財政部 |
| C+H: 忘記密碼 | 1,252 | 1.1% | forgetPassword → 財政部重設 |

#### ⚠️ 被動偵測（51%）— App 打開時被抓到密碼已不一致

| 群組 | 人數 | 佔比 | 說明 |
|---|---|---|---|
| **F: 只對獎** | **35,111** | **30.9%** | 只看了對獎結果，什麼都沒改。密碼**之前**就在外面被改了 |
| **E: 對獎＋掃發票** | **22,033** | **19.4%** | 正常使用 App，開 App 時 server 同步偵測到 |

#### ❓ 其他（12%）

| 群組 | 人數 | 佔比 | 說明 |
|---|---|---|---|
| K: 沒開 App | 14,597 | 11.5% | server 批次同步偵測 |
| J+G+D+I: 其他 | 14,904 | 11.7% | |

#### A群 vs F群 — 兩種截然不同的用戶

| | A: 對獎+設定帳戶 | F: 只對獎 |
|---|---|---|
| 去了 carrier 頁 | **90.4%** | 49.8% |
| 手動對獎 | **14.2%** | 0% |
| 看中獎號碼 | **13.8%** | 0% |
| 典型 | **深度使用者，主動操作** | **輕度使用者，只看結果** |
| 919 原因 | **當下在 WebView 改了密碼** | **之前在外面改的，這次被偵測** |

#### 結論

**「開獎日 919 爆發」是兩件事疊加：**
1. **37% 是當下觸發** — 設定帳戶/忘記密碼 → 財政部 WebView → 改密碼
2. **51% 是被動偵測** — 密碼早在外面被改，開獎日開 App 時 server 同步才發現

### 偶數月 5-7 號用戶分群

**5.7 萬人在偶數月 5-7 號變 919。**

#### 當月（5-7號前 3 天）的行為

| 群組 | 人數 | 佔比 | 說明 |
|---|---|---|---|
| **J: 其他（只開 App）** | **15,839** | **27.5%** | 只看了 home/carrier，純粹被偵測 |
| K: 沒開 App | 14,051 | 24.4% | server 批次偵測 |
| F: 只對獎 | 6,581 | 11.4% | 被動偵測 |
| A: 對獎+設定帳戶 | 5,653 | 9.8% | 主動觸發 |
| G: 只掃發票 | 5,606 | 9.7% | 被動偵測 |
| B: 只設定帳戶 | 4,295 | 7.5% | 主動觸發 |
| E: 對獎+掃發票 | 4,078 | 7.1% | 被動偵測 |
| C+H: 忘記密碼 | 941 | 1.6% | 主動觸發 |

**主動觸發（A+B+C+H）：19% ← 遠低於開獎日的 37%**
**被動偵測（F+E+G+J+K）：81%**

#### 追溯：上個月對獎日（20-28號）做了什麼？

| 上月對獎日的行為 | 人數 | 佔比 | 說明 |
|---|---|---|---|
| **F: 上月只對獎** | **19,064** | **33.1%** | 有開 App 對獎，但沒做會觸發 919 的事 |
| X: 上月沒開 App | 13,161 | 22.8% | 上月對獎日根本沒開 App |
| E: 上月對獎+掃發票 | 11,686 | 20.3% | 正常使用 |
| J: 上月其他 | 7,898 | 13.7% | 開了 App 但沒對獎 |
| G: 上月只掃發票 | 2,515 | 4.4% | 日常掃發票 |
| 🔴 A: 上月對獎+設定帳戶 | 1,959 | **3.4%** | setBankAccount |
| 🔴 C: 上月忘記密碼 | 1,015 | **1.8%** | forgetPassword |
| 🔴 B: 上月只設定帳戶 | 320 | **0.6%** | setBankAccount |

**只有 5.7%（3,294 人）在上月 App 內做了會觸發 919 的事。**
**94.3% 在上月 App 內沒有做任何「會觸發 919 的操作」。**

#### 結論

偶數月 5-7 號的 919 **不是 App 內 setBankAccount 的延遲效應**。
- 上月在 App 內做了 setBankAccount/forgetPassword 的人只佔 5.7%
- 其餘 94.3% 的密碼是在 **App 外面被改的**（瀏覽器去財政部、其他發票 App、報稅）
- 或是 **server 端每月初批次同步**時才偵測到

### 2026-01-06 異常爆量

| 日期 | 919 數 | vs 平時 |
|---|---|---|
| 2026-01-05 | 7,540 | 3.0x |
| **2026-01-06** | **18,156** | **7.3x** |
| 2026-01-07 | 10,493 | 4.2x |

距 12/25 對獎日 12 天，且為年初（可能有年度密碼過期、大量領獎、server 年度批次同步）。

---

## 七、查詢紀錄

| 查詢 | 用途 | 成本 |
|---|---|---|
| 919 修復後又壞分佈 | 驗證循環性 | ~$0.003 |
| 919 按日分佈 | 驗證對獎日觸發 | ~$0.003 |
| 919 修好到又壞間隔 | 驗證週期性 | ~$0.003 |
| 對獎日行為分析 | 驗證用戶路徑 | ~$0.07 |
| passwordSetting → 919 轉換率 | 驗證觸發比例 | ~$0.07 |
| 919 前 3 天行為 | 驗證 setBankAccount 觸發 | ~$0.07 |
| 919 全量拆解（68 萬人） | 精確比例 | ~$0.07 |
| 沒開 App 群：最後開 App 距離 | 沉睡分析 | ~$0.07 |
| 沒開 App 群：919 日期分佈 | 發現 6 號高峰 | ~$0.03 |
| 有/沒開 App 群：30 天行為比較 | 觸發模式比較 | ~$0.07 |
| 沒開 App 群：使用深度 | 用戶特徵 | ~$0.03 |
| 每月 5-7 vs 25-27 號分佈 | 發現雙峰模式 | ~$0.01 |
| 2026-01 逐日分佈 | 確認 1/6 爆量 | ~$0.01 |
