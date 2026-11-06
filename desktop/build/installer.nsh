; Modo installer customisation (electron-builder NSIS include).
; Adds one software-style step after the install-folder page: the user chooses the sign-in
; password for this PC. No email, no account, no sign-up. The password is handed to the app
; through a file in AppData, which the app reads once on first launch and then deletes.
;
; Everything lives inside the customPageAfterChangeDir macro. electron-builder inserts that macro
; only in the installer (never the uninstaller) and only after the Modern UI library is loaded,
; so the page code can use MUI_HEADER_TEXT and the uninstaller pass never sees unused functions.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!macro customPageAfterChangeDir
  Var ModoPwDialog
  Var ModoPwField
  Var ModoPwConfirm

  Function ModoPwPageCreate
    !insertmacro MUI_HEADER_TEXT "Set your Modo password" "You'll use this password to open Modo on this computer."
    nsDialogs::Create 1018
    Pop $ModoPwDialog
    ${If} $ModoPwDialog == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 10u "Password"
    Pop $0
    ${NSD_CreatePassword} 0 12u 100% 14u ""
    Pop $ModoPwField
    ${NSD_CreateLabel} 0 36u 100% 10u "Confirm password"
    Pop $0
    ${NSD_CreatePassword} 0 48u 100% 14u ""
    Pop $ModoPwConfirm
    ${NSD_CreateLabel} 0 72u 100% 22u "At least 6 characters. No account or sign-up needed. You can change it later inside Modo."
    Pop $0

    ${NSD_SetFocus} $ModoPwField
    nsDialogs::Show
  FunctionEnd

  Function ModoPwPageLeave
    ${NSD_GetText} $ModoPwField $0
    ${NSD_GetText} $ModoPwConfirm $1
    StrLen $2 $0
    ${If} $2 < 6
      MessageBox MB_OK|MB_ICONEXCLAMATION "Use at least 6 characters."
      Abort
    ${EndIf}
    ${If} $0 != $1
      MessageBox MB_OK|MB_ICONEXCLAMATION "The two passwords don't match."
      Abort
    ${EndIf}

    CreateDirectory "$APPDATA\Modo"
    FileOpen $3 "$APPDATA\Modo\setup-password.txt" w
    FileWrite $3 $0
    FileClose $3
  FunctionEnd

  Page custom ModoPwPageCreate ModoPwPageLeave
!macroend
