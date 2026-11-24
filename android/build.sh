#!/usr/bin/env bash
# 素手归原创作台 · Android APK 构建脚本（无 Gradle）
# 前置条件：
#   1) JDK 17+，设置 JAVA_HOME
#   2) Android SDK，设置 ANDROID_HOME，并安装 platforms;android-34 与 build-tools;34.0.0
#   3) Windows 下项目路径请避开中文/空格（aapt2 对中文路径支持不佳）
set -euo pipefail

PROJ="$(cd "$(dirname "$0")" && pwd)"
: "${JAVA_HOME:?请设置 JAVA_HOME}"
: "${ANDROID_HOME:?请设置 ANDROID_HOME}"

JAVAC="$JAVA_HOME/bin/javac"
JAR="$JAVA_HOME/bin/jar"
KEYTOOL="$JAVA_HOME/bin/keytool"
BT=$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -1)
PLATFORM="$ANDROID_HOME/platforms/android-34/android.jar"
AAPT2="${BT}aapt2.exe"; D8="${BT}d8.bat"; ZIPALIGN="${BT}zipalign.exe"; APKSIGNER="${BT}apksigner.bat"
if [ "$(uname -s | cut -c1-5)" != "MINGW" ]; then
  AAPT2="${BT}aapt2"; D8="${BT}d8"; ZIPALIGN="${BT}zipalign"; APKSIGNER="${BT}apksigner"
fi
[ -f "$PLATFORM" ] || { echo "缺少 platforms;android-34，请用 sdkmanager 安装"; exit 1; }

WORK="$PROJ/.build"
APP="$PROJ/app-release.apk"
rm -rf "$WORK"; mkdir -p "$WORK/gen" "$WORK/classes" "$WORK/dex"
cp "$PROJ/AndroidManifest.xml" "$WORK/"
cp -r "$PROJ/res" "$PROJ/src" "$PROJ/assets" "$WORK/"

"$AAPT2" compile --dir "$WORK/res" -o "$WORK/res.zip"
"$AAPT2" link -o "$WORK/base.apk" -I "$PLATFORM" --manifest "$WORK/AndroidManifest.xml" \
  --java "$WORK/gen" --min-sdk-version 24 --target-sdk-version 34 "$WORK/res.zip"

# assets 必须以正斜杠写入 zip，否则 Android 找不到文件
(cd "$WORK" && find assets -type f > "$WORK/assets.txt")
(cd "$WORK" && "$JAR" uf "$WORK/base.apk" @"$WORK/assets.txt")

"$JAVAC" -encoding UTF-8 -source 8 -target 8 -cp "$PLATFORM" -d "$WORK/classes" \
  "$WORK/gen/com/sushou/guiyuan/R.java" "$WORK/src/com/sushou/guiyuan/MainActivity.java" \
  2>&1 | grep -v "bootstrap class path" || true

(cd "$WORK/classes" && find . -name '*.class' | sed 's|^\./||' > "$WORK/classes.txt")
(cd "$WORK/classes" && "$D8" --lib "$PLATFORM" --min-api 24 --output "$WORK/dex" @"$WORK/classes.txt")
(cd "$WORK/dex" && "$JAR" uf "$WORK/base.apk" classes.dex)

"$ZIPALIGN" -f -p 4 "$WORK/base.apk" "$WORK/aligned.apk"

KS="$PROJ/release.keystore"
if [ ! -f "$KS" ]; then
  "$KEYTOOL" -genkeypair -v -keystore "$KS" -alias sushou -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass CHANGE_ME -keypass CHANGE_ME \
    -dname "CN=SushouGuiyuan, OU=Studio, O=Sushou, L=CN, ST=CN, C=CN" >/dev/null 2>&1
fi
"$APKSIGNER" sign --ks "$KS" --ks-key-alias sushou \
  --ks-pass pass:CHANGE_ME --key-pass pass:CHANGE_ME \
  --out "$APP" "$WORK/aligned.apk"
"$APKSIGNER" verify "$APP"
echo "APK READY: $APP"
