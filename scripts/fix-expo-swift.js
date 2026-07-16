/**
 * Postinstall fix: Expo SDK 57's `expo-modules-jsi` Swift code doesn't compile
 * under Xcode 26 / Swift 6 (`weak let` and mutable stored props in `Sendable`
 * classes). This re-applies the minimal source fixes after every install so the
 * iOS build keeps working. Safe/idempotent — no-ops once patched or if the
 * package is absent. Remove when Expo ships an SDK that compiles under Xcode 26.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI');
if (!fs.existsSync(root)) process.exit(0);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith('.swift')) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(root)) {
  let src = fs.readFileSync(file, 'utf8');
  const before = src;

  // 1) weak let -> weak var (weak refs must be mutable)
  src = src.replace(/weak let /g, 'weak var ');
  // 2) mutable Sendable classes -> @unchecked (skip if already @unchecked)
  src = src.replace(/: Sendable \{/g, ': @unchecked Sendable {');
  src = src.replace(/, Sendable \{/g, ', @unchecked Sendable {');
  // 3) protocols can't be @unchecked — revert those
  src = src.replace(/(protocol [^\n]*?)@unchecked Sendable/g, '$1Sendable');
  // 4) classes that conform to Sendable only via a parent protocol need it explicit
  src = src.replace(
    'public final class JavaScriptValue: JavaScriptType, Equatable, Escapable {',
    'public final class JavaScriptValue: JavaScriptType, Equatable, Escapable, @unchecked Sendable {',
  );
  src = src.replace(
    'public final class JavaScriptPropNameID: JavaScriptType {',
    'public final class JavaScriptPropNameID: JavaScriptType, @unchecked Sendable {',
  );

  if (src !== before) {
    fs.writeFileSync(file, src);
    changed += 1;
  }
}

if (changed > 0) {
  console.log(`[fix-expo-swift] patched ${changed} file(s) for Xcode 26 / Swift 6`);
}

// ── react-native-mlkit-ocr: jcenter() was removed in modern Gradle ──
// The library's android/build.gradle still points at it, which fails the
// Android release build. Swap for mavenCentral(). Idempotent; remove if the
// package ever ships an update.
const mlkitGradle = path.join(
  __dirname, '..', 'node_modules', 'react-native-mlkit-ocr', 'android', 'build.gradle',
);
if (fs.existsSync(mlkitGradle)) {
  const src = fs.readFileSync(mlkitGradle, 'utf8');
  if (src.includes('jcenter()')) {
    fs.writeFileSync(mlkitGradle, src.replace(/jcenter\(\)/g, 'mavenCentral()'));
    console.log('[fix-expo-swift] mlkit-ocr: jcenter() -> mavenCentral()');
  }
}

// ── react-native-mlkit-ocr iOS: GoogleMLKit 2.6.0 (2021) pins
// GTMSessionFetcher ~>1.1, which clashes with the Google Sign-In SDK (needs
// 3.x). Bump to a current GoogleMLKit and adapt the one API call that changed
// (the no-arg +textRecognizer was replaced by +textRecognizerWithOptions:).
const mlkitPodspec = path.join(
  __dirname, '..', 'node_modules', 'react-native-mlkit-ocr', 'react-native-mlkit-ocr.podspec',
);
if (fs.existsSync(mlkitPodspec)) {
  const src = fs.readFileSync(mlkitPodspec, 'utf8');
  if (src.includes('"GoogleMLKit/TextRecognition", "2.6.0"')) {
    fs.writeFileSync(
      mlkitPodspec,
      src.replace('"GoogleMLKit/TextRecognition", "2.6.0"', '"GoogleMLKit/TextRecognition", "~> 7.0"'),
    );
    console.log('[fix-expo-swift] mlkit-ocr: GoogleMLKit 2.6.0 -> ~>7.0');
  }
}
const mlkitObjc = path.join(
  __dirname, '..', 'node_modules', 'react-native-mlkit-ocr', 'ios', 'MlkitOcr.m',
);
if (fs.existsSync(mlkitObjc)) {
  const src = fs.readFileSync(mlkitObjc, 'utf8');
  if (src.includes('[MLKTextRecognizer textRecognizer]')) {
    fs.writeFileSync(
      mlkitObjc,
      src.replace(
        /\[MLKTextRecognizer textRecognizer\]/g,
        '[MLKTextRecognizer textRecognizerWithOptions:[[MLKTextRecognitionOptions alloc] init]]',
      ),
    );
    console.log('[fix-expo-swift] mlkit-ocr: textRecognizer -> textRecognizerWithOptions:');
  }
}
