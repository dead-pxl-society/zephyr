; zephyr-notify registers these under HKCU each time the app starts, so that notification
; buttons can launch it. They outlast the app unless removed here. An update that runs this
; is harmless, because the next launch writes them again.
!macro NSIS_HOOK_POSTUNINSTALL
  Push $0
  ReadRegStr $0 HKCU "Software\Classes\AppUserModelId\${BUNDLEID}" "CustomActivator"
  StrCmp $0 "" +2
    DeleteRegKey HKCU "Software\Classes\CLSID\$0"
  DeleteRegKey HKCU "Software\Classes\AppUserModelId\${BUNDLEID}"
  Pop $0
!macroend
