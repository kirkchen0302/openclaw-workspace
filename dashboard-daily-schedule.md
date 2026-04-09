# Dashboard 每日排程

## 目前做法
使用本機 macOS `launchd` 每天自動執行：

- `scripts/run_daily_dashboard_updates.sh`

這支腳本會：
1. 更新 HYVS / MAVS dashboard
2. 更新 Audience dashboard
3. 若有變更則自動 `git commit` + `git push`

## 實際安裝位置
- LaunchAgent: `~/Library/LaunchAgents/com.kirk.dashboard.daily-update.plist`
- Log: `~/Users/kirk/.openclaw/workspace/logs/daily-dashboard-update.log`

## 預設時間
- 每天 **09:00** 執行

## 手動測試
```bash
bash /Users/kirk/.openclaw/workspace/scripts/run_daily_dashboard_updates.sh
```

## 查看排程是否存在
```bash
launchctl list | grep dashboard.daily-update
```

## 重新載入排程
```bash
launchctl unload ~/Library/LaunchAgents/com.kirk.dashboard.daily-update.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.kirk.dashboard.daily-update.plist
```

## 常見問題
### 1. 沒有任何更新
檢查：
- `logs/daily-dashboard-update.log`
- `git diff --cached --quiet` 是否判定無變更

### 2. BigQuery / Google 認證失敗
檢查：
- `/Users/kirk/.openclaw/workspace/.gcp/adc.json`

### 3. push 失敗
檢查：
- 本機 git auth / remote 權限

### 4. Audience script 重複 commit
目前已透過 `--skip-git` 避免，由 wrapper script 統一 commit / push。
