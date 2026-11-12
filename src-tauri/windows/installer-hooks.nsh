; Installer hooks of Digitceed AI (a modified version of Locally Uncensored).
;
; (Digitceed AI: the macro that removed an install under an earlier product
; name is gone. This build has no earlier name, and it must never touch an
; installed copy of the upstream app.)

; Free the bundled engine before the new files land. Live in EVERY build.
;
; A user, 2026-08-10: the update stopped at "Error opening file for
; writing: D:\Digitceed AI\llama-server.exe" with Abort, Retry, Ignore.
; The sidecar is our own (externalBin), and Windows locks a running
; image against writes, so the copy cannot succeed while it lives. Rust kills it
; on every orderly exit (state.rs shutdown_subprocesses), which is exactly why
; the installer never accounted for the cases that are left: the app still open
; during a manual install, or a sidecar orphaned by a crash. Retry then loops on
; the same lock and Ignore is worse than it looks, it leaves the new app running
; last release's engine.
;
; The test is the write itself, not a process list: if the file opens for
; writing, nothing holds it and we touch nothing.
;
; And when something does hold it, only OUR copy may die. `taskkill /F /T /IM`
; matches by image name for the whole session, so the first version of this
; hook also hard-killed a llama.cpp server the user had started themselves,
; mid-generation, during an update they never watched. llama.cpp is one of the
; backends this app detects, so having one running is normal, and everywhere
; else the app leaves a stranger alone: an engine start that meets one on its
; port refuses and asks the user to quit it (commands/engine.rs), and every
; kill in Rust goes by PID. The installer was the single place that swung at a
; name. It now ends exactly the processes whose image IS the file about to be
; overwritten. The path comes from WMI rather than Get-Process because the
; installer is 32 bit and .NET cannot read MainModule of a 64 bit process from
; there, which is what our own engine is.
;
; Last resort, when the lock outlives the four rounds because someone else
; holds it (a scanner, a backup agent, a process this user may not touch):
; Windows refuses to WRITE a locked image but still allows it to be RENAMED, so
; the old engine moves aside and the update lands. That is the whole point of
; the hook, and it beats the stock dialog where Retry loops on the same lock
; and Ignore leaves the new app running last release's engine. The leftover is
; swept at the start of the next install.
; The file name is a parameter since GitHub #120 renamed the sidecar to
; lu-llama-server.exe. An update coming from 2.6.6 or older still finds the old
; llama-server.exe in the install folder, possibly with a live process on it,
; so both names get freed and the one we no longer ship gets swept away.
!macro LU_FREE_SIDECAR EXE
  Push $R3
  Push $R4
  Push $R9
  Delete "$INSTDIR\${EXE}.old"
  StrCpy $R4 0
  ${Do}
    ${IfNot} ${FileExists} "$INSTDIR\${EXE}"
      ${ExitDo}
    ${EndIf}
    ClearErrors
    FileOpen $R3 "$INSTDIR\${EXE}" a
    ${IfNot} ${Errors}
      FileClose $R3
      ${ExitDo}
    ${EndIf}
    ${If} $R4 >= 4
      ; Still locked after four rounds, so it is not our engine holding it.
      ; Move it out of the way instead of spinning here or failing the copy.
      Rename "$INSTDIR\${EXE}" "$INSTDIR\${EXE}.old"
      ${ExitDo}
    ${EndIf}
    IntOp $R4 $R4 + 1
    nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -eq '$INSTDIR\${EXE}' } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force }"`
    Pop $R9
    Sleep 800
  ${Loop}
  Pop $R9
  Pop $R4
  Pop $R3
!macroend

; What 2.6.6 and older left behind. We do not ship this file any more, so it is
; freed for the same reason (a live orphan would keep answering on our port)
; and then removed rather than left as a 3 GB stranger in the install folder.
!macro LU_SWEEP_OLD_SIDECAR
  !insertmacro LU_FREE_SIDECAR "llama-server.exe"
  Delete "$INSTDIR\llama-server.exe"
  Delete "$INSTDIR\llama-server.exe.old"
!macroend

; The old frontend bundle piles up forever, and nothing ever swept it.
;
; Measured on the Windows box on 2026-09-04, in an install folder that has
; taken every update since April:
;
;   _up_\dist\assets        1170 files      131,9 MB
;   of which from the build installed that morning   266
;   oldest file                                      2026-04-15
;
; So roughly 900 dead files and 110 MB that every updating user carries around.
; The cause is the pair of habits meeting: Vite puts a content hash in every
; chunk name, so a new build never overwrites the old chunk, it lands beside
; it, and NSIS only ever COPIES what the package brings, it never removes what
; the previous version left. Neither half is wrong on its own. Together they
; grow the install without limit.
;
; The whole folder belongs to the installer. There is nothing of the user's in
; it: chats, settings, models and outputs live under the app data folders, and
; the bundle identifier that names them never changes. So it can go wholesale
; and be laid down fresh.
;
; The check on index.html is not for us, it is for a wrong $INSTDIR. A
; recursive delete is the one instruction in this file that cannot be taken
; back, and it should only ever run where our own frontend really lies.
;
; A file that is still locked is skipped by RMDir without an error, which is
; the right outcome: one leftover chunk is harmless, and the next install
; sweeps it.
!macro LU_SWEEP_OLD_FRONTEND
  ${If} ${FileExists} "$INSTDIR\_up_\dist\index.html"
    RMDir /r "$INSTDIR\_up_\dist"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro LU_FREE_SIDECAR "lu-llama-server.exe"
  !insertmacro LU_SWEEP_OLD_SIDECAR
  !insertmacro LU_SWEEP_OLD_FRONTEND
