; Modo installer customisation (electron-builder NSIS include).
; Adds one software-style step after the install-folder page: the user chooses the sign-in
; password for this PC. No email, no account, no sign-up. The password is handed to the app
; through a file in the user's AppData, which the app reads once on first launch and then deletes.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var ModoPwDialog
Var ModoPwField
Var ModoPwConfirm

Function ModoPwPageCreate
  nsDialogs::Create 1018
  Pop $ModoPwDialog
  ${If} $ModoPwDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Set the password you will use to open Modo on this PC."
  ${NSD_CreateLabel} 0 30u 100% 10u "Password"
  Pop $0
  ${NSD_CreatePassword} 0 42u 100% 14u ""
  Pop $ModoPwField
  ${NSD_CreateLabel} 0 66u 100% 10u "Confirm password"
  Pop $0
  ${NSD_CreatePassword} 0 78u 100% 14u ""
  Pop $ModoPwConfirm
  ${NSD_CreateLabel} 0 100u 100% 22u "Use at least 6 characters. You can change it later inside Modo."
  Pop $0

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

!macro customPageAfterChangeDir
  Page custom ModoPwPageCreate ModoPwPageLeave
!macroend
