# Dashboard 待辦（2026-03-22 Emma 提出）

## 1. MAVS 週期性調整
- MAVS 有對獎週期（奇數月高、偶數月低）
- 目標應該用「季度平均」或「月度平均」而非單月快照
- 或者：開獎月 vs 非開獎月目標不同
- 需要重新定義 MAVS 達標的計算方式

## 2. 新註冊 Cohort 加 Policy 續約
- 在現有的新註冊 Cohort 表加一欄：D180 Policy 續約率
- 追蹤每個月 cohort 到 180 天時的續約完成比例

## 3. 919 恢復 Cohort（新）
- 從 919 失效當天開始追蹤
- 每個 cohort（按失效日）在 D1/D3/D7/D14/D30/D60/D90 恢復的比例
- 是否有持續性問題（修好又壞）
- BQ 查詢：sat__carrier 的 INACCURATE_AVAILABILITY → SUCCESS 的時間差

## 4. Policy 過期 Cohort 改進（新）
- 從 App 開始提醒的時間點（D110，SOFT_REMINDER）開始追蹤
- 一路追蹤到過期後
- 完整時間軸：提醒前 → 軟提醒 → 倒數 → 過期 → 過期後 D7/D14/D30...
- 結合續約行為的週期性分析
