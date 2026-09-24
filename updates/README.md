# DBY HOME update tiers

Ba cap do goi cap nhat duoc tao trong thu muc `updates\<version>`:

- `full`: bo cai `*-setup.exe`, portable ZIP, metadata va blockmap. Dung khi sua lon, thay doi Electron/runtime, hoac may dang loi nang.
- `standard`: `DBYHOME-<version>-standard.zip`, chua toan bo `resources/app` (compiled app). Nho hon bo cai va an toan cho thay doi code thong thuong.
- `quick`: `DBYHOME-<version>-quick.zip`, chi chua file compiled thay doi va manifest xoa file. Chi ap dung neu `fromVersion` trung dung phien ban dang cai.
- `manual`: `DBYHOME-<version>-setup.exe`, bo cai day du dung khi may khong nhan cap nhat tu GitHub.

Ung dung dang chay chi tu tai `quick`, `standard` hoac `patch` ZIP. Installer `.exe`
khong duoc tu dong tai de tranh tai goi 100 MB va lap update; dung installer cho lan cai
thu cong cuoi cung.

## Cach chay

- Update lon / cai lai: `updates\RELEASE-FULL.bat`
- Update code day du: `updates\RELEASE-STANDARD.bat` (standard ZIP + installer)
- Update rat nho theo dung phien ban lien truoc: `updates\RELEASE-QUICK.bat` (chi quick ZIP)

All release scripts upload to GitHub by default. Use `--local` only when you
intentionally want to create local artifacts without committing or publishing.

Only the current version directory is kept locally; older version directories
are removed after a new artifact is generated. Published GitHub Release assets
are not affected.

Quick update phai dung lien tuc theo `fromVersion`. Vi du quick v1.0.84 co the ap dung cho v1.0.83, khong ap dung truc tiep cho v1.0.82. Khi production bi lech phien ban, dung standard.