!macroend

; The window needs the Microsoft Edge WebView2 Runtime, and it has to be there
; for the Windows user who starts Digitceed AI, not just somewhere on the machine.
;
; 2026-11-03, a fresh Windows install: right after setup Digitceed AI opened only
; Tauri's "Could not find the WebView2 Runtime ... You may have it installed
; on another user account, but it is not available for this one". The stock
; WebView2 section (tauri-bundler 2.11, installer.nsi) has the gaps that let
; that happen without a word:
;   - it counts the runtime as present as soon as a "pv" value exists, and
;     EdgeUpdate leaves "0.0.0.0" behind after a broken or removed runtime;
;     Microsoft's own detection rule says that value means not installed;
;   - it also counts a per-user runtime in HKCU, and an install for all users
;     that a standard user starts with an admin's password runs under the
;     admin's account, so it reads the admin's HKCU and skips the install for
;     the person who will actually use the app;
;   - it skips everything on an update (/UPDATE);
;   - with the default downloadBootstrapper a blocked download ends the setup.
; The bootstrapper is now embedded (bundle.windows.webviewInstallMode), and
; this check runs after the stock section with Microsoft's rule. When it still
; finds no runtime it runs the same bootstrapper itself.
;
; A copy of the bootstrapper stays in the install folder: the app runs it at
; start (webview2_check.rs) for a Windows user who has no runtime even though
; the install went fine, the "another user account" case. NSIS stores the
; identical file once, so the copy costs no installer size.
!macro LU_READ_WEBVIEW2 ROOT KEY
  ${If} $R1 == ""
    ReadRegStr $R1 ${ROOT} "${KEY}\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
    ${If} $R1 == "0.0.0.0"
      StrCpy $R1 ""
    ${EndIf}
  ${EndIf}
!macroend

!macro LU_ENSURE_WEBVIEW2
  Push $R1
  Push $R2
  StrCpy $R1 ""
  !insertmacro LU_READ_WEBVIEW2 HKLM "SOFTWARE\WOW6432Node"
  !insertmacro LU_READ_WEBVIEW2 HKLM "SOFTWARE"
  ; A per-user runtime counts only for a per-user install, the one case where
  ; this HKCU belongs to the person who starts the app.
  StrCpy $R2 "CurrentUser"
  !if "${INSTALLMODE}" == "perMachine"
    StrCpy $R2 "AllUsers"
  !else if "${INSTALLMODE}" == "both"
    StrCpy $R2 $MultiUser.InstallMode
  !endif
  ${If} $R2 != "AllUsers"
    !insertmacro LU_READ_WEBVIEW2 HKCU "SOFTWARE"
  ${EndIf}

  !if "${INSTALLWEBVIEW2MODE}" == "embedBootstrapper"
    File "/oname=$INSTDIR\MicrosoftEdgeWebview2Setup.exe" "${WEBVIEW2BOOTSTRAPPERPATH}"
    ${If} $R1 == ""
      DetailPrint "$(installingWebview2)"
      ExecWait '"$INSTDIR\MicrosoftEdgeWebview2Setup.exe" ${WEBVIEW2INSTALLERARGS} /install' $R2
      ${If} $R2 = 0
        DetailPrint "$(webview2InstallSuccess)"
      ${Else}
        DetailPrint "$(webview2InstallError)"
        ; Not an abort: Digitceed AI itself is installed fine, and at its start it
        ; offers the runtime again with Microsoft's download page as the
        ; fallback. Silent updates show nothing here.
        ${IfNot} ${Silent}
          MessageBox MB_OK|MB_ICONEXCLAMATION "Digitceed AI is installed, but the Microsoft Edge WebView2 Runtime it needs for its window could not be installed (code $R2).$\r$\n$\r$\nDigitceed AI offers it again when it starts. You can also get it from Microsoft:$\r$\nhttps://developer.microsoft.com/microsoft-edge/webview2/"
        ${EndIf}
      ${EndIf}
    ${EndIf}
  !endif
  Pop $R2
  Pop $R1
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro LU_ENSURE_WEBVIEW2
!macroend

; The stock uninstaller removes only the files it copied itself and then the
; folder if it is empty, so the bootstrapper copy above would keep it alive.
!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\MicrosoftEdgeWebview2Setup.exe"
!macroend
