# DBY HOME update tiers

Ba cap do goi cap nhat duoc tao trong thu muc `updates\<version>`:

- `full`: bo cai `*-setup.exe`, portable ZIP, metadata va blockmap. Dung khi sua lon, thay doi Electron/runtime, hoac may dang loi nang.
- `standard`: `DBYHOME-<version>-standard.zip`, chua toan bo `resources/app` (compiled app). Nho hon bo cai va an toan cho thay doi code thong thuong.
- `quick`: `DBYHOME-<version>-quick.zip`, chi chua file compiled thay doi va manifest xoa file. Chi ap dung neu `fromVersion` trung dung phien ban dang cai.

## Cach chay

- Update lon: `updates\RELEASE-FULL.bat`
- Update code thong thuong: `updates\RELEASE-STANDARD.bat`
- Update rat nho: `updates\RELEASE-QUICK.bat`

All release scripts upload to GitHub by default. Use `--local` only when you
intentionally want to create local artifacts without committing or publishing.

`RELEASE.bat --github` tao ca ba artifact cho cung mot release. Updater trong app doc manifest va tu chon `quick` neu tuong thich, neu khong thi chon `standard`, cuoi cung moi dung installer.
