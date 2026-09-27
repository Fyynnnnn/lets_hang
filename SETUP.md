# PartyLink 設定說明

## 1. 建立本機設定檔

在專案根目錄 `party-invite-platform` 執行：

```powershell
Copy-Item .env.example .env
```

接著用 VS Code 開啟 `.env`。目前地點搜尋使用免費的 OpenStreetMap/Nominatim，不需要 Google Maps API Key。`.env` 不要上傳到 GitHub。

## 2. 地點與天氣

活動地點搜尋使用免費的 OpenStreetMap/Nominatim，選取後保存地址與座標；邀請頁仍可用 Google Maps 網頁連結開啟地點，不需要 Google API Key。天氣則使用座標與活動日期查詢 Open-Meteo。

活動註冊需要姓名、暱稱、電子郵件與密碼，不使用 Google 帳號登入。

## 4. 啟動

每次修改 `.env` 後都要重新啟動伺服器：

```powershell
npm start
```

開啟：<http://localhost:3000/>

## 5. 安全提醒

- 不要把 `.env` 或私人設定貼到聊天或 GitHub。
