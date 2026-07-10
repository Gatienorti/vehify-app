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
  // eslint-disable-next-line no-console
  console.log(`[fix-expo-swift] patched ${changed} file(s) for Xcode 26 / Swift 6`);
}
