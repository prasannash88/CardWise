#!/usr/bin/env bash
# Installs the APK on the emulator, launches it, and reports crashes as workflow annotations.
set -u
PKG=com.cardwise.app
adb install -r -g app-release.apk || { echo "::error title=install failed::adb install failed"; exit 1; }
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1
sleep 40
adb logcat -d > logcat.txt
adb exec-out screencap -p > screen.png || true

if adb shell pidof "$PKG" > /dev/null; then
  echo "::notice title=app running::$PKG is still running after 40s"
  ALIVE=1
else
  ALIVE=0
fi

# Crash details: Java/Kotlin fatal exceptions, JS errors, native crashes.
grep -E "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|ReactNative|Hermes|libc.*Fatal|DEBUG +:|Exception|Error" logcat.txt \
  | grep -v -E "eglCodecCommon|chatty|GoogleApiManager|Finsky|GmsClient" | head -150 > crash.txt || true
msg=$(sed -e 's/%/%25/g' crash.txt | awk '{printf "%s%%0A", $0}' | cut -c1-60000)
if [ -s crash.txt ]; then
  echo "::warning title=logcat (alive=$ALIVE)::$msg"
fi
[ "$ALIVE" = 1 ] || { echo "::error title=app not running::$PKG exited within 40s"; exit 1; }

# Self-test page: native PDF unlock, SMS module, SQLite and the Claude API path.
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d "cardwise://selftest" "$PKG"
for _ in $(seq 1 30); do
  sleep 2
  adb logcat -d -s ReactNativeJS:V | grep -q "CARDWISE_SELFTEST DONE" && break
done
adb logcat -d > selftest-logcat.txt
grep -o "CARDWISE_SELFTEST.*" selftest-logcat.txt > selftest.txt || true
st=$(sed -e 's/%/%25/g' selftest.txt | awk '{printf "%s%%0A", $0}')
if grep -q "DONE ALL_PASS" selftest.txt; then
  echo "::notice title=selftest passed::$st"
else
  extra=$(grep -E "ReactNativeJS|FATAL|AndroidRuntime" selftest-logcat.txt | tail -40 | sed -e 's/%/%25/g' | awk '{printf "%s%%0A", $0}' | cut -c1-30000)
  echo "::error title=selftest failed::$st%0A$extra"
  exit 1
fi
