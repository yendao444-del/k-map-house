; Recreate the desktop shortcut with an explicit icon file. This avoids stale
; Electron shortcut icons that Windows can retain after an in-place install.
!macro customInstall
  Delete "$DESKTOP\DBY HOME.lnk"
  CreateShortCut "$DESKTOP\DBY HOME.lnk" "$appExe" "" "$INSTDIR\DBY HOME.ico" 0 "" "" "DBY HOME"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
